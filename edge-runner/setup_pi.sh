#!/usr/bin/env bash
# Run on a 64-bit Raspberry Pi OS device after copying edge-runner and cert.pem.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash setup_pi.sh pi-01 /path/to/cert.pem" >&2
  exit 1
fi

PI_ID="${1:-}"
CERT_SOURCE="${2:-}"
if [[ ! "$PI_ID" =~ ^pi-0[1-4]$ || ! -f "$CERT_SOURCE" ]]; then
  echo "Usage: sudo bash setup_pi.sh pi-01 /path/to/cert.pem" >&2
  exit 1
fi
if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "A 64-bit Raspberry Pi OS image (aarch64) is required." >&2
  exit 1
fi
if ! command -v vcgencmd >/dev/null 2>&1; then
  echo "vcgencmd is missing; install Raspberry Pi firmware tools before setup." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
read -r -p "Control API URL [https://158.181.52.18:44298]: " API_URL
API_URL="${API_URL:-https://158.181.52.18:44298}"
if [[ "$API_URL" != https://* ]]; then
  echo "The control API URL must use HTTPS." >&2
  exit 1
fi
read -r -s -p "Private token for $PI_ID: " API_TOKEN
echo
if [[ -z "$API_TOKEN" ]]; then
  echo "A Pi token is required." >&2
  exit 1
fi

apt-get update
apt-get install -y python3-venv
if ! id edgerunner >/dev/null 2>&1; then
  useradd -r -s /usr/sbin/nologin edgerunner
fi
if getent group video >/dev/null; then
  usermod -aG video edgerunner
fi
if ! runuser -u edgerunner -- vcgencmd measure_temp >/dev/null; then
  echo "The edgerunner account cannot read Pi temperature; check vcgencmd access." >&2
  exit 1
fi
install -d -m 750 -o edgerunner -g edgerunner /opt/edge-runner /opt/dataset
cp -a "$SCRIPT_DIR/." /opt/edge-runner/
install -m 644 "$CERT_SOURCE" /opt/edge-runner/cert.pem
python3 -m venv /opt/edge-runner/venv
/opt/edge-runner/venv/bin/pip install -r /opt/edge-runner/requirements-pi.txt

umask 077
cat > /opt/edge-runner/.env <<EOF
PI_ID=$PI_ID
PI_API_URL=$API_URL
PI_API_TOKEN=$API_TOKEN
REQUESTS_CA_BUNDLE=/opt/edge-runner/cert.pem
DATASET_DIR=/opt/dataset
INPUT_SHAPE=1,128,128,1
OUTPUT_SHAPE=1,8
EOF
unset API_TOKEN
chown -R edgerunner:edgerunner /opt/edge-runner /opt/dataset
chmod 600 /opt/edge-runner/.env
cd /opt/edge-runner
runuser -u edgerunner -- /opt/edge-runner/venv/bin/python - <<'PY'
from api_client import PiApiClient
from config import PI_API_URL, PI_API_TOKEN, PI_ID
client = PiApiClient(PI_API_URL, PI_API_TOKEN, PI_ID)
print("Authenticated with control API as", client.whoami())
PY
install -m 644 /opt/edge-runner/edge-runner.service /etc/systemd/system/edge-runner.service
systemctl daemon-reload
systemctl enable edge-runner
echo "Installed $PI_ID. Place the final data.npz and manifest.sha256 in /opt/dataset,"
echo "chown both to edgerunner, then run: sudo systemctl start edge-runner"
