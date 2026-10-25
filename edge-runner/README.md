# Edge Olympics — Edge Runner & Prelim Checker

Backend workers for the Edge Olympics benchmarking platform:
1. **Prelim Checker (`--prelim`)**: Validates submitted `.tflite` format, file size, tensor shapes, and executes a child-process dummy inference.
2. **Edge Pi Runner (`--runner`)**: Runs benchmarks on physical Raspberry Pi 4 hardware inside an isolated subprocess with thermal checks, RSS memory polling, timeout killing, and heartbeat tracking.

---

## 1. Quickstart (Laptop / Testing)

```bash
cd edge-runner
pip install -r requirements.txt

# Generate local test dataset
python make_dummy_dataset.py --dir /opt/dataset --samples 100

# Copy and configure .env
cp .env.example .env
# Edit .env with your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Run tests
python -m unittest discover tests

# Run prelim checker in mock mode
python main.py --prelim --mock

# Run edge runner in mock mode
python main.py --runner --mock
```

---

## 2. Raspberry Pi OS Lite Setup (Production)

### System Preparation
```bash
sudo apt-get update && sudo apt-get install -y python3-pip python3-venv libraspberrypi-bin

# Install TFLite Runtime on Debian/Pi OS
sudo apt-get install -y python3-tflite-runtime || pip install tflite-runtime
```

### User & Directories Setup
```bash
# Create dedicated unprivileged user
sudo useradd -r -s /bin/false edgerunner

# Deploy code
sudo mkdir -p /opt/edge-runner
sudo cp -r . /opt/edge-runner/
sudo chown -R edgerunner:edgerunner /opt/edge-runner

# Python virtual environment
cd /opt/edge-runner
sudo -u edgerunner python3 -m venv venv
sudo -u edgerunner ./venv/bin/pip install -r requirements.txt

# Dataset directory (readable only by edgerunner)
sudo mkdir -p /opt/dataset
sudo cp /path/to/data.npz /opt/dataset/
sudo cp /path/to/manifest.sha256 /opt/dataset/
sudo chown -R edgerunner:edgerunner /opt/dataset
sudo chmod 700 /opt/dataset
sudo chmod 600 /opt/dataset/*

# Secure .env file
sudo chown edgerunner:edgerunner /opt/edge-runner/.env
sudo chmod 600 /opt/edge-runner/.env
```

### Systemd Service Management
```bash
sudo cp /opt/edge-runner/edge-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable edge-runner
sudo systemctl start edge-runner

# Check status & logs
sudo systemctl status edge-runner
sudo journalctl -u edge-runner -f
```
