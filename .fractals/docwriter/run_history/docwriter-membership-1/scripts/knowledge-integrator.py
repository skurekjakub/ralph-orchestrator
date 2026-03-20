#!/usr/bin/env python3
"""
Knowledge Integrator — Pass 6.5
Cold-start run: all signals → low confidence (first run).
Multi-observation within same run can promote to low with strong evidence note,
but NEVER above low on first run per strict ladder rules.
"""

import json
import os
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f+00:00")
NOW_SHORT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")
BASE = "/workspace/.docwriter"

# Load inputs
with open(f"{BASE}/synthesis-signals/task-signals.json") as f:
    task_signals = json.load(f)
with open(f"{BASE}/synthesis-signals/context-signals.json") as f:
    ctx_signals = json.load(f)
with open(f"{BASE}/meta/index.json") as f:
    index = json.load(f)
with open(f"{BASE}/meta/research-sources.json") as f:
    research_sources = json.load(f)

# ═══════════════════════════════════════════════════════════════
# STEP 1: Collect all candidate signals from both analyzers
# ═══════════════════════════════════════════════════════════════

candidates = []

# A-series: Aggregate signals from task-signal analyzer
for sig in task_signals["aggregateSignals"]:
    candidates.append({
        "source": "task-signals",
        "sourceId": sig["id"],
        "type": sig["type"],
        "strength": sig["strength"],
        "title": sig["title"],
        "evidence": sig["evidence"],
        "recommendation": sig["recommendation"],
    })

# A-series: Style evolutions
for i, se in enumerate(task_signals["styleEvolutions"]):
    candidates.append({
        "source": "task-signals",
        "sourceId": f"STYLE-EVO-{i+1:03d}",
        "type": "style-evolution",
        "strength": se["strength"],
        "title": se["observation"][:80],
        "evidence": se["description"],
        "involvedInvariant": se.get("involvedInvariant", "N/A"),
        "occurrences": se.get("occurrences", 1),
    })

# B-series: Gap signals
for gs in ctx_signals["gapSignals"]:
    sig = gs["signal"]
    candidates.append({
        "source": "context-signals",
        "sourceId": gs["id"],
        "type": sig["type"],
        "strength": sig["strength"],
        "title": sig["description"][:80],
        "evidence": sig["description"],
        "category": sig.get("category", ""),
        "gapType": gs.get("gapType", ""),
        "predictable": gs.get("predictable", False),
    })

# B-series: Domain insights
for di in ctx_signals["domainInsights"]:
    candidates.append({
        "source": "context-signals",
        "sourceId": di["id"],
        "type": "domain-insight",
        "strength": di["strength"],
        "title": di["observation"][:80],
        "evidence": di["evidence"],
        "category": di.get("category", ""),
    })

# B-series: Standalone signals from effectiveness sections
for section_name, section_data in [
    ("riskAnalysisEffectiveness", ctx_signals["riskAnalysisEffectiveness"]),
    ("impactMappingAccuracy", ctx_signals["impactMappingAccuracy"]),
    ("invariantEffectiveness", ctx_signals["invariantEffectiveness"]),
    ("verificationEffectiveness", ctx_signals["verificationEffectiveness"]),
    ("pipelineConvergenceFactors", ctx_signals["pipelineConvergenceFactors"]),
    ("changeInventoryAnalysis", ctx_signals["changeInventoryAnalysis"]),
]:
    sig = section_data.get("signal")
    if sig:
        candidates.append({
            "source": "context-signals",
            "sourceId": f"CTX-{section_name}",
            "type": sig["type"],
            "strength": sig["strength"],
            "title": sig["description"][:80],
            "evidence": sig["description"],
            "category": sig.get("category", ""),
        })

print(f"Total candidates collected: {len(candidates)}")
for c in candidates:
    print(f"  [{c['type']:30s}] [{c['strength']:6s}] {c['sourceId']:20s} — {c['title'][:60]}")

# ═══════════════════════════════════════════════════════════════
# STEP 2: Deduplication
# ═══════════════════════════════════════════════════════════════

# Since index is empty (cold start), dedup is only between A-series and B-series
# Check for overlapping signals

