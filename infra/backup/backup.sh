#!/usr/bin/env bash
set -euo pipefail

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: $name" >&2
    exit 64
  fi
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 69
  fi
}

s3_uri() {
  local key="$1"
  if [[ -n "${BACKUP_S3_PREFIX:-}" ]]; then
    echo "s3://${S3_BUCKET}/${BACKUP_S3_PREFIX%/}/${key}"
  else
    echo "s3://${S3_BUCKET}/${key}"
  fi
}

retention_cutoff() {
  local now="$1"
  local days="$2"
  local iso="${now:0:8} ${now:9:2}:${now:11:2}:${now:13:2} UTC"
  date -u -d "$iso - ${days} days" +%Y%m%dT%H%M%SZ
}

prune_expired_backups() {
  local days="${BACKUP_RETENTION_DAYS:-0}"
  if [[ ! "$days" =~ ^[0-9]+$ ]] || (( days <= 0 )); then
    return 0
  fi

  local ns="${APP_NAMESPACE:-brosolution}"
  local now="$1"
  local cutoff
  cutoff=$(retention_cutoff "$now" "$days")
  local prefix_uri
  prefix_uri=$(s3_uri "")

  aws --endpoint-url="$S3_ENDPOINT" s3 ls "$prefix_uri" | while read -r _date _time _size key; do
    [[ -n "${key:-}" ]] || continue
    [[ "$key" =~ ^${ns}-db-([0-9]{8}T[0-9]{6}Z)\.dump(\.sha256)?$ ]] || continue
    if [[ "${BASH_REMATCH[1]}" < "$cutoff" ]]; then
      aws --endpoint-url="$S3_ENDPOINT" s3 rm "${prefix_uri}${key}"
    fi
  done
}

# Resolve MinIO/S3 config: prefer MINIO_* (shared instance), fall back to legacy BACKUP_S3_*.
S3_ENDPOINT="${MINIO_ENDPOINT:-${BACKUP_S3_ENDPOINT:-}}"
S3_BUCKET="${MINIO_BUCKET:-${BACKUP_S3_BUCKET:-}}"
S3_ACCESS_KEY="${MINIO_ACCESS_KEY:-${BACKUP_S3_ACCESS_KEY:-}}"
S3_SECRET_KEY="${MINIO_SECRET_KEY:-${BACKUP_S3_SECRET_KEY:-}}"
S3_REGION="${BACKUP_S3_REGION:-auto}"

# MINIO_ENDPOINT may be scheme-less (e.g. minio:9000); aws --endpoint-url needs a scheme.
if [[ -n "$S3_ENDPOINT" && "$S3_ENDPOINT" != http://* && "$S3_ENDPOINT" != https://* ]]; then
  S3_ENDPOINT="http://${S3_ENDPOINT}"
fi

main() {
  require_env DATABASE_URL
  [[ -n "$S3_ENDPOINT" ]] || { echo "missing required env: MINIO_ENDPOINT (or BACKUP_S3_ENDPOINT)" >&2; exit 64; }
  [[ -n "$S3_BUCKET" ]] || { echo "missing required env: MINIO_BUCKET (or BACKUP_S3_BUCKET)" >&2; exit 64; }
  require_cmd pg_dump
  require_cmd aws
  require_cmd sha256sum

  export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
  export AWS_DEFAULT_REGION="${S3_REGION:-${AWS_DEFAULT_REGION:-auto}}"

  local ts="${BACKUP_NOW:-$(date -u +%Y%m%dT%H%M%SZ)}"
  local tmp_dir="${BACKUP_TMP_DIR:-/tmp}"
  mkdir -p "$tmp_dir"

  local name="${APP_NAMESPACE:-brosolution}-db-${ts}.dump"
  local dump="${tmp_dir%/}/${name}"
  local checksum="${dump}.sha256"

  trap 'rm -f "${dump:-}" "${checksum:-}"' EXIT

  pg_dump \
    --dbname "$DATABASE_URL" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-acl \
    --file "$dump"

  (cd "$(dirname "$dump")" && sha256sum "$(basename "$dump")" >"$(basename "$checksum")")

  aws --endpoint-url="$S3_ENDPOINT" s3 cp "$dump" "$(s3_uri "$name")"
  aws --endpoint-url="$S3_ENDPOINT" s3 cp "$checksum" "$(s3_uri "${name}.sha256")"

  prune_expired_backups "$ts"

  echo "backup ok: ${name}"
}

main "$@"
