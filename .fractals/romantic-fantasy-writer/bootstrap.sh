#!/usr/bin/env bash
# =============================================================================
# Romantic Fantasy Writer — Bootstrap Script
# =============================================================================
# Seeds the artifact directory for a new story production session.
# Run once per story. Guards against re-initialization.
#
# Usage:
#   ./bootstrap.sh <story-id> [series-id]
#
# Example:
#   ./bootstrap.sh book-1
#   ./bootstrap.sh book-2 crimson-court-trilogy
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------
STORY_ID="${1:?Usage: ./bootstrap.sh <story-id> [series-id]}"
SERIES_ID="${2:-}"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ARTIFACT_DIR=".romantic-fantasy-writer"
STORY_DIR="${ARTIFACT_DIR}/stories/${STORY_ID}"

# ---------------------------------------------------------------------------
# Guard: prevent double-init
# ---------------------------------------------------------------------------
if [[ -d "${STORY_DIR}" ]]; then
  echo "ERROR: Story directory already exists: ${STORY_DIR}"
  echo "       Delete it manually if you want to re-initialize."
  exit 1
fi

echo "=== Romantic Fantasy Writer — Bootstrap ==="
echo "Story ID: ${STORY_ID}"
[[ -n "${SERIES_ID}" ]] && echo "Series ID: ${SERIES_ID}"
echo ""

# ---------------------------------------------------------------------------
# 1. Create top-level artifact directory
# ---------------------------------------------------------------------------
mkdir -p "${ARTIFACT_DIR}"

# ---------------------------------------------------------------------------
# 2. Create story directory tree
# ---------------------------------------------------------------------------
echo "[1/6] Creating directory structure..."

# Core story directories
mkdir -p "${STORY_DIR}/world-bible"
mkdir -p "${STORY_DIR}/characters"
mkdir -p "${STORY_DIR}/plot"
mkdir -p "${STORY_DIR}/plot/chapter-outlines"
mkdir -p "${STORY_DIR}/style"
mkdir -p "${STORY_DIR}/craft-tracking"
mkdir -p "${STORY_DIR}/continuity"

# Per-chapter directories (created dynamically, but seed chapter-001)
mkdir -p "${STORY_DIR}/chapters/001"
mkdir -p "${STORY_DIR}/revision-reports/001"
mkdir -p "${STORY_DIR}/beta-feedback/001"
mkdir -p "${STORY_DIR}/beta-synthesis"
mkdir -p "${STORY_DIR}/chapter-summaries"

# Audit and delivery
mkdir -p "${STORY_DIR}/audit-reports/concept"
mkdir -p "${STORY_DIR}/audit-reports/worldbuilding"
mkdir -p "${STORY_DIR}/audit-reports/character"
mkdir -p "${STORY_DIR}/audit-reports/plotting"
mkdir -p "${STORY_DIR}/audit-reports/style"
mkdir -p "${STORY_DIR}/audit-reports/drafting"
mkdir -p "${STORY_DIR}/audit-reports/revision"
mkdir -p "${STORY_DIR}/audit-reports/beta-reading"
mkdir -p "${STORY_DIR}/audit-reports/polish"
mkdir -p "${STORY_DIR}/delivery"