# Known overlaps to merge:
# - AGG-005 (business-user UI challenges) ↔ CTXDOM-005 (XbK admin UI vocabulary) ↔ CTX-riskAnalysis (risk underweights biz-user)
# - AGG-002 (create-action higher rejection) ↔ STYLE-EVO-003 (redirect_from) ↔ STYLE-EVO-004 (page_link identifiers) — related but distinct
# - CTXGAP-001 (sibling reference miss) ↔ CTXDOM-003 (dual-page API pattern) ↔ CTX-impactMapping (91% coverage)

dedup_merges = {
    # business-user UI complexity: merge AGG-005, CTXDOM-005, risk signal into one domain insight + one anti-pattern
    # Keep CTXDOM-005 as domain insight, convert AGG-005 to anti-pattern, risk signal is actionable variant
    # Actually they serve different purposes: CTXDOM-005 = domain knowledge, AGG-005 = observation, risk = anti-pattern
    # Keep all three — they're distinct (vocabulary, accuracy challenges, risk scoring gap)
    
    # Impact mapping sibling miss: CTXGAP-001, CTXDOM-003, CTX-impactMapping
    # CTXGAP-001 = anti-pattern (sibling miss), CTXDOM-003 = domain insight (dual-page pattern), CTX-impactMapping = pattern (91% coverage)
    # These are different perspectives on the same area — keep all three as distinct entries
}

# Mark overlaps for cross-referencing rather than merging
overlap_groups = [
    {
        "group": "business-user-complexity",
        "members": ["AGG-005", "CTXDOM-005", "CTX-riskAnalysisEffectiveness"],
        "action": "keep-all-cross-reference",
    },
    {
        "group": "impact-mapping-gaps",
        "members": ["CTXGAP-001", "CTXDOM-003", "CTX-impactMappingAccuracy"],
        "action": "keep-all-cross-reference",
    },
    {
        "group": "create-task-challenges",
        "members": ["AGG-002", "STYLE-EVO-003", "STYLE-EVO-004"],
        "action": "keep-all-cross-reference",
    },
]

# No actual merges needed — signals are all distinct enough

# ═══════════════════════════════════════════════════════════════
# STEP 3: Quality Gate — Three Criteria
# ═══════════════════════════════════════════════════════════════

def quality_gate(candidate):
    """Returns (pass, reason) tuple."""
    title = candidate.get("title", "")
    evidence = candidate.get("evidence", "")
    ctype = candidate["type"]
    
    # 1. Reusability: Would this insight be useful for future runs with different domains?
    # Reject hyper-specific signals that only apply to one page
    
    # 2. Actionability: Can downstream agents concretely act on this?
    
    # 3. Non-redundancy: Does this add beyond what invariant system already enforces?
    
    # --- Specific rejections ---
    
    # AGG-006 "Research recommendations improve coverage but don't prevent style rejections"
    # This is a truism — research and style invariants are obviously orthogonal.
    # Fails actionability: what would a downstream agent do differently?
    if candidate["sourceId"] == "AGG-006":
        return (False, "Fails actionability: the observation that research and invariants serve orthogonal purposes is a truism with no concrete action for downstream agents.")
    
    # CTXGAP-005 (convergence signal) — this is a positive observation, not a reusable pattern.
    # The pipeline converging is a result, not an actionable insight. BUT the conditions listed ARE useful.
    # Keep it — the conditions for single-cycle convergence are actionable.
    
    # STYLE-EVO-006 (pre-existing icon errors caught by accuracy reviewer)
    # This is about accuracy reviewer behavior, not a reusable writing pattern.
    # Fails reusability: icon errors are hyper-specific to lock→diamond change.
    if candidate["sourceId"] == "STYLE-EVO-006":
        return (False, "Fails reusability: specific icon class change (xp-lock→xp-diamond) is not generalizable. The accuracy reviewer already catches pre-existing errors by design.")
    
    # STYLE-EVO-007 (Unicode arrow vs ASCII arrow)
    # This is a candidate for invariant revision, not a knowledge entry.
    # Fails non-redundancy: INV-style-046 already covers this; the signal is about invariant revision, not pipeline knowledge.
    # Actually — the observation that existing codebase uses → but invariant says -> IS useful. Keep as style-evolution.
    
    # CTXGAP-004 (out-of-scope _guides collection)
    # Useful domain insight about multi-collection documentation
    
    return (True, "Passes all three criteria")

