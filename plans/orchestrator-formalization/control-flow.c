/*
 * Docwriter agent family — control flow formalization.
 *
 * Alternative to the EFSM state machine encoding. This C program encodes
 * the same routing logic using ordinary execution flow primitives:
 *   - functions     → agent dispatch (blocking call, returns result)
 *   - if/else       → guards / conditional routing
 *   - while         → retry loops, re-entry cycles
 *   - for           → foreach over task graph
 *   - switch        → parameterized target selection
 *   - struct        → agent result payloads
 *   - enum          → result codes, pass identifiers
 *
 * This is a formalization, not runnable code. It captures the routing
 * topology, termination bounds, and error propagation rules in a notation
 * that is universally readable by humans and LLMs.
 *
 * Conventions:
 *   - dispatch_<agent>() = invoke agent, block until done, return result
 *   - RESULT_OK, RESULT_ERROR, etc. = agent result codes
 *   - fork { ... } = pseudo-syntax for parallel dispatch (not real C)
 *   - Every dispatch can fail; error paths are always explicit
 */

#include <stdbool.h>

/* ── Result codes (universal) ─────────────────────────────────────── */

typedef enum {
    OK,
    ERR,
    APPROVED,
    APPROVED_WITH_NOTES,
    REJECTED,
    CONVERGED,
    GAPS_FOUND,
    BLOCKED
} Result;

/* ── Pass identifiers (for re-entry routing) ──────────────────────── */

typedef enum {
    PASS_NONE = 0,
    PASS_P2   = 2,
    PASS_P3   = 3,
    PASS_P4   = 4,
    PASS_P5_6 = 5
} PassId;

/* ── Agent result payloads ────────────────────────────────────────── */

typedef struct { Result status; }              SimpleResult;
typedef struct { Result status; PassId target; int cyclesCompleted; } VerificationResult;
typedef struct { Result status; }              ReviewResult;

/* ── Forward declarations (leaf agent dispatches) ─────────────────── */

SimpleResult       dispatch_knowledge_curator(void);
SimpleResult       dispatch_diff_analyzer(void);
SimpleResult       dispatch_corpus_scanner(void);
SimpleResult       dispatch_invariant_scanner(void);
SimpleResult       dispatch_code_analyzer(void);
SimpleResult       dispatch_research_scout(void);
SimpleResult       dispatch_impact_mapper(void);
SimpleResult       dispatch_task_planner(void);
SimpleResult       dispatch_risk_analyzer(void);
SimpleResult       dispatch_content_writer(int task_id);
ReviewResult       dispatch_style_reviewer(int task_id);
ReviewResult       dispatch_accuracy_reviewer(int task_id);
ReviewResult       dispatch_persona_reviewer(int task_id);
SimpleResult       dispatch_cross_ref_updater(void);
VerificationResult dispatch_gap_hunter(void);
SimpleResult       dispatch_task_signal_analyzer(void);
SimpleResult       dispatch_context_signal_analyzer(void);
SimpleResult       dispatch_knowledge_integrator(void);
SimpleResult       dispatch_skill_rebuilder(void);
SimpleResult       dispatch_frontmatter_validator(void);
SimpleResult       dispatch_changelog_writer(void);
SimpleResult       dispatch_pr_preparer(void);

/* ── Task graph (read from task-graph.json) ───────────────────────── */

typedef struct {
    int  id;
    bool dependencies_met;  /* true when all dependsOn tasks are written */
} Task;

extern Task  task_graph[];
extern int   task_graph_len;


/* ═══════════════════════════════════════════════════════════════════
 * DISCOVERY COORDINATOR (Pass 1)
 * Linear chain: diff-analyzer → corpus-scanner
 * ═══════════════════════════════════════════════════════════════════ */

Result discovery_coordinator(void)
{
    SimpleResult diff = dispatch_diff_analyzer();
    if (diff.status != OK)
        return ERR;

    SimpleResult corpus = dispatch_corpus_scanner();
    if (corpus.status != OK)
        return ERR;

    return OK;
}


/* ═══════════════════════════════════════════════════════════════════
 * ANALYSIS COORDINATOR (Pass 2 + Pass 3)
 * Two modes: pass2 (analysis) and pass3 (planning)
 * Pass 2 has a parallel fork for code-analyzer + research-scout
 * ═══════════════════════════════════════════════════════════════════ */

Result analysis_coordinator_pass2(void)
{
    /* Stage 1: invariant scanner */
    SimpleResult inv = dispatch_invariant_scanner();
    if (inv.status != OK)
        return ERR;

    /* Stage 2: parallel fork — code analysis + research scouting */
    SimpleResult code, research;
    fork {                           /* pseudo: dispatch in parallel */
        code     = dispatch_code_analyzer();
        research = dispatch_research_scout();   /* non-blocking */
    }

    if (code.status != OK)          /* code failure is fatal */
        return ERR;
    /* research failure is non-blocking — we continue either way */

    /* Stage 3: impact mapping */
    SimpleResult impact = dispatch_impact_mapper();
    if (impact.status != OK)
        return ERR;

    return OK;
}

Result analysis_coordinator_pass3(void)
{
    SimpleResult plan = dispatch_task_planner();
    if (plan.status != OK)
        return ERR;

    SimpleResult risk = dispatch_risk_analyzer();
    if (risk.status != OK)
        return ERR;

    return OK;
}

/* Mode selector — called by orchestrator */
Result analysis_coordinator(PassId mode)
{
    if (mode == PASS_P2)
        return analysis_coordinator_pass2();
    else /* mode == PASS_P3 */
        return analysis_coordinator_pass3();
}


