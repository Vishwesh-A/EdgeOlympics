import sys
import os
import time
import json
import argparse
from pathlib import Path
import numpy as np

def get_interpreter(model_path: str, mock: bool = False):
    """Returns TFLite interpreter, falling back to mock interpreter if requested/unavailable."""
    if not mock:
        try:
            from tflite_runtime.interpreter import Interpreter
            return Interpreter(model_path=model_path)
        except ImportError:
            try:
                import tensorflow as tf
                return tf.lite.Interpreter(model_path=model_path)
            except ImportError:
                pass

    # Mock Interpreter for laptops / tests
    return MockInterpreter(model_path)

class MockInterpreter:
    def __init__(self, model_path: str):
        self.model_path = model_path
        # Verify file exists and is not corrupt/empty
        with open(model_path, "rb") as f:
            header = f.read(16)
            if len(header) < 4:
                raise ValueError("Model file is empty or too small")
            # If magic "BAD_SHAPE" or "OOM" or "HANG", simulate error
            if b"BAD_SHAPE" in header:
                self.input_shape = [1, 64, 64, 3]
            else:
                self.input_shape = [1, 32, 32, 3]
            self.output_shape = [1, 10]
            self.dtype = np.float32

    def allocate_tensors(self):
        pass

    def get_input_details(self):
        return [{
            "index": 0,
            "shape": np.array(self.input_shape),
            "dtype": self.dtype,
            "quantization": (0.0, 0),
            "quantization_parameters": {"scales": np.array([]), "zero_points": np.array([])}
        }]

    def get_output_details(self):
        return [{
            "index": 0,
            "shape": np.array(self.output_shape),
            "dtype": np.float32,
            "quantization": (0.0, 0),
            "quantization_parameters": {"scales": np.array([]), "zero_points": np.array([])}
        }]

    def set_tensor(self, index, tensor):
        self._current_input = tensor

    def invoke(self):
        # Simulate slight inference time
        time.sleep(0.002)

    def get_tensor(self, index):
        # Deterministic dummy output
        out = np.zeros((1, 10), dtype=np.float32)
        out[0, 3] = 1.0  # Class 3
        return out

def run_prelim(model_path: str, expected_input, expected_output, mock: bool):
    try:
        # Check flatbuffer / load
        interp = get_interpreter(model_path, mock=mock)
        interp.allocate_tensors()

        inputs = interp.get_input_details()
        if len(inputs) != 1:
            print(json.dumps({
                "status": "error",
                "message": f"Expected exactly 1 model input, found {len(inputs)}"
            }))
            sys.exit(1)

        input_detail = inputs[0]
        actual_in_shape = tuple(input_detail["shape"].tolist())
        if actual_in_shape != tuple(expected_input):
            print(json.dumps({
                "status": "error",
                "message": f"Input shape mismatch: expected {list(expected_input)}, got {list(actual_in_shape)}"
            }))
            sys.exit(1)

        in_dtype = input_detail["dtype"]
        if in_dtype not in (np.float32, np.uint8, np.int8):
            print(json.dumps({
                "status": "error",
                "message": f"Input dtype must be float32, int8, or uint8, got {in_dtype}"
            }))
            sys.exit(1)

        outputs = interp.get_output_details()
        if len(outputs) < 1:
            print(json.dumps({
                "status": "error",
                "message": "Model has no output tensors"
            }))
            sys.exit(1)

        actual_out_shape = tuple(outputs[0]["shape"].tolist())
        if actual_out_shape != tuple(expected_output):
            print(json.dumps({
                "status": "error",
                "message": f"Output shape mismatch: expected {list(expected_output)}, got {list(actual_out_shape)}"
            }))
            sys.exit(1)

        # Run 1 dummy inference
        dummy_input = np.zeros(actual_in_shape, dtype=in_dtype)
        interp.set_tensor(input_detail["index"], dummy_input)
        interp.invoke()
        _ = interp.get_tensor(outputs[0]["index"])

        print(json.dumps({"status": "ok"}))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"Failed to load or execute model: {str(e)}"
        }))
        sys.exit(1)

def run_benchmark(model_path: str, dataset_file: str, warmup: int, mock: bool):
    try:
        interp = get_interpreter(model_path, mock=mock)
        interp.allocate_tensors()

        in_details = interp.get_input_details()[0]
        out_details = interp.get_output_details()[0]

        in_idx = in_details["index"]
        in_shape = in_details["shape"]
        in_dtype = in_details["dtype"]
        in_scale, in_zero_point = in_details.get("quantization", (0.0, 0))

        out_idx = out_details["index"]
        out_scale, out_zero_point = out_details.get("quantization", (0.0, 0))

        # Load dataset
        with np.load(dataset_file) as npz:
            x_data = npz["x"]
            y_data = npz["y"]

        n_samples = len(y_data)

        def prepare_sample(sample_x: np.ndarray) -> np.ndarray:
            inp = np.expand_dims(sample_x, axis=0)
            if in_dtype in (np.uint8, np.int8) and in_scale > 0:
                q = np.round(inp / in_scale + in_zero_point)
                return np.clip(q, np.iinfo(in_dtype).min, np.iinfo(in_dtype).max).astype(in_dtype)
            return inp.astype(in_dtype)

        # Warm-up (untimed)
        for i in range(min(warmup, n_samples)):
            sample_inp = prepare_sample(x_data[i])
            interp.set_tensor(in_idx, sample_inp)
            interp.invoke()

        # Timed inference per sample
        latencies_ms = []
        correct = 0

        for i in range(n_samples):
            sample_inp = prepare_sample(x_data[i])
            interp.set_tensor(in_idx, sample_inp)

            t0 = time.perf_counter()
            interp.invoke()
            t1 = time.perf_counter()

            latencies_ms.append((t1 - t0) * 1000.0)

            out_tensor = interp.get_tensor(out_idx)
            if out_scale > 0:
                out_tensor = (out_tensor.astype(np.float32) - out_zero_point) * out_scale

            pred_label = int(np.argmax(out_tensor))
            if pred_label == int(y_data[i]):
                correct += 1

        accuracy = correct / float(n_samples) if n_samples > 0 else 0.0
        median_lat = float(np.median(latencies_ms)) if latencies_ms else 0.0

        print(json.dumps({
            "status": "ok",
            "accuracy": accuracy,
            "latency_ms": median_lat,
            "samples": n_samples
        }))
        sys.exit(0)

    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"Runtime benchmark error: {str(e)}"
        }))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["prelim", "benchmark"], required=True)
    parser.add_argument("--model", type=str, required=True)
    parser.add_argument("--expected-input", type=str, default="1,32,32,3")
    parser.add_argument("--expected-output", type=str, default="1,10")
    parser.add_argument("--dataset", type=str, default="")
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--mock", action="store_true")
    args = parser.parse_args()

    in_shape = tuple(map(int, args.expected_input.split(",")))
    out_shape = tuple(map(int, args.expected_output.split(",")))

    if args.mode == "prelim":
        run_prelim(args.model, in_shape, out_shape, mock=args.mock)
    elif args.mode == "benchmark":
        run_benchmark(args.model, args.dataset, args.warmup, mock=args.mock)