# Agent status directories (one per agent)
AGENTS=(
  "romantic-fantasy-writer"
  "romantic-fantasy-writer-guide"
  "romantic-fantasy-writer-concept-coordinator"
  "romantic-fantasy-writer-concept-developer"
  "romantic-fantasy-writer-craft-profile-selector"
  "romantic-fantasy-writer-concept-auditor"
  "romantic-fantasy-writer-worldbuilding-coordinator"
  "romantic-fantasy-writer-physical-world-coordinator"
  "romantic-fantasy-writer-systems-world-coordinator"
  "romantic-fantasy-writer-geography-builder"
  "romantic-fantasy-writer-culture-builder"
  "romantic-fantasy-writer-history-builder"
  "romantic-fantasy-writer-magic-system-designer"
  "romantic-fantasy-writer-political-structure-builder"
  "romantic-fantasy-writer-worldbuilding-auditor"
  "romantic-fantasy-writer-character-coordinator"
  "romantic-fantasy-writer-core-characters-coordinator"
  "romantic-fantasy-writer-ensemble-coordinator"
  "romantic-fantasy-writer-protagonist-profiler"
  "romantic-fantasy-writer-romance-arc-designer"
  "romantic-fantasy-writer-supporting-cast-developer"
  "romantic-fantasy-writer-character-voice-designer"
  "romantic-fantasy-writer-character-auditor"
  "romantic-fantasy-writer-plotting-coordinator"
  "romantic-fantasy-writer-structural-design-coordinator"
  "romantic-fantasy-writer-chapter-design-coordinator"
  "romantic-fantasy-writer-structure-selector"
  "romantic-fantasy-writer-dual-arc-builder"
  "romantic-fantasy-writer-tension-mapper"
  "romantic-fantasy-writer-chapter-outliner"
  "romantic-fantasy-writer-scene-beat-designer"
  "romantic-fantasy-writer-plotting-auditor"
  "romantic-fantasy-writer-style-coordinator"
  "romantic-fantasy-writer-style-analyzer"
  "romantic-fantasy-writer-style-guide-writer"
  "romantic-fantasy-writer-style-auditor"
  "romantic-fantasy-writer-drafting-coordinator"
  "romantic-fantasy-writer-creative-writing-coordinator"
  "romantic-fantasy-writer-quality-integration-coordinator"
  "romantic-fantasy-writer-chapter-drafter"
  "romantic-fantasy-writer-pov-voice-maintainer"
  "romantic-fantasy-writer-continuity-integrator"
  "romantic-fantasy-writer-craft-enforcer"
  "romantic-fantasy-writer-drafting-auditor"
  "romantic-fantasy-writer-revision-coordinator"
  "romantic-fantasy-writer-developmental-editor"
  "romantic-fantasy-writer-line-editor"
  "romantic-fantasy-writer-copy-editor"
  "romantic-fantasy-writer-chapter-reviser"
  "romantic-fantasy-writer-revision-auditor"
  "romantic-fantasy-writer-beta-reading-coordinator"
  "romantic-fantasy-writer-genre-lens-coordinator"
  "romantic-fantasy-writer-craft-lens-coordinator"
  "romantic-fantasy-writer-romance-beta-reader"
  "romantic-fantasy-writer-fantasy-beta-reader"
  "romantic-fantasy-writer-craft-beta-reader"
  "romantic-fantasy-writer-sensitivity-beta-reader"
  "romantic-fantasy-writer-originality-beta-reader"
  "romantic-fantasy-writer-beta-synthesizer"
  "romantic-fantasy-writer-beta-reading-auditor"
  "romantic-fantasy-writer-polish-coordinator"
  "romantic-fantasy-writer-polisher"
  "romantic-fantasy-writer-summary-generator"
  "romantic-fantasy-writer-delivery-assembler"
  "romantic-fantasy-writer-continuity-tracker"
  "romantic-fantasy-writer-series-kb-manager"
  "romantic-fantasy-writer-craft-tracker"
)

mkdir -p "${STORY_DIR}/agents"
for agent in "${AGENTS[@]}"; do
  mkdir -p "${STORY_DIR}/agents/${agent}"
done

echo "  Created $(find "${STORY_DIR}" -type d | wc -l) directories."

# ---------------------------------------------------------------------------
# 3. Seed story-config.json (template for user to fill)
# ---------------------------------------------------------------------------
echo "[2/6] Seeding story-config.json template..."

CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${STORY_DIR}/story-config.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "seriesId": $([ -n "${SERIES_ID}" ] && echo "\"${SERIES_ID}\"" || echo "null"),
  "storyIdea": "",
  "targetWordCount": 80000,
  "mood": null,
  "characterSketches": null,
  "worldFragments": null,
  "styleSamples": null,
  "constraints": null,
  "sequelOf": null,
  "confirmedByUser": false,
  "createdAt": "${CREATED_AT}"
}
HEREDOC

