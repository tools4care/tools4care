#!/usr/bin/env bash
set -euo pipefail
umask 077

config_dir="${HOME}/.config/tools4care-backup"
config_file="${config_dir}/backup.conf"
encryption_file="${config_dir}/encryption-passphrase"

if [[ ! -r "$config_file" || ! -r "$encryption_file" ]]; then
  echo "ERROR: falta la configuración privada del respaldo." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$config_file"
backup_dir="${BACKUP_DESTINATION}/tools4care-backups"

if ! mountpoint -q "$BACKUP_DESTINATION"; then
  echo "ERROR: ${BACKUP_DESTINATION} no está montado." >&2
  exit 1
fi

latest_link="${backup_dir}/latest.dump.gpg"
if [[ ! -L "$latest_link" ]]; then
  echo "ERROR: no existe latest.dump.gpg." >&2
  exit 1
fi

encrypted_backup=$(readlink -f "$latest_link")
checksum_file="${encrypted_backup}.sha256"
if [[ ! -f "$encrypted_backup" || ! -f "$checksum_file" ]]; then
  echo "ERROR: falta el respaldo o su checksum." >&2
  exit 1
fi

echo "Respaldo seleccionado: $(basename "$encrypted_backup")"
sha256sum -c "$checksum_file"

temporary_dir=$(mktemp -d "${backup_dir}/.recovery-XXXXXX")
plain_dump="${temporary_dir}/recovery.dump"
target_pgpass="${temporary_dir}/target.pgpass"
cleanup() {
  rm -f -- "$plain_dump" "$target_pgpass"
  rmdir "$temporary_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Descifrando temporalmente para verificar..."
gpg --batch --yes --pinentry-mode loopback \
  --passphrase-file "$encryption_file" \
  --output "$plain_dump" \
  --decrypt "$encrypted_backup"

object_count=$(docker run --rm \
  --mount "type=bind,src=${plain_dump},dst=/recovery.dump,readonly" \
  postgres:17-alpine pg_restore --list /recovery.dump | wc -l | tr -d ' ')
echo "RESPALDO RECUPERABLE: ${object_count} entradas verificadas."

if [[ "${1:-}" != "--restore" ]]; then
  echo
  echo "La verificación terminó sin modificar ninguna base de datos."
  echo "Para restaurar en un PROYECTO NUEVO: $0 --restore"
  exit 0
fi

echo
echo "RESTAURACIÓN PROTEGIDA"
echo "Solo se permite un proyecto Supabase NUEVO. Producción está bloqueada."
read -r -p "Host Session Pooler del proyecto NUEVO: " target_host
read -r -p "Puerto [5432]: " target_port
target_port=${target_port:-5432}
read -r -p "Base de datos [postgres]: " target_database
target_database=${target_database:-postgres}
read -r -p "Usuario completo (postgres.PROJECT_REF_NUEVO): " target_user

if [[ -z "$target_host" || -z "$target_user" ]]; then
  echo "ERROR: host y usuario son obligatorios." >&2
  exit 1
fi
if [[ "$target_user" == "$DB_USER" ]]; then
  echo "BLOQUEADO: el usuario corresponde a producción (${DB_USER})." >&2
  exit 1
fi

read -r -s -p "Contraseña PostgreSQL del proyecto NUEVO: " target_password
echo
escape_pgpass() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/:/\\:/g'
}
printf '%s:%s:%s:%s:%s\n' \
  "$(escape_pgpass "$target_host")" \
  "$(escape_pgpass "$target_port")" \
  "$(escape_pgpass "$target_database")" \
  "$(escape_pgpass "$target_user")" \
  "$(escape_pgpass "$target_password")" >"$target_pgpass"
chmod 600 "$target_pgpass"
unset target_password

echo "Probando la conexión de destino..."
docker run --rm --network=host \
  --mount "type=bind,src=${target_pgpass},dst=/run/secrets/pgpass,readonly" \
  -e PGPASSFILE=/run/secrets/pgpass \
  postgres:17-alpine \
  psql \
    --host="$target_host" \
    --port="$target_port" \
    --username="$target_user" \
    --dbname="$target_database" \
    --set=ON_ERROR_STOP=1 \
    --command='select current_user, current_database();'

echo
echo "Destino confirmado: ${target_user}@${target_host}/${target_database}"
echo "La restauración usará una sola transacción y se revertirá si falla."
read -r -p "Escribe exactamente RESTAURAR EN PROYECTO NUEVO: " confirmation
if [[ "$confirmation" != "RESTAURAR EN PROYECTO NUEVO" ]]; then
  echo "Cancelado sin realizar cambios."
  exit 1
fi

echo "Iniciando restauración..."
docker run --rm --network=host \
  --cpus=1.5 \
  --memory=768m \
  --mount "type=bind,src=${target_pgpass},dst=/run/secrets/pgpass,readonly" \
  --mount "type=bind,src=${plain_dump},dst=/recovery.dump,readonly" \
  -e PGPASSFILE=/run/secrets/pgpass \
  postgres:17-alpine \
  pg_restore \
    --host="$target_host" \
    --port="$target_port" \
    --username="$target_user" \
    --dbname="$target_database" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --single-transaction \
    --exit-on-error \
    --verbose \
    /recovery.dump

echo "RESTAURACIÓN COMPLETADA EN EL PROYECTO NUEVO."
echo "No cambies producción hasta validar clientes, ventas, pagos, usuarios y productos."
