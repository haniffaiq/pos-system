#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

FAKE_BIN="$WORK/bin"
mkdir -p "$FAKE_BIN" "$WORK/s3/db"
LOG="$WORK/commands.log"
: >"$LOG"

cat >"$FAKE_BIN/pg_dump" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) out="$2"; shift 2 ;;
    --file=*) out="${1#--file=}"; shift ;;
    *) shift ;;
  esac
done
printf 'custom dump bytes\n' >"$out"
printf 'pg_dump %s\n' "$out" >>"$TEST_COMMAND_LOG"
STUB

cat >"$FAKE_BIN/pg_restore" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf 'pg_restore %s\n' "$*" >>"$TEST_COMMAND_LOG"
STUB

cat >"$FAKE_BIN/psql" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
stdin=$(cat)
printf 'psql %s %s\n' "$*" "$stdin" >>"$TEST_COMMAND_LOG"
STUB

cat >"$FAKE_BIN/aws" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
endpoint=""
if [[ "${1:-}" == --endpoint-url=* ]]; then endpoint="$1"; shift; fi
if [[ "${1:-}" == --endpoint-url ]]; then endpoint="--endpoint-url=$2"; shift 2; fi
printf 'aws %s %s\n' "$endpoint" "$*" >>"$TEST_COMMAND_LOG"
cmd="$1"; shift
sub="$1"; shift
case "$cmd $sub" in
  "s3 cp")
    src="$1"; dest="$2"
    if [[ "$src" == s3://* ]]; then
      key="${src#s3://test-bucket/}"
      cp "$TEST_S3_ROOT/$key" "$dest"
    else
      key="${dest#s3://test-bucket/}"
      mkdir -p "$(dirname "$TEST_S3_ROOT/$key")"
      cp "$src" "$TEST_S3_ROOT/$key"
    fi
    ;;
  "s3 ls")
    # Includes one object older than the test retention cutoff.
    printf '2025-01-01 00:00:00         12 brosolution-db-20250101T000000Z.dump\n'
    printf '2025-01-01 00:00:00         64 brosolution-db-20250101T000000Z.dump.sha256\n'
    ;;
  "s3 rm")
    :
    ;;
esac
STUB
chmod +x "$FAKE_BIN"/*

export PATH="$FAKE_BIN:$PATH"
export TEST_COMMAND_LOG="$LOG"
export TEST_S3_ROOT="$WORK/s3"
export DATABASE_URL="postgres://app:test@db:5432/app"
export MINIO_ENDPOINT="https://s3.example.test"
export MINIO_BUCKET="test-bucket"
export APP_NAMESPACE="brosolution"
export BACKUP_S3_PREFIX="db"
export BACKUP_TMP_DIR="$WORK/tmp"
export BACKUP_RETENTION_DAYS=1
export BACKUP_NOW="20250103T000000Z"

mkdir -p "$BACKUP_TMP_DIR"

"$ROOT/infra/backup/backup.sh"

if ! grep -q 'pg_dump' "$LOG"; then
  echo "expected backup.sh to call pg_dump" >&2
  exit 1
fi
if ! grep -q 's3 cp .*brosolution-db-20250103T000000Z.dump' "$LOG"; then
  echo "expected backup.sh to upload timestamped dump" >&2
  exit 1
fi
if ! grep -q 's3 cp .*brosolution-db-20250103T000000Z.dump.sha256' "$LOG"; then
  echo "expected backup.sh to upload checksum" >&2
  exit 1
fi
if ! grep -q 's3 rm .*brosolution-db-20250101T000000Z.dump' "$LOG"; then
  echo "expected backup.sh to delete expired dump by retention" >&2
  exit 1
fi

latest_dump="$WORK/s3/db/brosolution-db-20250103T000000Z.dump"
latest_sum="$WORK/s3/db/brosolution-db-20250103T000000Z.dump.sha256"
test -s "$latest_dump"
test -s "$latest_sum"

: >"$LOG"
export RESTORE_DATABASE_URL="postgres://app:test@restore-db:5432/app_restore"
"$ROOT/infra/backup/restore.sh" "brosolution-db-20250103T000000Z.dump"

if ! grep -q 'pg_restore .*app_restore' "$LOG"; then
  echo "expected restore.sh to call pg_restore against RESTORE_DATABASE_URL" >&2
  exit 1
fi
if ! grep -q 'psql .*select 1' "$LOG"; then
  echo "expected restore.sh to run restore verification SQL" >&2
  exit 1
fi

echo "backup script tests passed"
