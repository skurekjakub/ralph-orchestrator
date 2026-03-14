# Bootstrap Script Template

The bootstrap script creates the artifact directory and seed files before the first orchestrator run. It runs once, typically as a shell script.

## Generalized Template

```bash
#!/bin/bash
# Bootstrap for <domain> fractal orchestrator
# Run once before first orchestrator invocation
# Usage: bash <domain>-bootstrap.sh [root-dir]

set -euo pipefail

ROOT="${1:-.}"
ARTIFACT_DIR="$ROOT/.<domain>"

if [ -d "$ARTIFACT_DIR" ]; then
  echo "Artifact directory already exists at $ARTIFACT_DIR"
  echo "Delete it first if you want a fresh start."
  exit 1
fi

echo "Creating artifact directory structure..."

# Core directories
mkdir -p "$ARTIFACT_DIR/agents"
mkdir -p "$ARTIFACT_DIR/<work-units>"    # e.g., slices/, findings/, fixes/

# Seed: progress.json
cat > "$ARTIFACT_DIR/progress.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "currentPass": 0,
  "passStatus": {
    "pass1_discovery": "not-started",
    "pass2_analysis": "not-started",
    "pass3_planning": "not-started",
    "pass4_execution": "not-started",
    "pass5_verification": "not-started",
    "pass6_gapHunting": "not-started",
    "pass7_delivery": "not-started"
  },
  "counts": {
    "itemsDiscovered": 0,
    "itemsAnalyzed": 0,
    "unitsPlanned": 0,
    "unitsImplemented": 0,
    "unitsVerified": 0,
    "unitsBlocked": 0,
    "unitsFailedParity": 0
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsPerCycle": [],
    "converged": false
  }
}
EOF

# Seed: empty manifest
cat > "$ARTIFACT_DIR/manifest.json" << 'EOF'
[]
EOF

# Seed: context.json template
cat > "$ARTIFACT_DIR/context.json" << 'EOF'
{
  "version": 1,
  "domain": "<FILL: what is being processed>",
  "source": {
    "codePath": "<FILL: path to source material>",
    "description": "<FILL: what we're working with>"
  },
  "target": {
    "outputDirectory": "<FILL: where results go>",
    "description": "<FILL: desired outcome>"
  },
  "parameters": {
    "<FILL: domain-specific key>": "<FILL: value>"
  }
}
EOF

echo ""
echo "Bootstrapped at $ARTIFACT_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit $ARTIFACT_DIR/context.json — fill in all <FILL:...> values"
echo "  2. Invoke the session orchestrator: @<domain>"
echo ""
```

## Key Design Decisions

### Why a script, not an agent?

The bootstrap is a shell script, not an agent, because:
1. It must create the directory structure that agents expect to exist
2. It's purely mechanical (no intelligence needed)
3. It needs to run BEFORE any agent can be invoked
4. It must be idempotent-safe (refuse to run if directory exists)

### Guard against re-initialization

The `if [ -d "$ARTIFACT_DIR" ]` guard prevents accidental re-bootstrap that would wipe all progress. This is critical for crash recovery — restarting should resume the pipeline, not reinitialize it.

### Seed file completeness

Every seed file must have valid JSON that agents can parse without error. Use zero/null/empty values, not placeholders. The `context.json` is the only file with placeholders because it requires human input.

### Pass naming in progress.json

Name passes by both number and purpose: `pass1_discovery`, `pass2_analysis`. This makes the file readable by humans and parseable by agents. The orchestrator can use string matching or field enumeration.

## Customizing for Your Domain

1. Replace `<domain>` with your domain name everywhere
2. Replace `<work-units>` with the appropriate per-unit directory name (slices, findings, fixes, etc.)
3. Add domain-specific seed files if needed (e.g., a `config.json` for tool paths)
4. Adjust the `context.json` template with domain-relevant fields
5. Remove passes from `progress.json` that don't apply to your pipeline

## Integration with Agent Guide

Pair the bootstrap script with a user guide agent (optional but recommended):

```markdown
---
name: '<domain>-guide'
description: 'User guide for the <domain> agent system'
user-invocable: true
---

# <Domain> Agent System — User Guide

## Quick Start

1. Run bootstrap: `bash <domain>-bootstrap.sh /path/to/repo`
2. Edit `.<domain>/context.json` — fill in source, target, parameters
3. Invoke the orchestrator: @<domain>
4. The system runs autonomously from here

## Monitoring Progress

Check `.<domain>/progress.json` for pipeline status at any time.

## Stopping and Resuming

Kill the session at any time. Restart by invoking @<domain> again.
The orchestrator reads all status files and resumes where it left off.
```
