import argparse
import hashlib
from pathlib import Path
import numpy as np

def generate_dataset(output_dir: Path, n_samples: int = 100):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    np.random.seed(42)
    x = np.random.uniform(0.0, 1.0, size=(n_samples, 128, 128, 1)).astype(np.float32)
    y = np.random.randint(0, 8, size=(n_samples,)).astype(np.int64)

    data_file = output_dir / "data.npz"
    np.savez_compressed(data_file, x=x)
    np.save(output_dir / "labels.npy", y)

    hasher = hashlib.sha256()
    with open(data_file, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    sha256_hash = hasher.hexdigest()

    manifest_file = output_dir / "manifest.sha256"
    with open(manifest_file, "w", encoding="utf-8") as f:
        f.write(f"{sha256_hash}  data.npz\n")

    print(f"Created dataset at {data_file} ({n_samples} samples, {data_file.stat().st_size / 1024:.1f} KB)")
    print(f"Manifest written: {manifest_file} -> {sha256_hash}")
    print(f"Test-only labels written to {output_dir / 'labels.npy'}; keep labels on Vast, not on Pis")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic dataset for Edge Olympics")
    parser.add_argument("--dir", type=str, default="/opt/dataset", help="Destination directory")
    parser.add_argument("--samples", type=int, default=100, help="Number of test samples")
    args = parser.parse_args()
    generate_dataset(Path(args.dir), args.samples)
