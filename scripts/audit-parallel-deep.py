#!/usr/bin/env python3
"""
Audit script 3: Deep dive into rapid-fire start groups.
Distinguishes genuine recursive nesting (same agent chain) from 
false nesting (parallel dispatch of different agents).
Also checks: are the start events on literally adjacent lines, or 
are there intervening content lines?
"""
import re
import sys
from collections import defaultdict

LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else (
    '/home/jakubs/repositories/ralph-orchestrator/.fractals/docwriter/run_history/'
    'DOC-3137/process-1773516642369-288915.log'
)

TS_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)')
AGENT_RE = re.compile(r'Agent "([^"]+)" getOrCreateAgent: final model="([^"]+)"')
STARTED = re.compile(r'kind: subagent_started')
COMPLETED = re.compile(r'kind: subagent_completed')

def parse_ts(ts_str):
    from datetime import datetime
    return datetime.fromisoformat(ts_str.replace('Z', '+00:00')).timestamp() * 1000

print(f"[1/2] Loading log file...")
with open(LOG_PATH, 'r', errors='replace') as f:
    all_lines = f.readlines()

print(f"  {len(all_lines)} lines loaded")

events = []
for line_num, line in enumerate(all_lines, 1):
    if STARTED.search(line):
        ts_m = TS_RE.match(line)
        events.append((line_num, 'START', ts_m.group(1) if ts_m else '?'))
    elif COMPLETED.search(line):
        ts_m = TS_RE.match(line)
        events.append((line_num, 'END', ts_m.group(1) if ts_m else '?'))

def get_agent_name(start_line_num):
    for i in range(start_line_num, min(start_line_num + 20, len(all_lines))):
        m = AGENT_RE.search(all_lines[i])
        if m:
            return m.group(1).split('.')[-1], m.group(2)
    return '?', '?'

print(f"\n[2/2] Analyzing rapid-fire groups with context lines...")

# Find all groups of consecutive starts
THRESHOLD_MS = 5000
groups = []
current_group = []

for i, (line_num, etype, ts_str) in enumerate(events):
    if etype == 'START':
        ts_ms = parse_ts(ts_str)
        if not current_group:
            current_group = [(line_num, ts_str, ts_ms)]
        else:
            if ts_ms - current_group[-1][2] < THRESHOLD_MS:
                current_group.append((line_num, ts_str, ts_ms))
            else:
                if len(current_group) > 1:
                    groups.append(current_group)
                current_group = [(line_num, ts_str, ts_ms)]
    elif etype == 'END':
        if len(current_group) > 1:
            groups.append(current_group)
        current_group = []

if len(current_group) > 1:
    groups.append(current_group)

# Categorize each group
parallel_dispatch = []   # Different agent names → false nesting
recursive_dispatch = []  # Same agent name chain → genuine nesting
ambiguous = []

for group in groups:
    names = [get_agent_name(ln)[0] for ln, _, _ in group]
    unique_names = set(names)
    
    if len(unique_names) == 1:
        recursive_dispatch.append((group, names))
    else:
        parallel_dispatch.append((group, names))

print(f"\n{'='*80}")
print(f"PARALLEL DISPATCH GROUPS (different agents → FALSE nesting): {len(parallel_dispatch)}")
print(f"{'='*80}")
for group, names in parallel_dispatch:
    gap_ms = group[-1][2] - group[0][2]
    print(f"\n  Lines {group[0][0]}-{group[-1][0]} | gap={gap_ms:.0f}ms")
    for j, (ln, ts, _) in enumerate(group):
        name = names[j]
        # Check surrounding lines for context
        lines_between = group[j][0] - group[j-1][0] if j > 0 else 0
        print(f"    L{ln}: {name} ({ts}) {f'(+{lines_between} lines from prev)' if j > 0 else ''}")
    
    # Show the actual log lines around each start
    print(f"  Context around first start (L{group[0][0]}):")
    for k in range(max(0, group[0][0]-2), min(len(all_lines), group[0][0]+3)):
        content = all_lines[k].rstrip()[:120]
        marker = ">>>" if k+1 == group[0][0] else "   "
        print(f"    {marker} L{k+1}: {content}")

print(f"\n{'='*80}")
print(f"RECURSIVE DISPATCH GROUPS (same agent → genuine nesting): {len(recursive_dispatch)}")  
print(f"{'='*80}")
for group, names in recursive_dispatch:
    gap_ms = group[-1][2] - group[0][2]
    print(f"\n  Lines {group[0][0]}-{group[-1][0]} | gap={gap_ms:.0f}ms | agent={names[0]}")
    for j, (ln, ts, _) in enumerate(group):
        lines_between = group[j][0] - group[j-1][0] if j > 0 else 0
        print(f"    L{ln}: ({ts}) {f'(+{lines_between} lines from prev)' if j > 0 else ''}")
    # Show the lines BETWEEN the first two starts
    if len(group) >= 2:
        print(f"  Lines between first two starts (L{group[0][0]} → L{group[1][0]}):")
        for k in range(group[0][0], min(group[1][0]+1, group[0][0]+10)):
            content = all_lines[k].rstrip()[:130]
            marker = ">>>" if (k+1 == group[0][0] or k+1 == group[1][0]) else "   "
            print(f"    {marker} L{k}: {content}")

# Summary table
print(f"\n{'='*80}")
print("IMPACT SUMMARY")
print(f"{'='*80}")
print(f"  Total rapid-fire groups: {len(groups)}")
print(f"  Parallel dispatch (FALSE nesting): {len(parallel_dispatch)} groups, "
      f"{sum(len(g)-1 for g, _ in parallel_dispatch)} false relationships")
print(f"  Recursive dispatch (genuine nesting): {len(recursive_dispatch)} groups, "
      f"{sum(len(g)-1 for g, _ in recursive_dispatch)} nestings")

# Which parent agents are dispatching in parallel?  
print(f"\n  Parent agents of parallel dispatch groups:")
for group, names in parallel_dispatch:
    # The parent is whoever was on top of stack before this group
    # We can approximate by looking at the sequential event before this group's first start
    first_ln = group[0][0]
    # Find the most recent subagent that's still active at this point
    stack = []
    for ln, etype, ts in events:
        if ln >= first_ln:
            break
        if etype == 'START':
            name, _ = get_agent_name(ln)
            stack.append(name)
        elif etype == 'END' and stack:
            stack.pop()
    parent = stack[-1] if stack else 'root'
    print(f"    {parent} dispatched: {' + '.join(names)} (parallel)")
