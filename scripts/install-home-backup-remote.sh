#!/usr/bin/env bash
set -euo pipefail
umask 077

project_ref_default="gvloygqbavibmpakzdma"
host_default="aws-0-us-east-2.pooler.supabase.com"
destination_default="/media/multimedia"
retention_default="45"

echo "Instalador del respaldo diario de Tools4Care"
echo "Los secretos se solicitarán sin mostrarlos en pantalla."
echo

read -r -p "Project ref de Supabase [${project_ref_default}]: " project_ref
project_ref=${project_ref:-$project_ref_default}
read -r -p "Host del Session Pooler [${host_default}]: " db_host
db_host=${db_host:-$host_default}
read -r -p "Puerto [5432]: " db_port
db_port=${db_port:-5432}
read -r -p "Base de datos [postgres]: " db_name
db_name=${db_name:-postgres}
read -r -p "Usuario [postgres.${project_ref}]: " db_user
db_user=${db_user:-postgres.${project_ref}}
read -r -p "Disco de destino [${destination_default}]: " backup_destination
backup_destination=${backup_destination:-$destination_default}
read -r -p "Días de retención [${retention_default}]: " retention_days
retention_days=${retention_days:-$retention_default}

if ! [[ "$db_port" =~ ^[0-9]+$ && "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "ERROR: puerto y retención deben ser números." >&2
  exit 1
fi
if ! mountpoint -q "$backup_destination" || [[ ! -w "$backup_destination" ]]; then
  echo "ERROR: ${backup_destination} debe estar montado y ser escribible." >&2
  exit 1
fi
if ! command -v docker >/dev/null || ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker no está disponible para $(id -un)." >&2
  exit 1
fi
if ! command -v gpg >/dev/null || ! command -v sha256sum >/dev/null; then
  echo "ERROR: se necesitan gpg y sha256sum." >&2
  exit 1
fi

while true; do
  read -r -s -p "Contraseña de la base de datos Supabase: " db_password
  echo
  read -r -s -p "Repítela: " db_password_confirmation
  echo
  [[ -n "$db_password" && "$db_password" == "$db_password_confirmation" ]] && break
  echo "Las contraseñas no coinciden; intenta nuevamente."
done

while true; do
  read -r -s -p "Crea una clave DIFERENTE para cifrar los respaldos: " encryption_password
  echo
  read -r -s -p "Repítela: " encryption_password_confirmation
  echo
  if [[ ${#encryption_password} -ge 16 && "$encryption_password" == "$encryption_password_confirmation" ]]; then
    break
  fi
  echo "La clave debe coincidir y tener al menos 16 caracteres."
done

config_dir="${HOME}/.config/tools4care-backup"
bin_dir="${HOME}/.local/bin"
systemd_dir="${HOME}/.config/systemd/user"
mkdir -p "$config_dir" "$bin_dir" "$systemd_dir"

escape_pgpass() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/:/\\:/g'
}

cat >"${config_dir}/backup.conf" <<EOF
BACKUP_DESTINATION=$(printf '%q' "$backup_destination")
DB_HOST=$(printf '%q' "$db_host")
DB_PORT=$(printf '%q' "$db_port")
DB_NAME=$(printf '%q' "$db_name")
DB_USER=$(printf '%q' "$db_user")
RETENTION_DAYS=$(printf '%q' "$retention_days")
EOF

printf '%s:%s:%s:%s:%s\n' \
  "$(escape_pgpass "$db_host")" \
  "$(escape_pgpass "$db_port")" \
  "$(escape_pgpass "$db_name")" \
  "$(escape_pgpass "$db_user")" \
  "$(escape_pgpass "$db_password")" >"${config_dir}/pgpass"
printf '%s\n' "$encryption_password" >"${config_dir}/encryption-passphrase"
chmod 600 "${config_dir}/backup.conf" "${config_dir}/pgpass" "${config_dir}/encryption-passphrase"
unset db_password db_password_confirmation encryption_password encryption_password_confirmation

install -m 700 "${HOME}/tools4care-backup-install/home-backup-runner.sh" \
  "${bin_dir}/tools4care-home-backup"

cat >"${systemd_dir}/tools4care-backup.service" <<EOF
[Unit]
Description=Respaldo cifrado diario de Tools4Care
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${bin_dir}/tools4care-home-backup
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7
TimeoutStartSec=2h
EOF

cat >"${systemd_dir}/tools4care-backup.timer" <<'EOF'
[Unit]
Description=Ejecutar respaldo diario de Tools4Care

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=10m
Unit=tools4care-backup.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload

linger_status=$(loginctl show-user "$(id -un)" -p Linger --value 2>/dev/null || echo no)
if [[ "$linger_status" != "yes" ]]; then
  echo
  echo "Se necesita habilitar el temporizador aun cuando cierres la sesión SSH."
  echo "El servidor puede solicitar ahora tu contraseña de sudo."
  sudo loginctl enable-linger "$(id -un)"
fi

systemctl --user enable --now tools4care-backup.timer

echo
echo "Probando ahora la conexión y creando el primer respaldo real..."
if systemctl --user start tools4care-backup.service; then
  systemctl --user status tools4care-backup.service --no-pager || true
  echo
  echo "INSTALACIÓN COMPLETA"
  echo "Próxima ejecución:"
  systemctl --user list-timers tools4care-backup.timer --no-pager
  echo
  echo "IMPORTANTE: guarda la clave de cifrado fuera de este servidor."
else
  echo
  echo "La instalación quedó creada, pero la prueba falló."
  echo "Diagnóstico:"
  journalctl --user -u tools4care-backup.service -n 80 --no-pager
  exit 1
fi
