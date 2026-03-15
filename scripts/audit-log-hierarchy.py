#!/usr/bin/env python3
"""
Audit script: Extract the REAL subagent hierarchy from a cli-debug log.
Tracks start/complete events with proper depth, agent names, timestamps.
Validates nesting integrity (unmatched starts/completions, depth errors).
"""
import re
import sys
import json
from collections import defaultdict

LOG_PATH = sys.argv[1] if len(sys.argv) > 1 else (
    '/home/jakubs/repositories/ralph-orchestrator/.fractals/docwriter/run_history/'
    'DOC-3137/process-1773516642369-288915.log'
)

TS_RE = re.compile(r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)')
AGENT_RE = re.compile(r'Agent "([^"]+)" getOrCreateAgent')
FINAL_MODEL_RE = re.compile(r'Agent "([^"]+)" getOrCreateAgent: final model="([^"]+)"')

events = []  # (line_num, event_type, timestamp_str)

print(f"[1/4] Scanning {LOG_PATH} for subagent events...")
with open(LOG_PATH, 'r', errors='replace') as f:
    for line_num, line in enumerate(f, 1):
        if 'kind: subagent_started' in line:
            ts_m = TS_RE.match(line)
            ts = ts_m.group(1) if ts_m else '?'
            events.append((line_num, 'START', ts))
        elif 'kind: subagent_completed' in line:
            ts_m = TS_RE.match(line)
            ts = ts_m.group(1) if ts_m else '?'
            events.append((line_num, 'END', ts))

print(f"  Found {sum(1 for e in events if e[1]=='START')} starts, "
      f"{sum(1 for e in events if e[1]=='END')} completions")

# Pass 2: For each START, look ahead (up to 20 lines) for agent name + model
print("[2/4] Extracting agent names from nearby lines...")
with open(LOG_PATH, 'r', errors='replace') as f:
    all_lines = f.readlines()

agent_names = {}  # line_num -> (agent_full_name, model)
for line_num, event_type, ts in events:
    if event_type != 'START':
        continue
    found_name = '?'
    found_model = '?'
    # Look ahead up to 20 lines
    for i in range(line_num, min(line_num + 20, len(all_lines))):
        fm = FINAL_MODEL_RE.search(all_lines[i])
        if fm:
            found_name = fm.group(1)
            found_model = fm.group(2)
            break
        am = AGENT_RE.search(all_lines[i])
        if am and found_name == '?':
            found_name = am.group(1)
    agent_names[line_num] = (found_name, found_model)

# Pass 3: Build nesting tree with depth tracking
print("[3/4] Building nesting tree (tracking depth via stack)...")
stack = []  # stack of (line_num, agent_name, depth, ts)
tree = []   # completed spans: (agent_name, depth, start_ts, end_ts, start_line, end_line)
unclosed = []
depth_errors = []
current_depth = 0

for line_num, event_type, ts in events:
    if event_type == 'START':
        current_depth += 1
        name, model = agent_names.get(line_num, ('?', '?'))
        stack.append((line_num, name, current_depth, ts, model))
    elif event_type == 'END':
        if not stack:
            depth_errors.append(f"  END at line {line_num} (ts={ts}) with empty stack!")
            continue
        start_line, name, depth, start_ts, model = stack.pop()
        tree.append({
            'name': name,
            'depth': depth,
            'start_ts': start_ts,
            'end_ts': ts,
            'start_line': start_line,
            'end_line': line_num,
            'model': model,
        })
        current_depth -= 1

for item in stack:
    unclosed.append(f"  UNCLOSED: {item[1]} depth={item[2]} started at line {item[0]} ts={item[3]}")

# Pass 4: Print results
print("[4/4] Results:\n")
print(f"{'='*80}")
print(f"TOTAL SUBAGENT INVOCATIONS: {len(tree) + len(stack)}")
print(f"  Completed spans: {len(tree)}")
print(f"  Unclosed spans:  {len(stack)}")
print(f"  Depth errors:    {len(depth_errors)}")
print(f"{'='*80}\n")

if depth_errors:
    print("DEPTH ERRORS:")
    for e in depth_errors:
        print(e)
    print()

if unclosed:
    print("UNCLOSED SPANS:")
    for u in unclosed:
        print(u)
    print()

# Print the hierarchy (first 80 spans)
print("FULL HIERARCHY (completed spans, chronological by start):")
tree.sort(key=lambda x: x['start_line'])

# Track unique agent names and their counts
agent_counts = defaultdict(int)
depth_distribution = defaultdict(int)
max_depth = 0

for span in tree:
    short = span['name'].split('.')[-1] if '.' in span['name'] else span['name']
    agent_counts[short] += 1
    depth_distribution[span['depth']] += 1
    if span['depth'] > max_depth:
        max_depth = span['depth']

# Print first 100 spans
for i, span in enumerate(tree[:100]):
    indent = '  ' * (span['depth'] - 1)
    short = span['name'].split('.')[-1] if '.' in span['name'] else span['name']
    print(f"  {indent}{short} [d={span['depth']}] "
          f"lines {span['start_line']}-{span['end_line']} "
          f"({span['start_ts']} → {span['end_ts']}) model={span['model']}")

if len(tree) > 100:
    print(f"  ... ({len(tree) - 100} more spans)")

print(f"\nAGENT BREAKDOWN:")
for name, count in sorted(agent_counts.items(), key=lambda x: -x[1]):
    print(f"  {name}: {count}")

print(f"\nDEPTH DISTRIBUTION:")
for depth in sorted(depth_distribution.keys()):
    print(f"  depth {depth}: {depth_distribution[depth]} spans")

print(f"\nMAX NESTING DEPTH: {max_depth}")

# Sanity check: Are there any depth-1 spans that look like they should be nested?
depth1_spans = [s for s in tree if s['depth'] == 1]
print(f"\nDEPTH-1 (top-level) SPANS: {len(depth1_spans)}")
for s in depth1_spans[:20]:
    short = s['name'].split('.')[-1] if '.' in s['name'] else s['name']
    print(f"  {short} lines {s['start_line']}-{s['end_line']} ({s['start_ts']} → {s['end_ts']})")
if len(depth1_spans) > 20:
    print(f"  ... ({len(depth1_spans) - 20} more)")

# Check: do any depth-1 spans CONTAIN other spans? (i.e. nesting exists)
print(f"\nNESTING CHECK — depth-1 spans that contain children:")
for d1 in depth1_spans:
    children = [s for s in tree if s['depth'] == 2 
                and s['start_line'] > d1['start_line'] 
                and s['end_line'] < d1['end_line']]
    if children:
        short = d1['name'].split('.')[-1] if '.' in d1['name'] else d1['name']
        child_names = [s['name'].split('.')[-1] for s in children]
        print(f"  {short} (lines {d1['start_line']}-{d1['end_line']}) contains {len(children)} children: {child_names[:10]}")
