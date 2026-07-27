#!/usr/bin/env bash
set -euo pipefail

ssh_target=${1:-edwin@192.168.1.174}
ssh_port=${2:-22}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

echo "Instalando herramienta de recuperación en ${ssh_target}..."
scp -P "$ssh_port" \
  "${script_dir}/home-backup-recovery.sh" \
  "${ssh_target}:tools4care-backup-install/"
ssh -p "$ssh_port" -t "$ssh_target" \
  "install -m 700 tools4care-backup-install/home-backup-recovery.sh ~/.local/bin/tools4care-home-recovery && ~/.local/bin/tools4care-home-recovery"
