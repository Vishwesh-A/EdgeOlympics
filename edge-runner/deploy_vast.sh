#!/usr/bin/env bash
# Run from the copied repository on the current Vast instance.
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER_DIR="$APP_ROOT/edge-runner"
ENV_FILE="$APP_ROOT/.env"
CERT_DIR="$APP_ROOT/tls"
PUBLIC_IP="${PUBLIC_IPADDR:?Vast must supply PUBLIC_IPADDR}"

python3 -m venv "$APP_ROOT/.venv"
"$APP_ROOT/.venv/bin/pip" install -r "$RUNNER_DIR/requirements-control.txt"

if [[ ! -f "$ENV_FILE" ]]; then
  APP_ROOT="$APP_ROOT" python3 - <<'PY'
import os
import secrets
from pathlib import Path
env_file = Path(os.environ["APP_ROOT"]) / ".env"
with env_file.open("w", encoding="utf-8") as out:
    out.write("# Set SUPABASE_URL and SUPABASE_SECRET_KEY before starting jobs.\n")
    for index in range(1, 5):
        out.write(f"PI_TOKEN_{index:02d}={secrets.token_urlsafe(32)}\n")
env_file.chmod(0o600)
PY
fi

mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT_DIR/cert.pem" ]]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 \
    -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" \
    -subj "/CN=$PUBLIC_IP" -addext "subjectAltName=IP:$PUBLIC_IP" >/dev/null 2>&1
  chmod 600 "$CERT_DIR/key.pem"
fi

cat > /opt/supervisor-scripts/edge-control.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
set -a
source "$ENV_FILE"
set +a
cd "$RUNNER_DIR"
exec "$APP_ROOT/.venv/bin/uvicorn" control_api:app --host 0.0.0.0 --port 10100 \
  --ssl-keyfile "$CERT_DIR/key.pem" --ssl-certfile "$CERT_DIR/cert.pem"
EOF
chmod 755 /opt/supervisor-scripts/edge-control.sh

cat > /opt/supervisor-scripts/edge-prelim.sh <<EOF
#!/usr/bin/env bash
set -euo pipefail
set -a
source "$ENV_FILE"
set +a
cd "$RUNNER_DIR"
exec "$APP_ROOT/.venv/bin/python" main.py --prelim
EOF
chmod 755 /opt/supervisor-scripts/edge-prelim.sh

cat > /etc/supervisor/conf.d/edge-control.conf <<'EOF'
[program:edge-control]
command=/opt/supervisor-scripts/edge-control.sh
autostart=true
autorestart=unexpected
stdout_logfile=/var/log/portal/edge-control.log
redirect_stderr=true
stdout_logfile_maxbytes=0
EOF

cat > /etc/supervisor/conf.d/edge-prelim.conf <<'EOF'
[program:edge-prelim]
command=/opt/supervisor-scripts/edge-prelim.sh
autostart=false
autorestart=unexpected
stdout_logfile=/var/log/portal/edge-prelim.log
redirect_stderr=true
stdout_logfile_maxbytes=0
EOF

supervisorctl reread
supervisorctl update
supervisorctl status edge-control edge-prelim || true
echo "Control API: https://$PUBLIC_IP:${VAST_TCP_PORT_10100}"
echo "Pi CA certificate: $CERT_DIR/cert.pem"
echo "Private env file: $ENV_FILE"
