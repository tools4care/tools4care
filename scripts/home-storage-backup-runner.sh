#!/usr/bin/env bash
set -euo pipefail
umask 077

config_dir="${HOME}/.config/tools4care-backup"
backup_config="${config_dir}/backup.conf"
rclone_config="${config_dir}/rclone-storage.conf"
encryption_file="${config_dir}/encryption-passphrase"

if [[ ! -r "$backup_config" || ! -r "$rclone_config" || ! -r "$encryption_file" ]]; then
  echo "ERROR: falta la configuración privada para Storage." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$backup_config"
: "${BACKUP_DESTINATION:?BACKUP_DESTINATION no está configurado}"
: "${RETENTION_DAYS:?RETENTION_DAYS no está configurado}"

if ! mountpoint -q "$BACKUP_DESTINATION"; then
  echo "ERROR: ${BACKUP_DESTINATION} no está montado." >&2
  exit 1
fi

storage_dir="${BACKUP_DESTINATION}/tools4care-backups/storage"
mirror_dir="${storage_dir}/mirror"
archive_dir="${storage_dir}/archives"
lock_dir="${storage_dir}/.storage-backup-lock"
mkdir -p "$mirror_dir" "$archive_dir"

if ! mkdir "$lock_dir" 2>/dev/null; then
  echo "ERROR: ya existe otro respaldo de Storage en ejecución." >&2
  exit 1
fi

partial_archive=""
cleanup() {
  [[ -n "$partial_archive" && -f "$partial_archive" ]] && rm -f -- "$partial_archive"
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[$(date -Iseconds)] Sincronizando Supabase Storage..."
docker run --rm \
  --cpus=1.5 \
  --memory=512m \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,src=${rclone_config},dst=/config/rclone/rclone.conf,readonly" \
  --mount "type=bind,src=${mirror_dir},dst=/mirror" \
  rclone/rclone:latest \
  copy tools4care-s3: /mirror \
    --fast-list \
    --transfers=4 \
    --checkers=8 \
    --create-empty-src-dirs \
    --log-level=NOTICE

timestamp=$(date +'%Y-%m-%d_%H-%M-%S')
archive_name="tools4care-storage_${timestamp}.tar.zst.gpg"
final_archive="${archive_dir}/${archive_name}"
partial_archive="${final_archive}.partial"

file_count=$(find "$mirror_dir" -type f | wc -l | tr -d ' ')
total_size=$(du -sh "$mirror_dir" | awk '{print $1}')
echo "[$(date -Iseconds)] Creando archivo cifrado de ${file_count} objetos (${total_size})..."

tar -C "$mirror_dir" -cf - . \
  | zstd -T1 -3 \
  | gpg --batch --yes --pinentry-mode loopback \
      --passphrase-file "$encryption_file" \
      --symmetric --cipher-algo AES256 \
      --output "$partial_archive"

gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file "$encryption_file" \
  --decrypt "$partial_archive" 2>/dev/null \
  | zstd --test >/dev/null

mv "$partial_archive" "$final_archive"
partial_archive=""
sha256sum "$final_archive" >"${final_archive}.sha256"
ln -sfn "$archive_name" "${archive_dir}/latest-storage.tar.zst.gpg"

find "$archive_dir" -maxdepth 1 -type f \
  \( -name 'tools4care-storage_*.tar.zst.gpg' -o -name 'tools4care-storage_*.tar.zst.gpg.sha256' \) \
  -mtime "+${RETENTION_DAYS}" -delete

archive_size=$(du -h "$final_archive" | awk '{print $1}')
echo "[$(date -Iseconds)] STORAGE RESPALDADO Y VERIFICADO: ${final_archive} (${archive_size})"