/* ═══════════════════════════════════════════════════════════════════
 * EXECUTION COORDINATOR (Pass 4)
 * Foreach task in graph: write → style review → accuracy review →
 * persona review, with retry loop (max 3 attempts per task)
 * ═══════════════════════════════════════════════════════════════════ */

#define MAX_REVIEW_ATTEMPTS 3

Result execute_single_task(int task_id)
{
    int attempt = 1;

    while (attempt <= MAX_REVIEW_ATTEMPTS) {

        /* Write (or rewrite) the content */
        SimpleResult wr = dispatch_content_writer(task_id);
        if (wr.status != OK)
            return BLOCKED;

        /* Style review */
        ReviewResult style = dispatch_style_reviewer(task_id);
        if (style.status == REJECTED) {
            attempt++;
            continue;           /* retry from write */
        }

        /* Accuracy review */
        ReviewResult acc = dispatch_accuracy_reviewer(task_id);
        if (acc.status == REJECTED) {
            attempt++;
            continue;           /* retry from write */
        }

        /* Persona review */
        ReviewResult pers = dispatch_persona_reviewer(task_id);
        if (pers.status == REJECTED) {
            attempt++;
            continue;           /* retry from write */
        }

        return OK;              /* all three reviewers approved */
    }

    return BLOCKED;             /* exhausted attempts */
}

Result execution_coordinator(void)
{
    for (int i = 0; i < task_graph_len; i++) {
        if (!task_graph[i].dependencies_met)
            continue;           /* skip until deps satisfied */

        Result r = execute_single_task(task_graph[i].id);
        if (r == BLOCKED)
            return ERR;         /* any blocked task halts the pipeline */
    }

    return OK;
}


/* ═══════════════════════════════════════════════════════════════════
 * VERIFICATION COORDINATOR (Pass 5 + 6)
 * cross-ref → gap-hunter → converged / needs-reentry
 * ═══════════════════════════════════════════════════════════════════ */

VerificationResult verification_coordinator(void)
{
    SimpleResult xref = dispatch_cross_ref_updater();
    if (xref.status != OK)
        return (VerificationResult){ ERR, PASS_NONE, 0 };

    VerificationResult gap = dispatch_gap_hunter();
    return gap;     /* gap hunter returns convergence decision + target */
}


/* ═══════════════════════════════════════════════════════════════════
 * SYNTHESIS COORDINATOR (Pass 6.5)
 * All non-blocking except knowledge-integrator
 * signal analysis → integration → skill rebuild
 * ═══════════════════════════════════════════════════════════════════ */

Result synthesis_coordinator(void)
{
    /* Both signal analyzers are non-blocking — errors degrade but don't halt */
    dispatch_task_signal_analyzer();        /* result ignored */
    dispatch_context_signal_analyzer();     /* result ignored */

    SimpleResult integ = dispatch_knowledge_integrator();
    if (integ.status != OK)
        return ERR;             /* integrator failure is fatal */

    dispatch_skill_rebuilder();            /* non-blocking — result ignored */

    return OK;
}


/* ═══════════════════════════════════════════════════════════════════
 * DELIVERY COORDINATOR (Pass 7)
 * Gate check → frontmatter → changelog → PR
 * ═══════════════════════════════════════════════════════════════════ */

Result delivery_coordinator(bool converged)
{
    /* Gate: must be converged before delivery */
    if (!converged)
        return BLOCKED;

    /* Frontmatter validation — advisory, not blocking */
    dispatch_frontmatter_validator();      /* issues logged, never fatal */

    SimpleResult changelog = dispatch_changelog_writer();
    if (changelog.status != OK)
        return ERR;

    SimpleResult pr = dispatch_pr_preparer();
    if (pr.status != OK)
        return ERR;

    return OK;
}


/* ═══════════════════════════════════════════════════════════════════
 * ORCHESTRATOR (top-level — the 9-pass pipeline)
 * ═══════════════════════════════════════════════════════════════════ */

#define MAX_REENTRY_CYCLES 3

Result orchestrator(void)
{
    /* Pass 0: knowledge curation (non-blocking) */
    dispatch_knowledge_curator();          /* result ignored */

    /* Pass 1: discovery */
    if (discovery_coordinator() != OK)
        return ERR;

    /* Pass 2: analysis */
    if (analysis_coordinator(PASS_P2) != OK)
        return ERR;

    /* Pass 3: planning */
    if (analysis_coordinator(PASS_P3) != OK)
        return ERR;

    /* Pass 4: execution */
    if (execution_coordinator() != OK)
        return ERR;

    /* Passes 5-6 + re-entry loop */
    int cycle = 0;
    PassId reentry_target = PASS_NONE;

    reentry:
    {
        VerificationResult v = verification_coordinator();

        if (v.status == ERR)
            return ERR;

        if (v.status == CONVERGED || cycle >= MAX_REENTRY_CYCLES) {
            /* Converged (or forced convergence at cycle cap) */

            /* Pass 6.5: synthesis (non-blocking) */
            synthesis_coordinator();       /* error degrades, doesn't halt */

            /* Pass 7: delivery */
            return delivery_coordinator(/* converged = */ true);
        }

        /* Needs re-entry — loop back to the target pass */
        cycle++;
        reentry_target = v.target;

        switch (reentry_target) {
            case PASS_P2:
                if (analysis_coordinator(PASS_P2) != OK) return ERR;
                /* fall through to P3 */
            case PASS_P3:
                if (reentry_target <= PASS_P3)
                    if (analysis_coordinator(PASS_P3) != OK) return ERR;
                /* fall through to P4 */
            case PASS_P4:
                if (reentry_target <= PASS_P4)
                    if (execution_coordinator() != OK) return ERR;
                /* fall through to P5_6 */
            case PASS_P5_6:
                goto reentry;   /* re-verify */

            default:
                return ERR;     /* unreachable */
        }
    }
}