passed = []
discarded = []

for c in candidates:
    ok, reason = quality_gate(c)
    if ok:
        passed.append(c)
    else:
        discarded.append({"sourceId": c["sourceId"], "title": c["title"][:60], "reason": reason})

print(f"\nQuality gate: {len(passed)} passed, {len(discarded)} discarded")
for d in discarded:
    print(f"  DISCARDED: {d['sourceId']} — {d['reason'][:80]}")

# ═══════════════════════════════════════════════════════════════
# STEP 4: Confidence Calibration
# ═══════════════════════════════════════════════════════════════

# COLD START: All entries get confidence=low
# Even "medium" strength signals from analyzers get low confidence — 
# the strength is the analyzer's assessment, but the confidence ladder
# requires cross-run confirmation.
#
# Exception: signals observed in 3+ tasks within the same run get a note
# that they have strong within-run evidence, but confidence stays at low
# per the strict rule "Never auto-promote to high in the same run."
# A signal seen in 2+ tasks within the same run also stays low — it needs
# another run to reach medium.

for c in passed:
    c["confidence"] = "low"  # Strict: cold start = low, always
    occurrences = c.get("occurrences", 1)
    if occurrences >= 3:
        c["withinRunStrength"] = "strong (3+ tasks)"
    elif occurrences >= 2:
        c["withinRunStrength"] = "moderate (2 tasks)"
    else:
        c["withinRunStrength"] = "single observation"

# ═══════════════════════════════════════════════════════════════
# STEP 5: Assign IDs and categorize
# ═══════════════════════════════════════════════════════════════

pat_counter = 0
anti_counter = 0
dom_counter = 0
style_counter = 0

entries = []

for c in passed:
    ctype = c["type"]
    
    if ctype == "candidate-pattern":
        pat_counter += 1
        entry_id = f"PAT-{pat_counter:03d}"
        category = "patterns"
    elif ctype == "candidate-anti-pattern":
        anti_counter += 1
        entry_id = f"ANTI-{anti_counter:03d}"
        category = "anti-patterns"
    elif ctype in ("candidate-domain-insight", "domain-insight"):
        dom_counter += 1
        entry_id = f"DOM-{dom_counter:03d}"
        category = "domain-insights"
    elif ctype == "style-evolution":
        style_counter += 1
        entry_id = f"STYLE-{style_counter:03d}"
        category = "style-evolutions"
    elif ctype == "observation":
        # Observations that passed quality gate → domain insights
        dom_counter += 1
        entry_id = f"DOM-{dom_counter:03d}"
        category = "domain-insights"
    else:
        dom_counter += 1
        entry_id = f"DOM-{dom_counter:03d}"
        category = "domain-insights"
    
    c["entryId"] = entry_id
    c["category"] = category
    entries.append(c)

print(f"\nEntry assignment: {pat_counter} patterns, {anti_counter} anti-patterns, {dom_counter} domain insights, {style_counter} style evolutions")

# ═══════════════════════════════════════════════════════════════
# STEP 6: Write entry files
# ═══════════════════════════════════════════════════════════════

def determine_domains(entry):
    """Infer domain tags from entry content."""
    text = (entry.get("title", "") + " " + entry.get("evidence", "") + " " + entry.get("category", "")).lower()
    domains = []
    if any(w in text for w in ["api", "reference", "method", "interface", "class"]):
        domains.append("api-reference")
    if any(w in text for w in ["howto", "how-to", "how to", "guide", "procedure"]):
        domains.append("how-to")
    if any(w in text for w in ["business-user", "admin", "ui ", "admin ui"]):
        domains.append("admin-ui")
    if any(w in text for w in ["create", "new page"]):
        domains.append("page-creation")
    if any(w in text for w in ["pipeline", "convergence", "pass", "gap"]):
        domains.append("pipeline-process")
    if any(w in text for w in ["style", "formatting", "dash", "callout", "arrow"]):
        domains.append("style-formatting")
    if any(w in text for w in ["xperience", "xbk", "kentico", "member", "content"]):
        domains.append("xperience-platform")
    if any(w in text for w in ["cross-ref", "verification", "link"]):
        domains.append("cross-references")
    if any(w in text for w in ["impact", "mapping", "coverage"]):
        domains.append("impact-analysis")
    if any(w in text for w in ["invariant", "rejection"]):
        domains.append("invariant-system")
    if any(w in text for w in ["event", "handler"]):
        domains.append("event-system")
    if any(w in text for w in ["auth", "identity", "sign in", "membership"]):
        domains.append("authentication")
    if any(w in text for w in ["security", "access", "secured"]):
        domains.append("content-security")
    if any(w in text for w in ["risk", "accuracy"]):
        domains.append("risk-analysis")
    return domains if domains else ["general"]

