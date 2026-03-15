#!/usr/bin/env python3
"""
Audit script 2: Detect false nesting from parallel dispatches.
When multiple subagent_started events fire within a short window (<5s)
without intervening completions, the stack-based parser creates false
parent-child chains. This script detects those cases.

Also checks: context window + assistant_usage coverage per agent.
"""
import re
import sys
from datetime import datetime
from collections import defaultdict

LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else (
    '/home/jakubs/repositories/ralph-orchestrator/.fractals/docwriter/run_history/'
    'DOC-3137/process-1773516642369-288915.log'
)

TS_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)')
AGENT_RE = re.compile(r'Agent "([^"]+)" getOrCreateAgent: final model="([^"]+)"')
COMPACTION_RE = re.compile(
    r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s.*CompactionProcessor:\s*Utilization\s+([\d.]+)%\s+\((\d+)/(\d+)\s+tokens\)'
)
USAGE_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s.*kind:\s*assistant_usage')

def parse_ts(ts_str):
    return datetime.fromisoformat(ts_str.replace('Z', '+00:00')).timestamp() * 1000

events = []  # (line_num, event_type, ts_str, ts_ms)
compaction_events = []  # (ts_ms, line_num, used_tokens, max_tokens, utilization)
usage_events = []  # (ts_ms, line_num)

print(f"[1/3] Scanning log for all events...")
with open(LOG_PATH, 'r', errors='replace') as f:
    for line_num, line in enumerate(f, 1):
        if 'kind: subagent_started' in line:
            ts_m = TS_RE.match(line)
            if ts_m:
                ts_ms = parse_ts(ts_m.group(1))
                events.append((line_num, 'START', ts_m.group(1), ts_ms))
        elif 'kind: subagent_completed' in line:
            ts_m = TS_RE.match(line)
            if ts_m:
                ts_ms = parse_ts(ts_m.group(1))
                events.append((line_num, 'END', ts_m.group(1), ts_ms))

        cm = COMPACTION_RE.match(line)
        if cm:
            ts_ms = parse_ts(cm.group(1))
            compaction_events.append((ts_ms, line_num, int(cm.group(3)), int(cm.group(4)), float(cm.group(2))))

        um = USAGE_RE.match(line)
        if um:
            ts_ms = parse_ts(um.group(1))
            usage_events.append((ts_ms, line_num))

print(f"  Subagent events: {len(events)}")
print(f"  CompactionProcessor lines: {len(compaction_events)}")
print(f"  assistant_usage blocks: {len(usage_events)}")

# Extract agent names for START events
print(f"\n[2/3] Detecting parallel dispatches (rapid-fire starts without intervening completions)...")
with open(LOG_PATH, 'r', errors='replace') as f:
    all_lines = f.readlines()

def get_agent_name(start_line_num):
    for i in range(start_line_num, min(start_line_num + 20, len(all_lines))):
        m = AGENT_RE.search(all_lines[i])
        if m:
            return m.group(1), m.group(2)
    return '?', '?'

# Detect rapid-fire starts: consecutive START events within 5 seconds
PARALLEL_THRESHOLD_MS = 5000
rapid_fire_groups = []
current_group = []

for i, (line_num, etype, ts_str, ts_ms) in enumerate(events):
    if etype == 'START':
        if not current_group:
            current_group = [(line_num, ts_str, ts_ms)]
        else:
            last_ts = current_group[-1][2]
            if ts_ms - last_ts < PARALLEL_THRESHOLD_MS:
                current_group.append((line_num, ts_str, ts_ms))
            else:
                if len(current_group) > 1:
                    rapid_fire_groups.append(current_group)
                current_group = [(line_num, ts_str, ts_ms)]
    elif etype == 'END':
        # A completion interrupts the group
        if len(current_group) > 1:
            rapid_fire_groups.append(current_group)
        current_group = []

if len(current_group) > 1:
    rapid_fire_groups.append(current_group)

print(f"\n  RAPID-FIRE START GROUPS (consecutive starts <{PARALLEL_THRESHOLD_MS}ms apart, no intervening completions):")
print(f"  Total groups: {len(rapid_fire_groups)}")
false_nest_count = 0
for group in rapid_fire_groups:
    names = []
    for (line_num, ts_str, ts_ms) in group:
        name, model = get_agent_name(line_num)
        short = name.split('.')[-1] if '.' in name else name
        names.append(f"{short}({model})")
    gap_ms = group[-1][2] - group[0][2]
    false_nest_count += len(group) - 1
    print(f"    Lines {group[0][0]}-{group[-1][0]} | gap={gap_ms:.0f}ms | agents: {' → '.join(names)}")
    print(f"      Parser treats as: {names[0]} parent of {names[1]}" + 
          (f" parent of {names[2]}" if len(names) > 2 else "") +
          " (FALSE NESTING)")

