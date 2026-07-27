#!/usr/bin/env bash
set -euo pipefail
umask 077

ssh_target=${1:-edwin@192.168.1.174}
ssh_port=${2:-22}
project_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temporary_dir=$(mktemp -d "${TMPDIR:-/tmp}/tools4care-cloud-config.XXXXXX")

cleanup() {
  find "$temporary_dir" -type f -delete 2>/dev/null || true
  find "$temporary_dir" -depth -type d -empty -delete 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Comprobando acceso a Vercel..."
if ! vercel whoami >/dev/null 2>&1; then
  echo "ERROR: Vercel CLI no tiene una sesión activa." >&2
  echo "Ejecuta primero: vercel login" >&2
  exit 1
fi

echo "Descargando variables de producción de Vercel..."
(
  cd "$project_dir"
  vercel env pull "${temporary_dir}/vercel-production.env" \
    --environment=production \
    --yes >/dev/null
)
chmod 600 "${temporary_dir}/vercel-production.env"

echo "Preparando código y configuración de recuperación..."
git -C "$project_dir" bundle create "${temporary_dir}/tools4care-source.bundle" --all
tar -C "$project_dir" -czf "${temporary_dir}/edge-functions.tar.gz" supabase/functions
cp "${project_dir}/vercel.json" "${temporary_dir}/vercel.json"
cp "${project_dir}/.vercel/project.json" "${temporary_dir}/vercel-project.json"

cat >"${temporary_dir}/recovery-manifest.txt" <<'EOF'
Tools4Care cloud recovery package
- vercel-production.env: production environment variables
- tools4care-source.bundle: complete Git repository snapshot
- edge-functions.tar.gz: deployable Supabase Edge Functions source
- edge-secrets.env: custom Stripe/SMTP secrets entered during this backup
- vercel.json and vercel-project.json: Vercel project configuration
EOF

echo
echo "Secretos personalizados de Edge Functions"
echo "Los valores se guardarán únicamente dentro del paquete cifrado."
read -r -s -p "STRIPE_SECRET_KEY (Enter para omitir): " stripe_secret
echo
read -r -p "SMTP_HOST (Enter para omitir correo): " smtp_host
smtp_port=""
smtp_user=""
smtp_pass=""
email_from=""
email_from_name=""
if [[ -n "$smtp_host" ]]; then
  read -r -p "SMTP_PORT [465]: " smtp_port
  smtp_port=${smtp_port:-465}
  read -r -p "SMTP_USER: " smtp_user
  read -r -s -p "SMTP_PASS: " smtp_pass
  echo
  read -r -p "EMAIL_FROM [${smtp_user}]: " email_from
  email_from=${email_from:-$smtp_user}
  read -r -p "EMAIL_FROM_NAME [Tools4care]: " email_from_name
  email_from_name=${email_from_name:-Tools4care}
fi
read -r -p "CORS_ALLOW_ORIGINS [https://tools4care.vercel.app]: " cors_origins
cors_origins=${cors_origins:-https://tools4care.vercel.app}

{
  [[ -n "$stripe_secret" ]] && printf 'STRIPE_SECRET_KEY=%s\n' "$stripe_secret"
  if [[ -n "$smtp_host" ]]; then
    printf 'SMTP_HOST=%s\n' "$smtp_host"
    printf 'SMTP_PORT=%s\n' "$smtp_port"
    printf 'SMTP_USER=%s\n' "$smtp_user"
    printf 'SMTP_PASS=%s\n' "$smtp_pass"
    printf 'EMAIL_FROM=%s\n' "$email_from"
    printf 'EMAIL_FROM_NAME=%s\n' "$email_from_name"
  fi
  printf 'CORS_ALLOW_ORIGINS=%s\n' "$cors_origins"
} >"${temporary_dir}/edge-secrets.env"
chmod 600 "${temporary_dir}/edge-secrets.env"
unset stripe_secret smtp_pass

remote_dir="tools4care-cloud-config-incoming"
echo "Enviando el paquete por SSH..."
ssh -p "$ssh_port" -t "$ssh_target" \
  "mkdir -p '${remote_dir}' && chmod 700 '${remote_dir}'"
scp -P "$ssh_port" "${temporary_dir}/"* "${ssh_target}:${remote_dir}/"
scp -P "$ssh_port" \
  "${project_dir}/scripts/encrypt-cloud-config-remote.sh" \
  "${ssh_target}:${remote_dir}/"

ssh -p "$ssh_port" -t "$ssh_target" \
  "chmod 700 '${remote_dir}/encrypt-cloud-config-remote.sh' && '${remote_dir}/encrypt-cloud-config-remote.sh'"
