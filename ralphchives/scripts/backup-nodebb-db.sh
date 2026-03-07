#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ralphchives_dir="$(cd "$script_dir/.." && pwd)"
default_backup_dir="$ralphchives_dir/backups"
invocation_dir="$PWD"

usage() {
  cat <<'EOF'
Usage: ./scripts/backup-nodebb-db.sh [--output <file-or-directory>]

Creates a gzip-compressed recovery bundle for Ralphchives NodeBB.
The bundle includes the MongoDB database, uploads, and NodeBB config volume.

Options:
  -o, --output  Output file path, or a directory path ending in /
  -h, --help    Show this help message
EOF
}

output_path=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        exit 1
      fi
      output_path="$2"
      shift 2
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

if [[ -n "$output_path" && "$output_path" != /* ]]; then
  output_path="$invocation_dir/$output_path"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to create a backup" >&2
  exit 1
fi

cd "$ralphchives_dir"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

mongo_password="${MONGO_PASSWORD:-nodebb}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ -z "$output_path" ]]; then
  output_path="$default_backup_dir/nodebb-backup-$timestamp.tar.gz"
elif [[ "$output_path" == */ || -d "$output_path" ]]; then
  output_path="${output_path%/}/nodebb-backup-$timestamp.tar.gz"
fi

mkdir -p "$(dirname "$output_path")"

started_mongodb=0
temp_dir="$(mktemp -d)"
tmp_output_path=""

cleanup() {
  rm -rf "$temp_dir"

  if [[ -n "$tmp_output_path" ]]; then
    rm -f "$tmp_output_path"
  fi

  if [[ "$started_mongodb" -eq 1 ]]; then
    docker compose stop mongodb >/dev/null
  fi
}

trap cleanup EXIT

if ! docker compose ps --services --status running mongodb | grep -qx "mongodb"; then
  echo "Starting mongodb service for backup..."
  docker compose up -d mongodb >/dev/null
  started_mongodb=1
fi

nodebb_version="$(docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'node -p "require(\"/usr/src/app/package.json\").version"' | tr -d '\r')"

cat > "$temp_dir/manifest.txt" <<EOF
bundle_format=ralphchives-nodebb-backup-v1
created_at_utc=$timestamp
nodebb_version=$nodebb_version
mongo_database=nodebb
includes=mongodb,uploads,config
EOF

docker compose exec -T mongodb mongodump \
  --username nodebb \
  --password "$mongo_password" \
  --authenticationDatabase admin \
  --db nodebb \
  --archive \
  --gzip > "$temp_dir/mongodb.archive.gz"

docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'tar -C /usr/src/app/public -czf - uploads' > "$temp_dir/uploads.tar.gz"

docker compose run --rm --no-deps --entrypoint sh nodebb -lc 'tar -C /opt -czf - config' > "$temp_dir/config.tar.gz"

tmp_output_path="$output_path.tmp"
rm -f "$tmp_output_path"

tar -C "$temp_dir" -czf "$tmp_output_path" manifest.txt mongodb.archive.gz uploads.tar.gz config.tar.gz

mv "$tmp_output_path" "$output_path"
tmp_output_path=""

archive_size="$(du -h "$output_path" | awk '{print $1}')"

echo "Backup bundle created: $output_path"
echo "Bundle size: $archive_size"
echo "Included: MongoDB, uploads, config"