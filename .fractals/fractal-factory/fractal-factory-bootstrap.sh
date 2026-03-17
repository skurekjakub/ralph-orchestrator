#!/bin/bash
# Bootstrap for Fractal Factory orchestrator
# Run once before first orchestrator invocation
# Usage: bash fractal-factory-bootstrap.sh [root-dir]

set -euo pipefail

ROOT="${1:-.}"
ARTIFACT_DIR="$ROOT/.fractal-factory"

if [ -d "$ARTIFACT_DIR" ]; then
  echo "Artifact directory already exists at $ARTIFACT_DIR"
  echo "Delete it first if you want a fresh start."
  exit 1
fi

echo "Creating Fractal Factory artifact directory structure..."

# Core directories
mkdir -p "$ARTIFACT_DIR/agents"
mkdir -p "$ARTIFACT_DIR/produced-output/agents"
mkdir -p "$ARTIFACT_DIR/produced-output/schemas"
mkdir -p "$ARTIFACT_DIR/produced-output/skills"
mkdir -p "$ARTIFACT_DIR/produced-output/tests"
mkdir -p "$ARTIFACT_DIR/produced-output/docs"

# Seed: progress.json
cat > "$ARTIFACT_DIR/progress.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "currentPass": 0,
  "passes": {
    "pass1_discovery": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 4,
      "coordinator": "fractal-factory-discovery-coordinator"
    },
    "pass2_analysis": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 3,
      "coordinator": "fractal-factory-planning-coordinator"
    },
    "pass3_planning": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 3,
      "coordinator": "fractal-factory-planning-coordinator"
    },
    "pass4_execution": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 3,
      "coordinator": "fractal-factory-execution-coordinator"
    },
    "pass5_verification": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 2,
      "coordinator": "fractal-factory-verification-coordinator"
    },
    "pass6_gapHunting": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 1,
      "coordinator": "fractal-factory-verification-coordinator"
    },
    "pass7_delivery": {
      "status": "pending",
      "completedAgents": 0,
      "totalAgents": 3,
      "coordinator": "fractal-factory-delivery-coordinator"
    }
  },
  "counts": {
    "subdomainsDiscovered": 0,
    "invariantsExtracted": 0,
    "agentsPlanned": 0,
    "agentsWritten": 0,
    "agentsVerified": 0,
    "agentsBlocked": 0
  },
  "gapHunting": {
    "cyclesCompleted": 0,
    "maxCycles": 3,
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
  "domain": {
    "name": "<FILL: short name for the domain, e.g. 'migration', 'security-audit'>",
    "description": "<FILL: what kind of agent system should be produced>"
  },
  "target": {
    "outputDirectory": "<FILL: absolute or relative path where the produced agent family will be written>",
    "namingPrefix": "<FILL: prefix for all produced agent names, e.g. 'migration'>"
  },
  "inputs": {
    "domainBrief": "<FILL: path to domain-brief.md — narrative description of the domain>",
    "domainDocs": "<FILL: path to directory containing supporting documents>",
    "exemplars": "<FILL: path to directory containing exemplar agent families, or null>",
    "invariants": "<FILL: path to invariants.md — behavioral rules that must be preserved>",
    "constraints": "<FILL: path to constraints.json — bounds and restrictions, or null>"
  },
  "options": {
    "maxDepth": 3,
    "maxAgents": 50,
    "maxGapCycles": 3,
    "maxWriterReviewerRetries": 3,
    "pipelinePasses": ["discovery", "analysis", "planning", "execution", "verification", "gapHunting", "delivery"]
  }
}
EOF

# Seed: domain-model.json (populated by discovery specialists)
cat > "$ARTIFACT_DIR/domain-model.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "subdomains": [],
  "invariants": [],
  "existingAssets": [],
  "exemplarPatterns": []
}
EOF

# Seed: architecture.json (populated by planning specialists)
cat > "$ARTIFACT_DIR/architecture.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "pipeline": null,
  "artifacts": null,
  "depth": null
}
EOF

# Seed: roster.json (populated by roster planner)
cat > "$ARTIFACT_DIR/roster.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "namingPrefix": null,
  "agents": []
}
EOF

# Seed: test-plan.json (populated by test planner)
cat > "$ARTIFACT_DIR/test-plan.json" << 'EOF'
{
  "version": 1,
  "lastUpdated": null,
  "scenarios": []
}
EOF

echo ""
echo "Bootstrapped Fractal Factory at $ARTIFACT_DIR"
echo ""
echo "Next steps:"
echo "  1. Edit $ARTIFACT_DIR/context.json — fill in all <FILL:...> values"
echo "  2. Place your domain-brief.md, domain-docs/, invariants.md, and optional exemplars/ at the paths specified in context.json"
echo "  3. Invoke the guide: @fractal-factory-guide"
echo ""
