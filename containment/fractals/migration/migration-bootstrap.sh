#!/usr/bin/env bash
set -euo pipefail

# Fractal Migration Agent — Bootstrap Script
# Creates the .migration/ directory structure and seed files.
# Run this ONCE before starting any migration agents.

MIGRATION_DIR=".migration"

if [[ -d "$MIGRATION_DIR" ]]; then
  echo "Error: $MIGRATION_DIR already exists. Remove it first if you want to start fresh."
  exit 1
fi

mkdir -p "$MIGRATION_DIR/agents"
mkdir -p "$MIGRATION_DIR/slices"

# Seed progress.json
cat > "$MIGRATION_DIR/progress.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "cycle": 0,
  "counts": {
    "featuresDiscovered": 0,
    "featuresAnalyzed": 0,
    "slicesPlanned": 0,
    "slicesImplemented": 0,
    "slicesVerified": 0,
    "slicesFailedParity": 0,
    "slicesBlocked": 0,
    "openRisks": { "critical": 0, "high": 0, "medium": 0, "low": 0 }
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsLastCycle": null,
    "newItemsHistory": []
  },
  "passStatus": {
    "discovery": "not-started",
    "semantics": "not-started",
    "planning": "not-started",
    "execution": "not-started",
    "verification": "not-started",
    "gapHunting": "not-started",
    "delivery": "not-started"
  }
}
EOF

# Seed migration-manifest.json (prepend-only — newest entries at top of array)
echo "[]" > "$MIGRATION_DIR/migration-manifest.json"

# Seed context.json — USER MUST FILL THIS IN
cat > "$MIGRATION_DIR/context.json" << 'EOF'
{
  "source": {
    "codePath": "",
    "appUrl": "",
    "authCredentials": {
      "username": "",
      "password": "",
      "notes": "Delete this block if the app has no auth"
    }
  },
  "target": {
    "framework": "",
    "outputDirectory": "",
    "testFramework": "",
    "notes": ""
  },
  "constraints": []
}
EOF

echo "Created $MIGRATION_DIR/ with seed files."
echo ""
echo "NEXT STEPS:"
echo "  1. Edit $MIGRATION_DIR/context.json with your migration parameters"
echo "  2. Run the migration session orchestrator agent"
