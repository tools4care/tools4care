#!/usr/bin/env bash
set -euo pipefail
umask 077

incoming_dir="${HOME}/tools4care-cloud-config-incoming"
config_dir="${HOME}/.config/tools4care-backup"
backup_config="${config_dir}/backup.conf"
encryption_file="${config_dir}/encryption-passphrase"

if [[ ! -d "$incoming_dir" || ! -r "$backup_config" || ! -r "$encryption_file" ]]; then
  echo "ERROR: faltan archivos para crear el paquete cifrado." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$backup_config"
if ! mountpoint -q "$BACKUP_DESTINATION"; then
  echo "ERROR: ${BACKUP_DESTINATION} no está montado." >&2
  exit 1
fi

destination="${BACKUP_DESTINATION}/tools4care-backups/cloud-config"
mkdir -p "$destination"
timestamp=$(date +'%Y-%m-%d_%H-%M-%S')
archive="${destination}/tools4care-cloud-config_${timestamp}.tar.gpg"
partial="${archive}.partial"

cleanup() {
  rm -f -- "$partial"
}
trap cleanup EXIT INT TERM

tar -C "$incoming_dir" -cf - . \
  | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$encryption_file" \
      --symmetric --cipher-algo AES256 \
      --output "$partial"

gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file "$encryption_file" \
  --decrypt "$partial" 2>/dev/null \
  | tar -tf - >/dev/null

mv "$partial" "$archive"
sha256sum "$archive" >"${archive}.sha256"
ln -sfn "$(basename "$archive")" "${destination}/latest-cloud-config.tar.gpg"

find "$incoming_dir" -mindepth 1 -maxdepth 1 -type f -delete
rmdir "$incoming_dir" 2>/dev/null || true

echo "CONFIGURACIÓN CIFRADA Y VERIFICADA: ${archive}"