def determine_source_tasks(entry):
    """Extract task references from evidence."""
    import re
    tasks = re.findall(r'TASK-\d+', entry.get("evidence", "") + " " + entry.get("title", ""))
    return list(set(tasks))

def determine_invariants(entry):
    """Extract invariant references."""
    import re
    text = entry.get("evidence", "") + " " + entry.get("title", "") + " " + entry.get("involvedInvariant", "")
    invs = re.findall(r'INV-[a-zA-Z]+-\d+', text)
    return list(set(invs))

def write_entry_md(entry):
    """Write a markdown entry file."""
    eid = entry["entryId"]
    cat = entry["category"]
    
    domains = determine_domains(entry)
    source_tasks = determine_source_tasks(entry)
    invariants = determine_invariants(entry)
    
    # Build title
    title = entry.get("title", "Untitled")
    if len(title) > 80:
        title = title[:77] + "..."
    
    # Determine type label
    type_label = {
        "patterns": "pattern",
        "anti-patterns": "anti-pattern",
        "domain-insights": "domain-insight",
        "style-evolutions": "style-evolution",
    }.get(cat, "insight")
    
    # Build markdown
    md = f"""---
id: {eid}
title: "{title}"
type: {type_label}
confidence: {entry['confidence']}
domains: {json.dumps(domains)}
discoveredDate: "{NOW_SHORT}"
lastReferencedDate: "{NOW_SHORT}"
usageCount: 1
sourceTasks: {json.dumps(source_tasks)}
invariantsReferenced: {json.dumps(invariants)}
sourceSignals: ["{entry['sourceId']}"]
deprecated: false
---

## Insight

{entry.get('evidence', entry.get('title', ''))}

## Evidence

- Source signal: {entry['sourceId']} (from {entry['source']})
- Within-run strength: {entry.get('withinRunStrength', 'single observation')}
- Tasks referenced: {', '.join(source_tasks) if source_tasks else 'N/A'}
- Confidence: {entry['confidence']} (cold-start run — first observation)

## Recommendation

{entry.get('recommendation', 'See insight above for actionable guidance.')}

## Applicability

Applicable to future pipeline runs involving {', '.join(domains[:3])} documentation domains. Confidence will promote to medium when confirmed in a second pipeline run.
"""
    
    filepath = f"{BASE}/meta/{cat}/{eid}.md"
    with open(filepath, 'w') as f:
        f.write(md)
    
    return {
        "id": eid,
        "type": type_label,
        "title": title,
        "confidence": entry["confidence"],
        "domains": domains,
        "category": cat,
        "filepath": f"meta/{cat}/{eid}.md",
        "discoveredDate": NOW_SHORT,
        "lastReferencedDate": NOW_SHORT,
        "sourceSignals": [entry["sourceId"]],
        "deprecated": False,
    }

index_entries = []
for entry in entries:
    idx_entry = write_entry_md(entry)
    index_entries.append(idx_entry)
    print(f"  Wrote: {idx_entry['filepath']} — {idx_entry['title'][:50]}")

# ═══════════════════════════════════════════════════════════════
# STEP 7: Update index.json
# ═══════════════════════════════════════════════════════════════