print(f"\n  FALSE PARENT-CHILD RELATIONSHIPS: {false_nest_count}")

# Check: Build ground truth tree and see which time ranges have token data
print(f"\n[3/3] Token data coverage analysis...")

# Build span tree for attribution check
stack = []
completed_spans = []
for (line_num, etype, ts_str, ts_ms) in events:
    if etype == 'START':
        name, model = get_agent_name(line_num)
        short = name.split('.')[-1] if '.' in name else name
        stack.append({'name': short, 'full': name, 'model': model, 'start_ms': ts_ms, 'start_line': line_num, 'depth': len(stack) + 1})
    elif etype == 'END':
        if stack:
            span = stack.pop()
            span['end_ms'] = ts_ms
            span['end_line'] = line_num
            completed_spans.append(span)

# Unclosed spans
for s in stack:
    s['end_ms'] = events[-1][3] if events else 0  # end at last event
    completed_spans.append(s)

completed_spans.sort(key=lambda x: x['start_ms'])

# For each agent, count how many compaction and usage entries fall within its time window
agent_token_data = defaultdict(lambda: {'compaction': 0, 'usage': 0, 'depth': 0, 'spans': 0, 'total_duration_ms': 0})

for span in completed_spans:
    key = span['name']
    agent_token_data[key]['spans'] += 1
    agent_token_data[key]['depth'] = span['depth']
    duration = span.get('end_ms', 0) - span['start_ms']
    agent_token_data[key]['total_duration_ms'] += duration

    for (ts_ms, line_num, used, max_t, util) in compaction_events:
        if ts_ms >= span['start_ms'] and ts_ms <= span.get('end_ms', float('inf')):
            agent_token_data[key]['compaction'] += 1

    for (ts_ms, line_num) in usage_events:
        if ts_ms >= span['start_ms'] and ts_ms <= span.get('end_ms', float('inf')):
            agent_token_data[key]['usage'] += 1

print(f"\n  AGENT TOKEN DATA COVERAGE (compaction events within agent time windows):")
print(f"  {'Agent':<40} {'Spans':>5} {'Compaction':>12} {'Usage':>12} {'Duration':>12}")
print(f"  {'-'*40} {'-'*5} {'-'*12} {'-'*12} {'-'*12}")
for name, data in sorted(agent_token_data.items(), key=lambda x: -x[1]['compaction']):
    dur_min = data['total_duration_ms'] / 60000
    print(f"  {name:<40} {data['spans']:>5} {data['compaction']:>12} {data['usage']:>12} {dur_min:>10.1f}m")

# Check for unattributed entries (not in any span)
first_start = min(s['start_ms'] for s in completed_spans) if completed_spans else 0
last_end = max(s.get('end_ms', 0) for s in completed_spans) if completed_spans else 0

unattributed_compaction = sum(1 for (ts_ms, *_) in compaction_events if ts_ms < first_start or ts_ms > last_end)
unattributed_usage = sum(1 for (ts_ms, *_) in usage_events if ts_ms < first_start or ts_ms > last_end)
print(f"\n  Unattributed (outside all spans): {unattributed_compaction} compaction, {unattributed_usage} usage")

# KEY DIAGNOSTIC: Which agents are at the deepest level when using the parser's "deepest match" logic?
# The attributeEntriesToTree uses depth — so deeper nodes win.
print(f"\n  DEEPEST-MATCH ATTRIBUTION (simulating parser's attributeEntriesToTree):")
deepest_attribution = defaultdict(lambda: {'compaction': 0, 'usage': 0})

def find_deepest_span(ts_ms, spans):
    """Find the deepest span containing this timestamp."""
    best = None
    best_depth = -1
    for span in spans:
        end = span.get('end_ms', float('inf'))
        if ts_ms >= span['start_ms'] and ts_ms <= end:
            if span['depth'] > best_depth:
                best = span
                best_depth = span['depth']
    return best

for (ts_ms, *_) in compaction_events:
    owner = find_deepest_span(ts_ms, completed_spans)
    if owner:
        deepest_attribution[owner['name']]['compaction'] += 1
    else:
        deepest_attribution['<unattributed>']['compaction'] += 1

for (ts_ms, *_) in usage_events:
    owner = find_deepest_span(ts_ms, completed_spans)
    if owner:
        deepest_attribution[owner['name']]['usage'] += 1
    else:
        deepest_attribution['<unattributed>']['usage'] += 1

print(f"  {'Agent':<40} {'Compaction':>12} {'Usage':>12}")
print(f"  {'-'*40} {'-'*12} {'-'*12}")
for name, data in sorted(deepest_attribution.items(), key=lambda x: -x[1]['compaction']):
    if data['compaction'] > 0 or data['usage'] > 0:
        print(f"  {name:<40} {data['compaction']:>12} {data['usage']:>12}")
