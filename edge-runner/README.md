# Edge Olympics benchmark workers

The browser uploads `.tflite` files to Supabase Storage and inserts a submission.
The Vast preliminary worker validates each file and queues it. Four Pi workers
request one job at a time from the Vast control API, download their assigned
model, benchmark it locally, and report results. Only Vast holds the Supabase
service-role key. The Pis require outbound HTTPS; inbound SSH is only for setup.

## Fixed model contract

- One grayscale image input with shape `[1, 128, 128, 1]`.
- One output with shape `[1, 8]`, containing scores for eight classes.
- File format: `.tflite`, at most 50 MiB.
- The Pi runs inference on its CPU. Current latency is median `invoke()` time
  after five warm-up samples; RAM is peak child-process RSS.
- The proposed weighted score is `100 × (w_accuracy × accuracy +
  w_latency × L/(L+latency_ms) + w_ram × R/(R+peak_ram_mb)) / sum(weights)`.
  Current defaults are 0.60/0.25/0.15, L=100 ms and R=256 MB. There is no
  accuracy cutoff. Calibrate L and R before the event and then
  publish/freeze the settings.

**Before participant release:** specify class order, image resizing/cropping,
pixel normalization, and whether float32/int8/uint8 models are all accepted.
Keep test images and labels private. Put the same `data.npz` (`x` array only)
on every Pi with a matching `manifest.sha256`; `x` must be `[N,128,128,1]`.
Keep the matching `labels.npy` on Vast only; labels must contain class IDs 0–7.
Each Pi returns one prediction per image, and Vast computes accuracy against
those labels after checking the dataset hash. The included
`make_dummy_dataset.py` produces synthetic data only for testing and must never
be used for event scores.

## Vast instance

Copy this repository to `/workspace/edge-olympics` on Vast, then run
`bash edge-runner/deploy_vast.sh`. It installs the control API, creates four
distinct private Pi tokens, and starts an HTTPS service on the existing Vast
port 10100. The generated TLS certificate is valid for two days and is pinned
on each Pi via `REQUESTS_CA_BUNDLE`. The Vast `/workspace` on this instance is
**not backed by a persistent volume**; retain the Git repository and secret
configuration elsewhere before recycling or destroying the instance.

Edit `/workspace/edge-olympics/.env` (mode 600) to add `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` from the Supabase project (a legacy
`SUPABASE_SERVICE_ROLE_KEY` also works). Then restart the API and
start the preliminary worker:

```sh
supervisorctl restart edge-control
supervisorctl start edge-prelim
supervisorctl status edge-control edge-prelim
```

Do not put the Supabase service-role key on a Pi or in this repository.
After finalizing the dataset, put `labels.npy` in a private directory on Vast,
set `LABELS_FILE` to its absolute path and `DATASET_SHA256` to the SHA-256 from
the Pi `manifest.sha256`, then restart `edge-control`. Keep `labels.npy` off the
Pis; distribute only `data.npz` and `manifest.sha256` to them.

## Raspberry Pi OS (64-bit) setup, repeated for pi-01 through pi-04

Confirm `uname -m` reports `aarch64` and give each Pi reliable power, internet,
and a unique `PI_ID`. Confirm `vcgencmd measure_temp` works; the worker refuses
real benchmarks when thermal telemetry is unavailable. Copy `edge-runner/`
and Vast's `tls/cert.pem` to the Pi.

For the initial install, run `sudo bash edge-runner/setup_pi.sh pi-01 /path/to/cert.pem`
from a copied checkout on the Pi. It prompts privately for that Pi's API token,
installs the Python runtime and systemd service, and leaves the service stopped
until the final dataset is in place. Repeat with the matching identity and token
on each device. It writes this private `/opt/edge-runner/.env` file:

```ini
PI_ID=pi-01
PI_API_URL=https://158.181.52.18:44298
PI_API_TOKEN=<matching private PI_TOKEN_01 from Vast>
REQUESTS_CA_BUNDLE=/opt/edge-runner/cert.pem
DATASET_DIR=/opt/dataset
INPUT_SHAPE=1,128,128,1
OUTPUT_SHAPE=1,8
```

Set `PI_API_URL` to the live URL printed by `deploy_vast.sh`; Vast's public port
may change if the instance changes. Install `edge-runner.service` under systemd
and start it after placing the final private dataset and manifest. Check
`journalctl -u edge-runner -f` for each worker. The service runs as the
unprivileged `edgerunner` account, not root.

## Local validation

```sh
python3 -m venv .venv
.venv/bin/pip install -r edge-runner/requirements-dev.txt
.venv/bin/python -m unittest discover edge-runner/tests
```