new_index = {
    "version": 1,
    "lastSynthesized": NOW_SHORT,
    "totalEntries": len(index_entries),
    "entriesByType": {
        "patterns": pat_counter,
        "anti-patterns": anti_counter,
        "domain-insights": dom_counter,
        "style-evolutions": style_counter,
    },
    "entries": index_entries,
}

with open(f"{BASE}/meta/index.json", 'w') as f:
    json.dump(new_index, f, indent=2)

print(f"\nUpdated index.json: {len(index_entries)} entries")

# ═══════════════════════════════════════════════════════════════
# STEP 8: Write task retrospective
# ═══════════════════════════════════════════════════════════════

retro = {
    "issueKey": "member-roles-content-access-security",
    "completedAt": NOW_SHORT,
    "runContext": {
        "coldStart": True,
        "featureScope": "member-roles-content-access-security",
        "pipelineVersion": 2,
    },
    "totalTasks": task_signals["runStats"]["totalTasks"],
    "firstAttemptRate": round(task_signals["runStats"]["firstAttemptAcceptance"] / task_signals["runStats"]["totalTasks"], 2),
    "twoCycleRate": round(task_signals["runStats"]["twoCycleAcceptance"] / task_signals["runStats"]["totalTasks"], 2),
    "multiCycleRate": round(task_signals["runStats"]["multiCycleAcceptance"] / task_signals["runStats"]["totalTasks"], 2),
    "totalReviewCycles": task_signals["runStats"]["totalReviewCycles"],
    "averageAttemptsPerTask": task_signals["runStats"]["averageAttemptsPerTask"],
    "createTasksAvgAttempts": task_signals["runStats"]["createTasksAvgAttempts"],
    "updateTasksAvgAttempts": task_signals["runStats"]["updateTasksAvgAttempts"],
    "patternsDiscovered": pat_counter,
    "antiPatternsDiscovered": anti_counter,
    "domainInsightsDiscovered": dom_counter,
    "styleEvolutionsDiscovered": style_counter,
    "entriesCreated": len(index_entries),
    "entriesUpdated": 0,
    "entriesDiscarded": len(discarded),
    "discardedDetails": discarded,
    "researchRecommendationsUsed": ctx_signals["researchEffectiveness"]["recommendationsUsed"],
    "researchRecommendationsUnused": ctx_signals["researchEffectiveness"]["recommendationsUnused"],
    "researchUsageRate": ctx_signals["researchEffectiveness"]["usageRate"],
    "impactMappingCoverage": ctx_signals["impactMappingAccuracy"]["coverageRate"],
    "gapHuntingCycles": 1,
    "gapHuntingConverged": True,
    "invariantRejectionRate": ctx_signals["invariantEffectiveness"]["rejectionRate"],
    "topRejectionInvariants": [inv["invariant"] for inv in ctx_signals["invariantEffectiveness"]["topRejectionCauses"][:5]],
    "complexityCorrelation": task_signals["complexityCorrelation"],
    "overlapGroups": overlap_groups,
    "projectedBenefitsForNextRun": ctx_signals["metaKnowledgeEffectiveness"]["projectedBenefits"],
}

retro_filename = f"member-roles-content-access-security-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}.json"
with open(f"{BASE}/meta/task-retros/{retro_filename}", 'w') as f:
    json.dump(retro, f, indent=2)

print(f"\nWrote retrospective: meta/task-retros/{retro_filename}")

# ═══════════════════════════════════════════════════════════════
# STEP 9: Update research-sources.json
# ═══════════════════════════════════════════════════════════════

research_eff = ctx_signals["researchEffectiveness"]

# Map source evaluations back to our research-sources entries
source_updates = {}
for src_key, src_data in research_eff["sources"].items():
    source_updates[src_key] = src_data

