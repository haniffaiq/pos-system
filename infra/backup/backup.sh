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
    echo "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX%/}/${key}"
  else
    echo "s3://${BACKUP_S3_BUCKET}/${key}"
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

  local now="$1"
  local cutoff
  cutoff=$(retention_cutoff "$now" "$days")
  local prefix_uri
  prefix_uri=$(s3_uri "")

  aws --endpoint-url="$BACKUP_S3_ENDPOINT" s3 ls "$prefix_uri" | while read -r _date _time _size key; do
    [[ -n "${key:-}" ]] || continue
    [[ "$key" =~ ^brosolution-db-([0-9]{8}T[0-9]{6}Z)\.dump(\.sha256)?$ ]] || continue
    if [[ "${BASH_REMATCH[1]}" < "$cutoff" ]]; then
      aws --endpoint-url="$BACKUP_S3_ENDPOINT" s3 rm "${prefix_uri}${key}"
    fi
  done
}

main() {
  require_env DATABASE_URL
  require_env BACKUP_S3_ENDPOINT
  require_env BACKUP_S3_BUCKET
  require_cmd pg_dump
  require_cmd aws
  require_cmd sha256sum

  export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
  export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
  export AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-${AWS_DEFAULT_REGION:-auto}}"

  local ts="${BACKUP_NOW:-$(date -u +%Y%m%dT%H%M%SZ)}"
  local tmp_dir="${BACKUP_TMP_DIR:-/tmp}"
  mkdir -p "$tmp_dir"

  local name="brosolution-db-${ts}.dump"
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

  aws --endpoint-url="$BACKUP_S3_ENDPOINT" s3 cp "$dump" "$(s3_uri "$name")"
  aws --endpoint-url="$BACKUP_S3_ENDPOINT" s3 cp "$checksum" "$(s3_uri "${name}.sha256")"

  prune_expired_backups "$ts"

  echo "backup ok: ${name}"
}

main "$@"
