#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="${CF_DEPLOY_CONFIG:-$ROOT_DIR/deploy.cloudflare.env}"
VITE_ENV_FILE="$ROOT_DIR/.env.production.local"

ENV_CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
ENV_CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
ENV_OSS_BASE_URL="${OSS_BASE_URL:-}"
ENV_CF_FRONTEND_WORKER_NAME="${CF_FRONTEND_WORKER_NAME:-}"
ENV_CF_BACKEND_WORKER_NAME="${CF_BACKEND_WORKER_NAME:-}"
ENV_BACKEND_PUBLIC_URL="${BACKEND_PUBLIC_URL:-}"
ENV_CF_FRONTEND_CUSTOM_DOMAIN="${CF_FRONTEND_CUSTOM_DOMAIN:-}"
ENV_CF_BACKEND_CUSTOM_DOMAIN="${CF_BACKEND_CUSTOM_DOMAIN:-}"
ENV_CF_DEPLOY_DRY_RUN="${CF_DEPLOY_DRY_RUN:-}"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

[[ -n "$ENV_CLOUDFLARE_ACCOUNT_ID" ]] && CLOUDFLARE_ACCOUNT_ID="$ENV_CLOUDFLARE_ACCOUNT_ID"
[[ -n "$ENV_CLOUDFLARE_API_TOKEN" ]] && CLOUDFLARE_API_TOKEN="$ENV_CLOUDFLARE_API_TOKEN"
[[ -n "$ENV_OSS_BASE_URL" ]] && OSS_BASE_URL="$ENV_OSS_BASE_URL"
[[ -n "$ENV_CF_FRONTEND_WORKER_NAME" ]] && CF_FRONTEND_WORKER_NAME="$ENV_CF_FRONTEND_WORKER_NAME"
[[ -n "$ENV_CF_BACKEND_WORKER_NAME" ]] && CF_BACKEND_WORKER_NAME="$ENV_CF_BACKEND_WORKER_NAME"
[[ -n "$ENV_BACKEND_PUBLIC_URL" ]] && BACKEND_PUBLIC_URL="$ENV_BACKEND_PUBLIC_URL"
[[ -n "$ENV_CF_FRONTEND_CUSTOM_DOMAIN" ]] && CF_FRONTEND_CUSTOM_DOMAIN="$ENV_CF_FRONTEND_CUSTOM_DOMAIN"
[[ -n "$ENV_CF_BACKEND_CUSTOM_DOMAIN" ]] && CF_BACKEND_CUSTOM_DOMAIN="$ENV_CF_BACKEND_CUSTOM_DOMAIN"
[[ -n "$ENV_CF_DEPLOY_DRY_RUN" ]] && CF_DEPLOY_DRY_RUN="$ENV_CF_DEPLOY_DRY_RUN"

prompt_required() {
  local variable="$1"
  local label="$2"
  local secret="${3:-false}"
  local value="${!variable:-}"
  if [[ -z "$value" && -t 0 ]]; then
    if [[ "$secret" == "true" ]]; then
      read -r -s -p "$label: " value
      printf '\n'
    else
      read -r -p "$label: " value
    fi
  fi
  if [[ -z "$value" ]]; then
    printf 'Missing required deployment value: %s\n' "$variable" >&2
    exit 1
  fi
  printf -v "$variable" '%s' "$value"
}

prompt_optional() {
  local variable="$1"
  local label="$2"
  local default_value="${3:-}"
  local value="${!variable:-}"
  if [[ -z "$value" && -t 0 ]]; then
    read -r -p "$label${default_value:+ [$default_value]}: " value
  fi
  printf -v "$variable" '%s' "${value:-$default_value}"
}

if [[ "${CF_DEPLOY_DRY_RUN:-false}" != "true" ]]; then
  prompt_required CLOUDFLARE_ACCOUNT_ID 'Cloudflare Account ID'
  prompt_required CLOUDFLARE_API_TOKEN 'Cloudflare API Token' true
fi
prompt_required OSS_BASE_URL 'OSS public base URL (the parent of /maps)'
prompt_required BACKEND_PUBLIC_URL 'Backend Worker public HTTPS URL'
prompt_optional CF_FRONTEND_WORKER_NAME 'Frontend Worker name' 'csboard-frontend'
prompt_optional CF_BACKEND_WORKER_NAME 'Backend Worker name' 'csboard-backend'
prompt_optional CF_FRONTEND_CUSTOM_DOMAIN 'Optional frontend custom domain'
prompt_optional CF_BACKEND_CUSTOM_DOMAIN 'Optional backend custom domain'

OSS_BASE_URL="${OSS_BASE_URL%/}"
BACKEND_PUBLIC_URL="${BACKEND_PUBLIC_URL%/}"
if [[ ! "$OSS_BASE_URL" =~ ^https?:// ]]; then
  printf 'OSS_BASE_URL must be an HTTP(S) URL.\n' >&2
  exit 1
fi
if [[ ! "$BACKEND_PUBLIC_URL" =~ ^https:// ]]; then
  printf 'BACKEND_PUBLIC_URL must be an HTTPS URL.\n' >&2
  exit 1
fi
for domain in "${CF_FRONTEND_CUSTOM_DOMAIN:-}" "${CF_BACKEND_CUSTOM_DOMAIN:-}"; do
  if [[ -n "$domain" && "$domain" == *://* ]]; then
    printf 'Custom domains must be hostnames without a protocol: %s\n' "$domain" >&2
    exit 1
  fi
done

cat > "$VITE_ENV_FILE" <<EOF
VITE_OSS_BASE_URL=$OSS_BASE_URL
VITE_BACKEND_BASE_URL=$BACKEND_PUBLIC_URL
EOF

export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
export CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

backend_args=(deploy --config wrangler.backend.jsonc --name "$CF_BACKEND_WORKER_NAME" --var "MAP_BASE_URL:$OSS_BASE_URL")
frontend_args=(deploy --config wrangler.frontend.jsonc --name "$CF_FRONTEND_WORKER_NAME")
if [[ -n "${CF_BACKEND_CUSTOM_DOMAIN:-}" ]]; then
  backend_args+=(--domain "$CF_BACKEND_CUSTOM_DOMAIN")
fi
if [[ -n "${CF_FRONTEND_CUSTOM_DOMAIN:-}" ]]; then
  frontend_args+=(--domain "$CF_FRONTEND_CUSTOM_DOMAIN")
fi
if [[ "${CF_DEPLOY_DRY_RUN:-false}" == "true" ]]; then
  backend_args+=(--dry-run --outdir build/workers/backend)
  frontend_args+=(--dry-run --outdir build/workers/frontend)
fi

printf 'Backend Worker: %s (%s)\n' "$CF_BACKEND_WORKER_NAME" "$BACKEND_PUBLIC_URL"
printf 'Frontend Worker: %s\n' "$CF_FRONTEND_WORKER_NAME"
printf 'OSS: %s\n' "$OSS_BASE_URL"
[[ -n "${CF_BACKEND_CUSTOM_DOMAIN:-}" ]] && printf 'Backend domain: %s\n' "$CF_BACKEND_CUSTOM_DOMAIN"
[[ -n "${CF_FRONTEND_CUSTOM_DOMAIN:-}" ]] && printf 'Frontend domain: %s\n' "$CF_FRONTEND_CUSTOM_DOMAIN"

cd "$ROOT_DIR"
printf '\nDeploying backend Worker...\n'
npx wrangler "${backend_args[@]}"
printf '\nDeploying frontend Worker...\n'
npx wrangler "${frontend_args[@]}"