# Update existing sources
for source in research_sources["sources"]:
    sid = source["id"]
    if sid in source_updates:
        sdata = source_updates[sid]
        source["usageCount"] = sdata["recommendationsUsed"]
        source["lastUsed"] = NOW_SHORT
        source["effectiveness"] = sdata["effectivenessRatio"]
    # SRC-001 maps to both SRC-001 and SRC-001b in evaluations
    if sid == "SRC-001":
        # Merge SRC-001 + SRC-001b data
        main = source_updates.get("SRC-001", {})
        code = source_updates.get("SRC-001b", {})
        total_rec = main.get("recommendationsOriginated", 0) + code.get("recommendationsOriginated", 0)
        total_used = main.get("recommendationsUsed", 0) + code.get("recommendationsUsed", 0)
        source["usageCount"] = total_used
        source["lastUsed"] = NOW_SHORT
        source["effectiveness"] = round(total_used / total_rec, 2) if total_rec > 0 else None
        source["assessmentDetail"] = main.get("assessment", "") + " " + code.get("assessment", "")
    elif sid == "SRC-002":
        # Merge SRC-002a + SRC-002b + SRC-002c
        tut = source_updates.get("SRC-002a", {})
        howto = source_updates.get("SRC-002b", {})
        ref = source_updates.get("SRC-002c", {})
        total_rec = tut.get("recommendationsOriginated", 0) + howto.get("recommendationsOriginated", 0) + ref.get("recommendationsOriginated", 0)
        total_used = tut.get("recommendationsUsed", 0) + howto.get("recommendationsUsed", 0) + ref.get("recommendationsUsed", 0)
        source["usageCount"] = total_used
        source["lastUsed"] = NOW_SHORT
        source["effectiveness"] = round(total_used / total_rec, 2) if total_rec > 0 else None
        source["assessmentDetail"] = f"Tutorials: {tut.get('assessment', 'N/A')}; How-to: {howto.get('assessment', 'N/A')}; Reference: {ref.get('assessment', 'N/A')}"
        source["subSourceBreakdown"] = {
            "tutorials": {"effectiveness": tut.get("effectivenessRatio"), "used": tut.get("recommendationsUsed", 0), "total": tut.get("recommendationsOriginated", 0)},
            "howTo": {"effectiveness": howto.get("effectivenessRatio"), "used": howto.get("recommendationsUsed", 0), "total": howto.get("recommendationsOriginated", 0)},
            "reference": {"effectiveness": ref.get("effectivenessRatio"), "used": ref.get("recommendationsUsed", 0), "total": ref.get("recommendationsOriginated", 0)},
        }
    elif sid == "SRC-003":
        # Merge SRC-003a + SRC-003b + SRC-003c
        step = source_updates.get("SRC-003a", {})
        refms = source_updates.get("SRC-003b", {})
        code = source_updates.get("SRC-003c", {})
        total_rec = step.get("recommendationsOriginated", 0) + refms.get("recommendationsOriginated", 0) + code.get("recommendationsOriginated", 0)
        total_used = step.get("recommendationsUsed", 0) + refms.get("recommendationsUsed", 0) + code.get("recommendationsUsed", 0)
        source["usageCount"] = total_used
        source["lastUsed"] = NOW_SHORT
        source["effectiveness"] = round(total_used / total_rec, 2) if total_rec > 0 else None
        source["assessmentDetail"] = f"Step-by-step: {step.get('assessment', 'N/A')}; Reference: {refms.get('assessment', 'N/A')}; Code: {code.get('assessment', 'N/A')}"
        source["subSourceBreakdown"] = {
            "stepByStep": {"effectiveness": step.get("effectivenessRatio"), "used": step.get("recommendationsUsed", 0), "total": step.get("recommendationsOriginated", 0)},
            "reference": {"effectiveness": refms.get("effectivenessRatio"), "used": refms.get("recommendationsUsed", 0), "total": refms.get("recommendationsOriginated", 0)},
            "codeExamples": {"effectiveness": code.get("effectivenessRatio"), "used": code.get("recommendationsUsed", 0), "total": code.get("recommendationsOriginated", 0)},
        }

# Add new source candidates
for nsc in research_eff.get("newSourceCandidates", []):
    new_source = {
        "id": f"SRC-{len(research_sources['sources'])+1:03d}",
        "name": nsc["description"],
        "url": None,
        "domains": [nsc["domain"]],
        "addedBy": "knowledge-integrator",
        "addedDate": NOW_SHORT,
        "usageCount": 0,
        "lastUsed": None,
        "effectiveness": None,
        "deprecated": False,
        "status": "pending-review",
        "rationale": nsc["rationale"],
    }
    research_sources["sources"].append(new_source)

