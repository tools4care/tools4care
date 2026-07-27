#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <ssh-target> [ssh-port] [--interactive]" >&2
  echo "Example: $0 backup-user@192.168.1.50 22 --interactive" >&2
  exit 2
fi

ssh_target=$1
ssh_port=${2:-22}
ssh_mode=${3:-}
ssh_options=(
  -p "$ssh_port"
  -o ConnectTimeout=10
  -o ServerAliveInterval=5
  -o ServerAliveCountMax=2
)

if [[ "$ssh_mode" != "--interactive" ]]; then
  ssh_options+=(-o BatchMode=yes)
fi

echo "Connecting read-only to ${ssh_target} on port ${ssh_port}..."

ssh \
  "${ssh_options[@]}" \
  "$ssh_target" 'sh -s' <<'REMOTE_CHECK'
set -u

section() {
  printf '\n=== %s ===\n' "$1"
}

has() {
  command -v "$1" >/dev/null 2>&1
}

command_info() {
  command_name=$1
  if has "$command_name"; then
    command_path=$(command -v "$command_name" 2>/dev/null || true)
    printf '%s: available (%s)\n' "$command_name" "$command_path"
  else
    printf '%s: unavailable\n' "$command_name"
  fi
}

section "IDENTITY"
printf 'hostname: %s\n' "$(hostname 2>/dev/null || echo unknown)"
printf 'user: %s\n' "$(id -un 2>/dev/null || whoami 2>/dev/null || echo unknown)"
printf 'uid: %s\n' "$(id -u 2>/dev/null || echo unknown)"
printf 'shell: %s\n' "${SHELL:-unknown}"
printf 'home: %s\n' "${HOME:-unknown}"

section "OPERATING SYSTEM"
printf 'kernel: %s\n' "$(uname -a 2>/dev/null || echo unknown)"
if [ -r /etc/os-release ]; then
  sed -n 's/^\(NAME\|VERSION\|VERSION_ID\|ID\|ID_LIKE\)=/\1=/p' /etc/os-release
elif has sw_vers; then
  sw_vers
fi

section "TIME"
printf 'current_time: %s\n' "$(date -Iseconds 2>/dev/null || date 2>/dev/null || echo unknown)"
if has timedatectl; then
  timedatectl 2>/dev/null | sed -n '1,10p' || true
else
  printf 'timezone: %s\n' "$(readlink /etc/localtime 2>/dev/null || echo unknown)"
fi

section "CPU AND MEMORY"
if has nproc; then printf 'cpu_count: %s\n' "$(nproc)"; fi
if has sysctl; then
  sysctl -n hw.ncpu 2>/dev/null | sed 's/^/cpu_count: /' || true
fi
if has free; then
  free -h
elif has vm_stat; then
  vm_stat | sed -n '1,12p'
fi

section "STORAGE"
df -hP 2>/dev/null || df -h 2>/dev/null || true
if has lsblk; then
  printf '\nBlock devices:\n'
  lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS 2>/dev/null || true
fi
if has zpool; then
  printf '\nZFS pools:\n'
  zpool list 2>/dev/null || true
fi
if has btrfs; then
  printf '\nBtrfs filesystems:\n'
  btrfs filesystem show 2>/dev/null || true
fi

section "BACKUP DESTINATION WRITE TEST"
backup_probe_dir="${HOME:-/tmp}/tools4care-backups"
printf 'suggested_directory: %s\n' "$backup_probe_dir"
parent_dir=$(dirname "$backup_probe_dir")
if [ -d "$backup_probe_dir" ] && [ -w "$backup_probe_dir" ]; then
  echo "writable: yes (directory already exists)"
elif [ -d "$parent_dir" ] && [ -w "$parent_dir" ]; then
  echo "writable: yes (parent permits creating it)"
else
  echo "writable: no"
fi

section "DATABASE AND ARCHIVE TOOLS"
for tool in pg_dump pg_restore psql gzip zstd openssl age gpg sha256sum shasum rsync rclone restic borg; do
  command_info "$tool"
done

section "CONTAINERS"
command_info docker
command_info docker-compose
if has docker; then
  docker version --format 'docker_server: {{.Server.Version}}' 2>/dev/null || echo "docker_server: installed but unavailable to this user"
  docker info --format 'docker_root: {{.DockerRootDir}}' 2>/dev/null || true
fi
command_info podman

section "PRIVATE NETWORK"
command_info tailscale
if has tailscale; then
  tailscale status --self 2>/dev/null || tailscale status 2>/dev/null | sed -n '1,8p' || true
fi

section "SCHEDULING"
command_info crontab
if has systemctl; then
  printf 'systemd: available\n'
else
  printf 'systemd: unavailable\n'
fi
if has launchctl; then
  printf 'launchd: available\n'
else
  printf 'launchd: unavailable\n'
fi

section "SSH"
if [ -r /etc/ssh/sshd_config ]; then
  awk '
    BEGIN { IGNORECASE=1 }
    /^[[:space:]]*(Port|PasswordAuthentication|PubkeyAuthentication|PermitRootLogin)[[:space:]]+/ {
      print
    }
  ' /etc/ssh/sshd_config 2>/dev/null || true
else
  echo "sshd_config: not readable by this user"
fi

section "OUTBOUND CONNECTIVITY"
if has curl; then
  if curl -fsSIL --max-time 8 https://supabase.com >/dev/null 2>&1; then
    echo "https_outbound: available"
  else
    echo "https_outbound: unavailable_or_filtered"
  fi
else
  echo "https_outbound: curl unavailable"
fi

section "RESULT"
echo "inspection_complete: yes"
REMOTE_CHECK
