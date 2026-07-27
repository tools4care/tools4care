#!/usr/bin/env bash
set -euo pipefail
umask 077

ssh_target=${1:-edwin@192.168.1.174}
ssh_port=${2:-22}
project_ref="gvloygqbavibmpakzdma"
endpoint_default="https://${project_ref}.storage.supabase.co/storage/v1/s3"
region_default="us-east-2"
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/tools4care-storage-setup.XXXXXX")
config_file="${temporary_dir}/rclone-storage.conf"

cleanup() {
  rm -f -- "$config_file"
  rmdir "$temporary_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Configuración segura del respaldo de Supabase Storage"
read -r -p "Endpoint S3 [${endpoint_default}]: " s3_endpoint
s3_endpoint=${s3_endpoint:-$endpoint_default}
read -r -p "Región [${region_default}]: " s3_region
s3_region=${s3_region:-$region_default}
read -r -p "Access Key ID: " access_key
read -r -s -p "Secret Access Key: " secret_key
echo

if [[ -z "$access_key" || -z "$secret_key" ]]; then
  echo "ERROR: ambas credenciales son obligatorias." >&2
  exit 1
fi

cat >"$config_file" <<EOF
[tools4care-s3]
type = s3
provider = Other
access_key_id = ${access_key}
secret_access_key = ${secret_key}
endpoint = ${s3_endpoint}
region = ${s3_region}
acl = private
EOF
chmod 600 "$config_file"
unset access_key secret_key

remote_dir="tools4care-storage-install"
echo "Copiando configuración cifrada por SSH a ${ssh_target}..."
ssh -p "$ssh_port" -t "$ssh_target" "mkdir -p '${remote_dir}' && chmod 700 '${remote_dir}'"
scp -P "$ssh_port" \
  "${script_dir}/home-storage-backup-runner.sh" \
  "${script_dir}/install-home-storage-backup-remote.sh" \
  "$config_file" \
  "${ssh_target}:${remote_dir}/"

ssh -p "$ssh_port" -t "$ssh_target" \
  "chmod 700 '${remote_dir}/install-home-storage-backup-remote.sh' && '${remote_dir}/install-home-storage-backup-remote.sh'"
