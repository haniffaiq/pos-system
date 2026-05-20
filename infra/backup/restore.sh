#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: restore.sh [--force-production] [--verify-only] <backup-key-or-s3-uri>

Restores a custom-format pg_dump created by backup.sh.
Use RESTORE_DATABASE_URL for drills/staging. Passing --force-production allows
DATABASE_URL as the restore target and should only be used during an approved
production incident.
USAGE
}

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
  if [[ "$key" == s3://* ]]; then
    echo "$key"
  elif [[ -n "${BACKUP_S3_PREFIX:-}" ]]; then
    echo "s3://${S3_BUCKET}/${BACKUP_S3_PREFIX%/}/${key}"
  else
    echo "s3://${S3_BUCKET}/${key}"
  fi
}

basename_from_key() {
  local key="$1"
  key="${key#s3://}"
  echo "${key##*/}"
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
  local force_production=0
  local verify_only=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --force-production) force_production=1; shift ;;
      --verify-only) verify_only=1; shift ;;
      -h|--help) usage; exit 0 ;;
      --*) echo "unknown option: $1" >&2; usage; exit 64 ;;
      *) break ;;
    esac
  done

  if [[ $# -ne 1 ]]; then
    usage
    exit 64
  fi

  local key="$1"
  [[ -n "$S3_ENDPOINT" ]] || { echo "missing required env: MINIO_ENDPOINT (or BACKUP_S3_ENDPOINT)" >&2; exit 64; }
  [[ -n "$S3_BUCKET" ]] || { echo "missing required env: MINIO_BUCKET (or BACKUP_S3_BUCKET)" >&2; exit 64; }
  require_cmd aws
  require_cmd sha256sum
  require_cmd pg_restore
  require_cmd psql

  export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY:-${AWS_ACCESS_KEY_ID:-}}"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY:-${AWS_SECRET_ACCESS_KEY:-}}"
  export AWS_DEFAULT_REGION="${S3_REGION:-${AWS_DEFAULT_REGION:-auto}}"

  local target_url="${RESTORE_DATABASE_URL:-}"
  if [[ -z "$target_url" ]]; then
    if (( force_production == 1 )); then
      require_env DATABASE_URL
      target_url="$DATABASE_URL"
    else
      echo "RESTORE_DATABASE_URL is required unless --force-production is passed" >&2
      exit 65
    fi
  fi

  local tmp_dir="${RESTORE_TMP_DIR:-${BACKUP_TMP_DIR:-/tmp}}"
  mkdir -p "$tmp_dir"
  local name
  name=$(basename_from_key "$key")
  local dump="${tmp_dir%/}/${name}"
  local checksum="${dump}.sha256"

  trap 'rm -f "${dump:-}" "${checksum:-}"' EXIT

  aws --endpoint-url="$S3_ENDPOINT" s3 cp "$(s3_uri "$key")" "$dump"
  if aws --endpoint-url="$S3_ENDPOINT" s3 cp "$(s3_uri "${key}.sha256")" "$checksum"; then
    (cd "$tmp_dir" && sha256sum --check "$(basename "$checksum")")
  else
    echo "warning: checksum object missing; continuing without SHA256 verification" >&2
  fi

  if (( verify_only == 1 )); then
    pg_restore --list "$dump" >/dev/null
    echo "restore verify ok: ${name}"
    return 0
  fi

  pg_restore \
    --dbname "$target_url" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    "$dump"

  local verify_sql="${RESTORE_VERIFY_SQL:-select 1;}"
  printf '%s\n' "$verify_sql" | psql "$target_url" -v ON_ERROR_STOP=1

  echo "restore ok: ${name}"
}

main "$@"
