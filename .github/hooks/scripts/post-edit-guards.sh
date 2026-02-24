#!/usr/bin/env bash
# Post-Edit Guards — PostToolUse hook
# Runs after file edits to enforce:
#   1. Composition root DI (only factory imports concrete classes)
#   2. ESM .js extension on all relative imports
#   3. No re-exports
#   4. Test mock interface types (Mocked<IFoo>, not Mocked<Foo>)
set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.toolName // empty')

# Only inspect file-editing tools
case "$TOOL_NAME" in
  create_file|replace_string_in_file|multi_replace_string_in_file|edit_file|write_file|insert_code) ;;
  *) exit 0 ;;
esac

# Extract the file path from various possible input shapes
FILE_PATH=$(echo "$INPUT" | jq -r '
  .input.filePath // .input.path // .toolInput.filePath // .toolInput.path // empty
')

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Only check .ts/.tsx files under src/ or tests/
case "$FILE_PATH" in
  */src/*.ts|*/src/*.tsx|*/tests/*.ts|*/tests/*.tsx) ;;
  *) exit 0 ;;
esac

MESSAGES=()

# --- Guard 1: Composition Root (src/ files only, skip factory) ---
if [[ "$FILE_PATH" == */src/*.ts ]] && [[ "$FILE_PATH" != */orchestrator-factory.ts ]]; then
  # Known concrete classes that must only be imported in the factory
  CONCRETE_CLASSES='JiraClient|JiraPoller|LogCollector|PromptBuilder|ActivityLog|ProfileRouter|TaskRunner|TaskJiraResourceManager|JiraIssueManager|HeartbeatSender|OperationLedger|TriggerScanner|ContainerManager|ComposeClient|ComposeFileResolver|AgentTemplateRenderer|JitMcpConfigWriter|CliExecutorFactory|RepoSyncHook|ContainerLogCollector|ContainerWorkspaceCleaner|LogSourceRegistry|ContinuationRunner|PromptInjectionAuditor|ContentNormalizer'

  # Match non-type imports of concrete classes: import { Foo } from (not: import type { Foo })
  if grep -Pn "^\s*import\s+\{[^}]*(${CONCRETE_CLASSES})" "$FILE_PATH" 2>/dev/null | grep -Pv '^\s*import\s+type\b' | grep -qv '^\s*$'; then
    VIOLATIONS=$(grep -Pn "^\s*import\s+\{[^}]*(${CONCRETE_CLASSES})" "$FILE_PATH" 2>/dev/null | grep -Pv 'import\s+type\b' || true)
    MESSAGES+=("DI VIOLATION: Only orchestrator-factory.ts may import concrete classes. This file imports implementation classes directly. Use the I-prefixed interface instead (e.g., IJiraClient, ITaskRunner). Violations found:\n${VIOLATIONS}")
  fi
fi

# --- Guard 2: ESM .js extensions on relative imports ---
if [[ "$FILE_PATH" == */src/*.ts ]] || [[ "$FILE_PATH" == */tests/*.ts ]]; then
  # Match relative imports/exports missing .js: from "./foo" or from "../foo" (not ending in .js" or .json" or .jsx")
  BAD_IMPORTS=$(grep -Pn '(from|import)\s+["\x27]\.\.?\/[^"'\'']*[^.][^j][^s][^o]?[^n]?["\x27]' "$FILE_PATH" 2>/dev/null || true)
  # More precise: relative paths that don't end with a known extension
  BAD_IMPORTS=$(grep -Pn '(?:from|import)\s+["'\''](\.\.?\/(?!.*\.(js|json|jsx|ts|tsx|css|md)["'\''])[^"'\'']+)["'\'']' "$FILE_PATH" 2>/dev/null || true)

  if [[ -n "$BAD_IMPORTS" ]]; then
    MESSAGES+=("ESM IMPORT: All relative imports must use .js extensions (NodeNext resolution). Missing .js extension:\n${BAD_IMPORTS}")
  fi
fi

# --- Guard 3: No re-exports ---
if [[ "$FILE_PATH" == */src/*.ts ]]; then
  REEXPORTS=$(grep -Pn '^\s*export\s+\{[^}]*\}\s+from\s+' "$FILE_PATH" 2>/dev/null || true)

  if [[ -n "$REEXPORTS" ]]; then
    # Allow "export type { ... } from" — only flag value re-exports
    VALUE_REEXPORTS=$(echo "$REEXPORTS" | grep -Pv 'export\s+type\s+\{' || true)
    if [[ -n "$VALUE_REEXPORTS" ]]; then
      MESSAGES+=("NO RE-EXPORTS: This project prohibits re-exports and barrel files. Update import sites to point directly to the source module. Found:\n${VALUE_REEXPORTS}")
    fi
  fi
fi

# --- Guard 4: Test mock interface types ---
if [[ "$FILE_PATH" == */tests/*.ts ]]; then
  # Mocked<Foo> where Foo does NOT start with I followed by uppercase
  BAD_MOCKS=$(grep -Pn 'Mocked<(?!I[A-Z])\w+>' "$FILE_PATH" 2>/dev/null || true)

  if [[ -n "$BAD_MOCKS" ]]; then
    MESSAGES+=("TEST MOCK TYPES: Use Mocked<IFoo> (interface), not Mocked<Foo> (class). Class types have private fields that prevent structural matching. Found:\n${BAD_MOCKS}")
  fi
fi

# --- Output ---
if [[ ${#MESSAGES[@]} -gt 0 ]]; then
  # Join all messages
  COMBINED=""
  for msg in "${MESSAGES[@]}"; do
    COMBINED="${COMBINED}${msg}\n\n"
  done

  # Escape for JSON
  ESCAPED=$(echo -e "$COMBINED" | jq -Rs .)

  cat <<EOF
{
  "systemMessage": ${ESCAPED}
}
EOF
fi

exit 0