# ---------------------------------------------------------------------------
# 4. Seed progress.json
# ---------------------------------------------------------------------------
echo "[3/6] Seeding progress.json..."

cat > "${STORY_DIR}/progress.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "currentPhase": "not-started",
  "phaseStatuses": {
    "concept":       { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "worldbuilding": { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "character":     { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "plotting":      { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "style":         { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "drafting":      { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "revision":      { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "beta-reading":  { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null },
    "polish":        { "status": "pending", "startedAt": null, "completedAt": null, "gateResult": null }
  },
  "chapterProgress": [],
  "currentChapter": null,
  "gapCycles": 0,
  "revisionBetaCycles": 0,
  "lastUpdated": "${CREATED_AT}"
}
HEREDOC

# ---------------------------------------------------------------------------
# 5. Seed manifest.json (empty array, newest-first append)
# ---------------------------------------------------------------------------
echo "[4/6] Seeding manifest.json..."

cat > "${STORY_DIR}/manifest.json" << 'HEREDOC'
[]
HEREDOC

# ---------------------------------------------------------------------------
# 6. Seed cross-cutting tracker artifacts
# ---------------------------------------------------------------------------
echo "[5/6] Seeding cross-cutting tracker artifacts..."

cat > "${STORY_DIR}/continuity/continuity-tracker.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "timeline": [],
  "characterPositions": {},
  "characterKnowledge": {},
  "activePromises": [],
  "namingRegistry": {},
  "lastUpdatedChapter": 0
}
HEREDOC

cat > "${STORY_DIR}/continuity/foreshadowing-ledger.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "entries": [],
  "completionRate": 0,
  "lastUpdatedChapter": 0
}
HEREDOC

cat > "${STORY_DIR}/continuity/information-asymmetry-map.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "facts": [],
  "dramaticIronyPoints": [],
  "lastUpdatedChapter": 0
}
HEREDOC

cat > "${STORY_DIR}/continuity/mystery-box-inventory.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "boxes": [],
  "activeCount": 0,
  "perChapterSnapshot": [],
  "lastUpdatedChapter": 0
}
HEREDOC

cat > "${STORY_DIR}/continuity/emotional-throughline.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "characters": {},
  "varietyCheck": {},
  "lastUpdatedChapter": 0
}
HEREDOC

cat > "${STORY_DIR}/craft-tracking/symbolic-motif-registry.json" << HEREDOC
{
  "storyId": "${STORY_ID}",
  "motifs": [],
  "lastUpdatedChapter": 0
}
HEREDOC

# ---------------------------------------------------------------------------
# 7. Seed series KB (only if series-id provided)
# ---------------------------------------------------------------------------
echo "[6/6] Seeding series knowledge base..."

if [[ -n "${SERIES_ID}" ]]; then
  SERIES_DIR="${ARTIFACT_DIR}/series/${SERIES_ID}"
  mkdir -p "${SERIES_DIR}"

  if [[ ! -f "${SERIES_DIR}/index.json" ]]; then
    cat > "${SERIES_DIR}/index.json" << HEREDOC
{
  "seriesId": "${SERIES_ID}",
  "books": [],
  "crossBookFacts": [],
  "unresolvedThreads": [],
  "namingConventions": {},
  "lastUpdated": "${CREATED_AT}"
}
HEREDOC
    echo "  Created series KB: ${SERIES_DIR}/index.json"
  else
    echo "  Series KB already exists: ${SERIES_DIR}/index.json (preserved)"
  fi
else
  echo "  Standalone story — no series KB created."
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Bootstrap Complete ==="
echo "Story directory: ${STORY_DIR}"
echo "Agent directories: ${#AGENTS[@]}"
echo ""
echo "Next steps:"
echo "  1. Edit ${STORY_DIR}/story-config.json with your story idea"
echo "  2. Set 'confirmedByUser' to true"
echo "  3. Invoke the romantic-fantasy-writer-guide agent"
echo ""
