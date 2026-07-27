#!/usr/bin/env bash
set -euo pipefail

install_dir="${HOME}/tools4care-storage-install"
config_dir="${HOME}/.config/tools4care-backup"
bin_dir="${HOME}/.local/bin"
systemd_dir="${HOME}/.config/systemd/user"
credentials_file="${install_dir}/rclone-storage.conf"

if [[ ! -r "$credentials_file" ]]; then
  echo "ERROR: no se recibió la configuración S3." >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker no está disponible para este usuario." >&2
  exit 1
fi
if ! command -v zstd >/dev/null || ! command -v gpg >/dev/null; then
  echo "ERROR: se necesitan zstd y gpg." >&2
  exit 1
fi

mkdir -p "$config_dir" "$bin_dir" "$systemd_dir"
install -m 600 "$credentials_file" "${config_dir}/rclone-storage.conf"
rm -f -- "$credentials_file"
install -m 700 "${install_dir}/home-storage-backup-runner.sh" \
  "${bin_dir}/tools4care-storage-backup"

cat >"${systemd_dir}/tools4care-storage-backup.service" <<EOF
[Unit]
Description=Respaldo cifrado de Supabase Storage para Tools4Care
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${bin_dir}/tools4care-storage-backup
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
TimeoutStartSec=4h
EOF

cat >"${systemd_dir}/tools4care-storage-backup.timer" <<'EOF'
[Unit]
Description=Ejecutar respaldo diario de Supabase Storage

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=10m
Unit=tools4care-storage-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now tools4care-storage-backup.timer

echo "Probando acceso S3 y creando el primer respaldo de Storage..."
if ! systemctl --user start tools4care-storage-backup.service; then
  echo "La instalación quedó creada, pero la prueba falló:"
  journalctl --user -u tools4care-storage-backup.service -n 100 --no-pager -o cat
  exit 1
fi
systemctl --user status tools4care-storage-backup.service --no-pager -l || true
systemctl --user list-timers tools4care-storage-backup.timer --no-pager