research_sources["lastUpdated"] = NOW_SHORT
research_sources["lastRunUsageRate"] = research_eff["usageRate"]

with open(f"{BASE}/meta/research-sources.json", 'w') as f:
    json.dump(research_sources, f, indent=2)

print(f"\nUpdated research-sources.json: {len(research_sources['sources'])} sources ({len(research_eff.get('newSourceCandidates', []))} new candidates)")

# ═══════════════════════════════════════════════════════════════
# STEP 10: Write agent status
# ═══════════════════════════════════════════════════════════════

status = {
    "agent": "docwriter-knowledge-integrator",
    "status": "done",
    "result": "knowledge-integrated",
    "timestamp": NOW_SHORT,
    "newEntries": len(index_entries),
    "updatedEntries": 0,
    "discarded": len(discarded),
    "discardedDetails": discarded,
    "retrospectiveWritten": True,
    "retrospectiveFile": f"meta/task-retros/{retro_filename}",
    "sourcesUpdated": len([s for s in research_sources["sources"] if s.get("lastUsed")]),
    "newSourceCandidates": len(research_eff.get("newSourceCandidates", [])),
    "entrySummary": {
        "patterns": pat_counter,
        "antiPatterns": anti_counter,
        "domainInsights": dom_counter,
        "styleEvolutions": style_counter,
    },
    "confidenceDistribution": {
        "low": len(index_entries),
        "medium": 0,
        "high": 0,
    },
    "coldStart": True,
    "notes": "Cold-start run: all entries assigned confidence=low per strict confidence ladder. Signals with 2-3 within-run observations have strong evidence but cannot promote above low until confirmed in a second run.",
}

with open(f"{BASE}/agents/knowledge-integrator-status.json", 'w') as f:
    json.dump(status, f, indent=2)

print(f"\nWrote agent status: agents/knowledge-integrator-status.json")

# ═══════════════════════════════════════════════════════════════
# STEP 11: Update manifest.json
# ═══════════════════════════════════════════════════════════════

manifest_entry = {
    "agent": "docwriter-knowledge-integrator",
    "action": "integrated knowledge from synthesis signals",
    "timestamp": NOW_SHORT,
    "details": f"Cold-start integration: {len(index_entries)} entries created ({pat_counter} patterns, {anti_counter} anti-patterns, {dom_counter} domain insights, {style_counter} style evolutions). {len(discarded)} signals discarded. Retrospective written. Research sources updated (4 existing + 1 new candidate).",
}

try:
    with open(f"{BASE}/manifest.json") as f:
        content = f.read().strip()
        # manifest is JSONL (one JSON object per line)
        lines = content.split('\n')
except:
    lines = []

# Prepend new entry
new_lines = [json.dumps(manifest_entry)] + lines

with open(f"{BASE}/manifest.json", 'w') as f:
    f.write('\n'.join(new_lines))

print(f"\nPrepended to manifest.json")

# ═══════════════════════════════════════════════════════════════
# STEP 12: Update progress.json
# ═══════════════════════════════════════════════════════════════

with open(f"{BASE}/progress.json") as f:
    progress = json.load(f)

progress["passStatus"]["pass65_knowledgeSynthesis"] = "done"
progress["counts"]["knowledgeEntriesNew"] = len(index_entries)
progress["passDetails"]["pass65_knowledgeSynthesis"] = {
    "completedAt": NOW_SHORT,
    "entriesCreated": len(index_entries),
    "entriesDiscarded": len(discarded),
    "patterns": pat_counter,
    "antiPatterns": anti_counter,
    "domainInsights": dom_counter,
    "styleEvolutions": style_counter,
    "retrospectiveWritten": True,
    "researchSourcesUpdated": True,
}

with open(f"{BASE}/progress.json", 'w') as f:
    json.dump(progress, f, indent=2)

print(f"\nUpdated progress.json: pass65_knowledgeSynthesis = done")

print("\n" + "="*60)
print("KNOWLEDGE INTEGRATION COMPLETE")
print(f"  Entries created: {len(index_entries)}")
print(f"  Entries discarded: {len(discarded)}")
print(f"  Confidence: all low (cold start)")
print("="*60)
