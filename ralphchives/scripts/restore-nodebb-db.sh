#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ralphchives_dir="$(cd "$script_dir/.." && pwd)"
invocation_dir="$PWD"

usage() {
  cat <<'EOF'
Usage: ./scripts/restore-nodebb-db.sh --input <archive> [--yes]

Restores a Ralphchives NodeBB backup bundle.

The preferred input is a full recovery bundle created by backup-nodebb-db.sh.
Legacy MongoDB-only .archive.gz backups are also accepted, but they do not
restore uploads or config.

Options:
  -i, --input   Path to a backup bundle or legacy MongoDB archive
  -y, --yes     Skip the confirmation prompt
  -h, --help    Show this help message
EOF
}

input_path=""
skip_confirmation=0
temp_dir="$(mktemp -d)"
started_mongodb=0
leave_mongodb_running=0
nodebb_was_running=0
sync_was_running=0
nodebb_started_for_build=0
bundle_mode=0
backup_nodebb_version=""
current_nodebb_version=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -i|--input)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      input_path="$2"
      shift 2
      ;;
    -y|--yes)
      skip_confirmation=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$input_path" ]]; then
  echo "An input archive is required" >&2
  usage >&2
  exit 1
fi

if [[ "$input_path" != /* ]]; then
  input_path="$invocation_dir/$input_path"
fi

if [[ ! -f "$input_path" ]]; then
  echo "Backup archive not found: $input_path" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to restore a backup" >&2
  exit 1
fi

cd "$ralphchives_dir"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

cleanup() {
  rm -rf "$temp_dir"

  if [[ "$nodebb_started_for_build" -eq 1 ]]; then
    docker compose stop nodebb >/dev/null
  fi

  if [[ "$started_mongodb" -eq 1 && "$leave_mongodb_running" -eq 0 ]]; then
    docker compose stop mongodb >/dev/null
  fi
}

trap cleanup EXIT

if tar -tzf "$input_path" manifest.txt >/dev/null 2>&1; then
  bundle_mode=1
  tar -xzf "$input_path" -C "$temp_dir"

  if [[ ! -f "$temp_dir/mongodb.archive.gz" || ! -f "$temp_dir/uploads.tar.gz" || ! -f "$temp_dir/config.tar.gz" ]]; then
    echo "Backup bundle is missing required files" >&2
    exit 1
  fi

  if grep -q '^nodebb_version=' "$temp_dir/manifest.txt"; then
    backup_nodebb_version="$(grep '^nodebb_version=' "$temp_dir/manifest.txt" | cut -d= -f2-)"
  fi
fi

current_nodebb_version="$(docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'node -p "require(\"/usr/src/app/package.json\").version"' | tr -d '\r')"

if [[ "$bundle_mode" -eq 1 && -n "$backup_nodebb_version" && "$backup_nodebb_version" != "$current_nodebb_version" ]]; then
  echo "Warning: backup was created on NodeBB $backup_nodebb_version but the current container is $current_nodebb_version"
  echo "Restore to the same NodeBB version first if you want the lowest-risk recovery path."
fi

if [[ "$bundle_mode" -eq 0 ]]; then
  echo "Warning: restoring a legacy MongoDB-only archive. uploads and config will not be restored."
fi

if [[ "$skip_confirmation" -ne 1 ]]; then
  echo "This will replace the live Ralphchives nodebb MongoDB database with:"
  echo "  $input_path"

  if [[ "$bundle_mode" -eq 1 ]]; then
    echo "It will also replace NodeBB uploads and config, then run ./nodebb build."
  else
    echo "It will run ./nodebb build after restoring MongoDB only."
  fi

  read -r -p "Continue? [y/N] " confirmation
  if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
    echo "Restore cancelled"
    exit 1
  fi
fi

mongo_password="${MONGO_PASSWORD:-nodebb}"

if docker compose ps --services --status running nodebb | grep -qx "nodebb"; then
  nodebb_was_running=1
  docker compose stop nodebb >/dev/null
fi

if docker compose ps --services --status running sync | grep -qx "sync"; then
  sync_was_running=1
  docker compose stop sync >/dev/null
fi

if ! docker compose ps --services --status running mongodb | grep -qx "mongodb"; then
  echo "Starting mongodb service for restore..."
  docker compose up -d mongodb >/dev/null
  started_mongodb=1
fi

if [[ "$bundle_mode" -eq 1 ]]; then
  docker compose exec -T mongodb mongorestore \
    --username nodebb \
    --password "$mongo_password" \
    --authenticationDatabase admin \
    --nsInclude 'nodebb.*' \
    --drop \
    --archive \
    --gzip < "$temp_dir/mongodb.archive.gz"

  docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'set -e; find /usr/src/app/public/uploads -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -C /usr/src/app/public -xzf -' < "$temp_dir/uploads.tar.gz"

  docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'set -e; find /opt/config -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -C /opt -xzf -' < "$temp_dir/config.tar.gz"
else
  docker compose exec -T mongodb mongorestore \
    --username nodebb \
    --password "$mongo_password" \
    --authenticationDatabase admin \
    --nsInclude 'nodebb.*' \
    --drop \
    --archive \
    --gzip < "$input_path"
fi

docker compose up -d nodebb >/dev/null
nodebb_started_for_build=1

docker compose exec -T nodebb sh -lc 'cd /usr/src/app && ./nodebb build'

if [[ "$nodebb_was_running" -eq 1 ]]; then
  nodebb_started_for_build=0
  leave_mongodb_running=1
else
  docker compose stop nodebb >/dev/null
  nodebb_started_for_build=0
fi

if [[ "$sync_was_running" -eq 1 ]]; then
  docker compose up -d sync >/dev/null
  leave_mongodb_running=1
fi

echo "Restore completed from: $input_path"

if [[ "$bundle_mode" -eq 0 ]]; then
  echo "Uploads and config were not restored because the input was a MongoDB-only archive."
fi

echo "NodeBB assets rebuilt with ./nodebb build"