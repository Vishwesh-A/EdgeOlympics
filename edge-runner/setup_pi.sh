#!/usr/bin/env bash
# Run on a 64-bit Raspberry Pi OS device after copying edge-runner and cert.pem.
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash setup_pi.sh pi-01 /path/to/cert.pem [api-url] [token-file]" >&2
  exit 1
fi

PI_ID="${1:-}"
CERT_SOURCE="${2:-}"
API_URL="${3:-}"
TOKEN_FILE="${4:-}"
if [[ ! "$PI_ID" =~ ^pi-0[1-4]$ || ! -f "$CERT_SOURCE" ]]; then
  echo "Usage: sudo bash setup_pi.sh pi-01 /path/to/cert.pem [api-url] [token-file]" >&2
  exit 1
fi
if [[ "$(uname -m)" != "aarch64" ]]; then
  echo "A Raspberry Pi OS image using a 64-bit kernel is required." >&2
  exit 1
fi
if ! command -v vcgencmd >/dev/null 2>&1; then
  echo "vcgencmd is missing; install Raspberry Pi firmware tools before setup." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -z "$API_URL" ]]; then
  read -r -p "Control API URL [https://158.181.52.18:44298]: " API_URL
fi
API_URL="${API_URL:-https://158.181.52.18:44298}"
if [[ "$API_URL" != https://* ]]; then
  echo "The control API URL must use HTTPS." >&2
  exit 1
fi
if [[ -n "$TOKEN_FILE" ]]; then
  if [[ ! -f "$TOKEN_FILE" ]]; then
    echo "Token file does not exist: $TOKEN_FILE" >&2
    exit 1
  fi
  API_TOKEN="$(<"$TOKEN_FILE")"
else
  read -r -s -p "Private token for $PI_ID: " API_TOKEN
  echo
fi
if [[ -z "$API_TOKEN" ]]; then
  echo "A Pi token is required." >&2
  exit 1
fi

apt-get update
PYTHON_BIN=python3
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements-pi.txt"
if [[ "$(dpkg --print-architecture)" == "armhf" ]]; then
  apt-get install -y build-essential curl libssl-dev zlib1g-dev libbz2-dev \
    libreadline-dev libsqlite3-dev libffi-dev liblzma-dev uuid-dev libopenblas0
  PYTHON_BIN=/opt/python3.11/bin/python3.11
  REQUIREMENTS_FILE="$SCRIPT_DIR/requirements-pi-armhf.txt"
  if [[ ! -x "$PYTHON_BIN" ]]; then
    BUILD_DIR="$(mktemp -d /tmp/edge-python-build.XXXXXX)"
    trap 'rm -rf -- "$BUILD_DIR"' EXIT
    curl -fsSL https://www.python.org/ftp/python/3.11.9/Python-3.11.9.tgz \
      -o "$BUILD_DIR/Python.tgz"
    tar -xzf "$BUILD_DIR/Python.tgz" -C "$BUILD_DIR"
    cd "$BUILD_DIR/Python-3.11.9"
    ./configure --prefix=/opt/python3.11 --with-ensurepip=install
    make -j"$(nproc)"
    make altinstall
    cd "$SCRIPT_DIR"
  fi
else
  apt-get install -y python3-venv
fi
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
if ! /opt/edge-runner/venv/bin/python -c \
    'import importlib.util as u; assert u.find_spec("tflite_runtime") or u.find_spec("ai_edge_litert")' \
    >/dev/null 2>&1; then
  "$PYTHON_BIN" -m venv --clear /opt/edge-runner/venv
  /opt/edge-runner/venv/bin/pip install -r "$REQUIREMENTS_FILE"
fi

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
if [[ -n "$TOKEN_FILE" ]]; then
  rm -f -- "$TOKEN_FILE"
fi
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
