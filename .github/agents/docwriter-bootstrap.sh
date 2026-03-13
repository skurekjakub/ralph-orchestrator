#!/bin/bash
# Bootstrap for docwriter fractal orchestrator (29-agent pipeline)
# Run once before first orchestrator invocation
# Usage: bash docwriter-bootstrap.sh [--clean] [root-dir]
#
# Passes: 0 (knowledge curation) → 1 (discovery) → 2 (analysis) → 3 (planning)
#         → 4 (execution) → 5 (verification) → 6 (gap hunting) → 6.5 (synthesis)
#         → 7 (delivery)
#
# --clean: Re-run mode — preserves .docwriter/meta/ (accumulated knowledge)
#          while resetting all other artifacts for a fresh pipeline run.

set -euo pipefail

CLEAN_MODE=false
if [[ "${1:-}" == "--clean" ]]; then
  CLEAN_MODE=true
  shift
fi

ROOT="${1:-.}"
ARTIFACT_DIR="$ROOT/.docwriter"

if [ "$CLEAN_MODE" = true ]; then
  if [ ! -d "$ARTIFACT_DIR" ]; then
    echo "Error: $ARTIFACT_DIR does not exist. Run without --clean first."
    exit 1
  fi
  echo "Clean mode: preserving meta/ and resetting pipeline artifacts..."

  # Preserve meta/ and synthesis-signals/ (accumulated knowledge)
  # Remove everything else
  find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 \
    ! -name "meta" \
    ! -name "synthesis-signals" \
    -exec rm -rf {} +

  # Recreate core directories
  mkdir -p "$ARTIFACT_DIR/agents"
  mkdir -p "$ARTIFACT_DIR/tasks"
  mkdir -p "$ARTIFACT_DIR/synthesis-signals"
elif [ -d "$ARTIFACT_DIR" ]; then
  echo "Artifact directory already exists at $ARTIFACT_DIR"
  echo "Delete it first if you want a fresh start, or use --clean to preserve meta-knowledge."
  exit 1
else
  echo "Creating .docwriter/ artifact directory..."

  # Core directories
  mkdir -p "$ARTIFACT_DIR/agents"
  mkdir -p "$ARTIFACT_DIR/tasks"

  # Meta-knowledge directories (persistent across --clean runs)
  mkdir -p "$ARTIFACT_DIR/meta/patterns"
  mkdir -p "$ARTIFACT_DIR/meta/anti-patterns"
  mkdir -p "$ARTIFACT_DIR/meta/domain-insights"
  mkdir -p "$ARTIFACT_DIR/meta/task-retros"
  mkdir -p "$ARTIFACT_DIR/meta/style-evolutions"

  # Synthesis signals directory
  mkdir -p "$ARTIFACT_DIR/synthesis-signals"
fi

# Seed: progress.json (always regenerated)
cat > "$ARTIFACT_DIR/progress.json" << 'EOF'
{
  "version": 2,
  "lastUpdated": null,
  "currentPass": 0,
  "passStatus": {
    "pass0_knowledgeCuration": "not-started",
    "pass1_discovery": "not-started",
    "pass2_analysis": "not-started",
    "pass3_planning": "not-started",
    "pass4_execution": "not-started",
    "pass5_verification": "not-started",
    "pass6_gapHunting": "not-started",
    "pass65_knowledgeSynthesis": "not-started",
    "pass7_delivery": "not-started"
  },
  "counts": {
    "changesDiscovered": 0,
    "docPagesIndexed": 0,
    "invariantsExtracted": 0,
    "impactsMapped": 0,
    "tasksPlanned": 0,
    "tasksWritten": 0,
    "tasksVerified": 0,
    "tasksBlocked": 0,
    "knowledgePatternsCurated": 0,
    "researchRecommendationsApproved": 0,
    "knowledgeEntriesNew": 0,
    "skillFilesRegenerated": 0
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "newItemsPerCycle": [],
    "converged": false
  }
}
EOF

# Seed: meta/index.json (only on fresh bootstrap, not --clean)
if [ "$CLEAN_MODE" = false ]; then
  cat > "$ARTIFACT_DIR/meta/index.json" << 'EOF'
{
  "version": 1,
  "lastSynthesized": null,
  "entries": []
}
EOF

  # Seed: meta/research-sources.json
  cat > "$ARTIFACT_DIR/meta/research-sources.json" << 'EOF'
{
  "version": 1,
  "sources": [
    {
      "id": "SRC-001",
      "name": "Google Developer Documentation Style Guide",
      "url": "https://developers.google.com/style",
      "domains": ["style", "api-reference", "general"],
      "addedBy": "bootstrap",
      "addedDate": null,
      "usageCount": 0,
      "lastUsed": null,
      "effectiveness": null,
      "deprecated": false
    },
    {
      "id": "SRC-002",
      "name": "Diátaxis Documentation Framework",
      "url": "https://diataxis.fr/",
      "domains": ["structure", "conceptual", "tutorial", "howto", "reference"],
      "addedBy": "bootstrap",
      "addedDate": null,
      "usageCount": 0,
      "lastUsed": null,
      "effectiveness": null,
      "deprecated": false
    },
    {
      "id": "SRC-003",
      "name": "Microsoft Writing Style Guide",
      "url": "https://learn.microsoft.com/en-us/style-guide/welcome/",
      "domains": ["style", "accessibility", "general"],
      "addedBy": "bootstrap",
      "addedDate": null,
      "usageCount": 0,
      "lastUsed": null,
      "effectiveness": null,
      "deprecated": false
    },
    {
      "id": "SRC-004",
      "name": "Write the Docs — Documentation Guide",
      "url": "https://www.writethedocs.org/guide/",
      "domains": ["general", "structure", "style"],
      "addedBy": "bootstrap",
      "addedDate": null,
      "usageCount": 0,
      "lastUsed": null,
      "effectiveness": null,
      "deprecated": false
    }
  ]
}
EOF
fi

# Seed: empty manifest (always regenerated)
cat > "$ARTIFACT_DIR/manifest.json" << 'EOF'
[]
EOF

# Seed: context.json template (always regenerated)
cat > "$ARTIFACT_DIR/context.json" << 'EOF'
{
  "version": 1,
  "source": {
    "repoPath": "<FILL: path to cloned source repo, e.g. resources/repositories/xperience>",
    "diffRef": "<FILL: branch name or commit SHA to diff>",
    "baseBranch": "<FILL: base branch to diff against, e.g. main>"
  },
  "docs": {
    "workspacePath": "<FILL: path to Jekyll doc workspace root, e.g. src/>",
    "contentCollections": ["<FILL: e.g. documentation, guides, api>"]
  },
  "invariants": {
    "guidelinesPath": "<FILL: path to guidelines/invariants folder, e.g. resources/guidelines/>"
  },
  "output": {
    "branch": "<FILL: git branch name for doc changes, e.g. docs/feature-xyz>"
  }
}
EOF

echo ""
if [ "$CLEAN_MODE" = true ]; then
  echo "Clean bootstrap at $ARTIFACT_DIR (meta-knowledge preserved)"
else
  echo "Bootstrapped at $ARTIFACT_DIR"
fi
echo ""
echo "Next steps:"
echo "  1. Edit $ARTIFACT_DIR/context.json — fill in all <FILL:...> values"
echo "  2. Invoke the session orchestrator: @docwriter"
echo ""
