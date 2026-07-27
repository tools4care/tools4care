#!/usr/bin/env bash
set -euo pipefail
umask 077

config_dir="${HOME}/.config/tools4care-backup"
config_file="${config_dir}/backup.conf"
pgpass_file="${config_dir}/pgpass"
encryption_file="${config_dir}/encryption-passphrase"

if [[ ! -r "$config_file" || ! -r "$pgpass_file" || ! -r "$encryption_file" ]]; then
  echo "ERROR: falta la configuración privada en ${config_dir}" >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$config_file"

: "${BACKUP_DESTINATION:?BACKUP_DESTINATION no está configurado}"
: "${DB_HOST:?DB_HOST no está configurado}"
: "${DB_PORT:?DB_PORT no está configurado}"
: "${DB_NAME:?DB_NAME no está configurado}"
: "${DB_USER:?DB_USER no está configurado}"
: "${RETENTION_DAYS:?RETENTION_DAYS no está configurado}"

if ! mountpoint -q "$BACKUP_DESTINATION"; then
  echo "ERROR: ${BACKUP_DESTINATION} no es un punto de montaje activo; se cancela para no llenar el disco del sistema." >&2
  exit 1
fi

backup_dir="${BACKUP_DESTINATION}/tools4care-backups"
temporary_dir="${backup_dir}/.temporary"
lock_dir="${backup_dir}/.backup-lock"
mkdir -p "$backup_dir" "$temporary_dir"

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "ERROR: ya hay otro respaldo en ejecución." >&2
  exit 1
fi

plain_dump=""
cleanup() {
  [[ -n "$plain_dump" && -f "$plain_dump" ]] && rm -f -- "$plain_dump"
  rm -rf -- "$lock_dir"
}
trap cleanup EXIT INT TERM

timestamp=$(date +'%Y-%m-%d_%H-%M-%S')
base_name="tools4care_${timestamp}"
plain_dump="${temporary_dir}/${base_name}.dump"
encrypted_dump="${backup_dir}/${base_name}.dump.gpg"
checksum_file="${encrypted_dump}.sha256"
latest_link="${backup_dir}/latest.dump.gpg"

echo "[$(date -Iseconds)] Iniciando respaldo de ${DB_NAME}..."

docker run --rm \
  --cpus=1.5 \
  --memory=512m \
  --network=host \
  --mount "type=bind,src=${pgpass_file},dst=/run/secrets/pgpass,readonly" \
  --mount "type=bind,src=${temporary_dir},dst=/backup" \
  -e PGPASSFILE=/run/secrets/pgpass \
  postgres:17-alpine \
  pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-privileges \
    --file="/backup/${base_name}.dump"

docker run --rm \
  --cpus=1 \
  --memory=256m \
  --mount "type=bind,src=${temporary_dir},dst=/backup,readonly" \
  postgres:17-alpine \
  pg_restore --list "/backup/${base_name}.dump" >/dev/null

gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file "$encryption_file" \
  --symmetric --cipher-algo AES256 \
  --output "$encrypted_dump" \
  "$plain_dump"

sha256sum "$encrypted_dump" >"$checksum_file"
ln -sfn "$(basename "$encrypted_dump")" "$latest_link"
rm -f -- "$plain_dump"
plain_dump=""

find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'tools4care_*.dump.gpg' -o -name 'tools4care_*.dump.gpg.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

size=$(du -h "$encrypted_dump" | awk '{print $1}')
echo "[$(date -Iseconds)] Respaldo terminado y verificado: ${encrypted_dump} (${size})"
