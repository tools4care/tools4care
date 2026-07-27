#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 usuario@servidor [puerto]" >&2
  echo "Ejemplo: $0 edwin@192.168.1.174 22" >&2
  exit 2
fi

ssh_target=$1
ssh_port=${2:-22}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
remote_dir="tools4care-backup-install"

echo "Copiando instalador a ${ssh_target}..."
ssh -p "$ssh_port" -t "$ssh_target" "mkdir -p '${remote_dir}'"
scp -P "$ssh_port" \
  "${script_dir}/home-backup-runner.sh" \
  "${script_dir}/install-home-backup-remote.sh" \
  "${ssh_target}:${remote_dir}/"

echo "Abriendo el instalador interactivo en el servidor..."
ssh -p "$ssh_port" -t "$ssh_target" \
  "chmod 700 '${remote_dir}/home-backup-runner.sh' '${remote_dir}/install-home-backup-remote.sh' && '${remote_dir}/install-home-backup-remote.sh'"
