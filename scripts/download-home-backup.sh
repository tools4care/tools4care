#!/usr/bin/env bash
set -euo pipefail

ssh_target=${1:-edwin@192.168.1.174}
destination=${2:-"${HOME}/Desktop/Tools4Care-Recuperacion"}
ssh_port=${3:-22}
remote_dir="/media/multimedia/tools4care-backups"

mkdir -p "$destination"

echo "Buscando el respaldo más reciente en ${ssh_target}..."
latest_name=$(ssh -p "$ssh_port" "$ssh_target" \
  "readlink '${remote_dir}/latest.dump.gpg' || true")

if [[ -z "$latest_name" || "$latest_name" == */* ]]; then
  echo "ERROR: no se encontró un respaldo reciente válido." >&2
  exit 1
fi

checksum_name="${latest_name}.sha256"
echo "Verificando el archivo en el servidor..."
ssh -p "$ssh_port" "$ssh_target" \
  "cd '${remote_dir}' && sha256sum -c '${checksum_name}'"

echo "Descargando ${latest_name}..."
scp -P "$ssh_port" \
  "${ssh_target}:${remote_dir}/${latest_name}" \
  "${ssh_target}:${remote_dir}/${checksum_name}" \
  "$destination/"

expected=$(ssh -p "$ssh_port" "$ssh_target" \
  "awk 'NR == 1 {print \$1}' '${remote_dir}/${checksum_name}'")
if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "${destination}/${latest_name}" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "${destination}/${latest_name}" | awk '{print $1}')
else
  echo "ERROR: no existe shasum ni sha256sum en esta computadora." >&2
  exit 1
fi

if [[ "$actual" != "$expected" ]]; then
  echo "ERROR: el archivo descargado no coincide con su checksum." >&2
  exit 1
fi

echo "DESCARGA COMPLETA Y VERIFICADA"
echo "Archivo: ${destination}/${latest_name}"
echo "Checksum: ${destination}/${checksum_name}"
