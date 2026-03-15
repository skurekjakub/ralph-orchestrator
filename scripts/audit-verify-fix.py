#!/usr/bin/env python3
"""
Audit script 4: Verify the fix — simulate post-processing that flattens
parallel dispatches and compare before/after tree metrics.
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

def parse_ts(ts_str):
    from datetime import datetime
    return datetime.fromisoformat(ts_str.replace('Z', '+00:00')).timestamp() * 1000

print(f"[1/3] Loading events...")
events = []
with open(LOG_PATH, 'r', errors='replace') as f:
    all_lines = f.readlines()

for line_num, line in enumerate(all_lines, 1):
    if 'kind: subagent_started' in line:
        ts_m = TS_RE.match(line)
        events.append((line_num, 'START', ts_m.group(1) if ts_m else '?'))
    elif 'kind: subagent_completed' in line:
        ts_m = TS_RE.match(line)
        events.append((line_num, 'END', ts_m.group(1) if ts_m else '?'))

def get_agent_name(start_line_num):
    for i in range(start_line_num, min(start_line_num + 20, len(all_lines))):
        m = AGENT_RE.search(all_lines[i])
        if m:
            return m.group(1).split('.')[-1], m.group(2)
    return '?', '?'

print(f"[2/3] Building BEFORE tree (stack-based, no fix)...")
# Build stack-based tree
node_id = [0]
def new_id():
    node_id[0] += 1
    return f"node-{node_id[0]}"

class Node:
    def __init__(self, name, depth, parent, start_ms, node_id):
        self.id = node_id
        self.name = name
        self.depth = depth
        self.parent = parent
        self.children = []
        self.start_ms = start_ms
        self.end_ms = None

root = Node('root', 0, None, 0, 'root')
stack = [root]
all_nodes = [root]

for (line_num, etype, ts_str) in events:
    ts_ms = parse_ts(ts_str)
    if etype == 'START':
        name, model = get_agent_name(line_num)
        parent = stack[-1]
        node = Node(name, len(stack), parent, ts_ms, new_id())
        parent.children.append(node)
        all_nodes.append(node)
        stack.append(node)
    elif etype == 'END':
        if len(stack) > 1:
            node = stack.pop()
            node.end_ms = ts_ms

# Close unclosed
last_ts = parse_ts(events[-1][2]) if events else 0
while len(stack) > 1:
    node = stack.pop()
    if not node.end_ms:
        node.end_ms = last_ts
root.start_ms = parse_ts(events[0][2]) if events else 0
root.end_ms = last_ts

# Metrics BEFORE
def collect_metrics(root_node):
    depth_dist = defaultdict(int)
    max_depth = 0
    parent_child_count = 0
    nodes_by_name = defaultdict(int)
    
    def walk(n):
        nonlocal max_depth
        depth_dist[n.depth] += 1
        nodes_by_name[n.name] += 1
        if n.depth > max_depth:
            max_depth = n.depth
        for c in n.children:
            parent_child_count
            walk(c)
    walk(root_node)
    return depth_dist, max_depth, nodes_by_name

before_depth, before_max, before_names = collect_metrics(root)

print(f"  BEFORE: max_depth={before_max}")
print(f"  BEFORE depth distribution: {dict(sorted(before_depth.items()))}")

# Now apply the fix (simulate flattenParallelDispatches)
print(f"\n[3/3] Applying fix (flattenParallelDispatches with 100ms threshold)...")

THRESHOLD_MS = 100
node_map = {n.id: n for n in all_nodes}

# Sort candidates shallowest first
candidates = sorted(
    [n for n in all_nodes if n.parent and n.parent != root],
    key=lambda n: n.depth
)

reparented = 0
for node in candidates:
    parent = node.parent
    if not parent or parent == root:
        continue
    if abs(node.start_ms - parent.start_ms) < THRESHOLD_MS:
        grandparent = parent.parent
        if not grandparent:
            continue
        # Remove from old parent
        parent.children = [c for c in parent.children if c.id != node.id]
        # Re-parent
        node.parent = grandparent
        node.depth = parent.depth
        grandparent.children.append(node)
        # Fix descendant depths
        def fix_depths(n, parent_depth):
            for c in n.children:
                c.depth = parent_depth + 1
                fix_depths(c, c.depth)
        fix_depths(node, node.depth)
        reparented += 1

# Sort children by start time
for n in all_nodes:
    n.children.sort(key=lambda c: c.start_ms)

after_depth, after_max, after_names = collect_metrics(root)

print(f"  Reparented {reparented} nodes")
print(f"  AFTER: max_depth={after_max}")
print(f"  AFTER depth distribution: {dict(sorted(after_depth.items()))}")

# Show key structure changes
print(f"\n{'='*80}")
print("BEFORE vs AFTER COMPARISON")
print(f"{'='*80}")
print(f"  {'Metric':<30} {'Before':>10} {'After':>10}")
print(f"  {'-'*30} {'-'*10} {'-'*10}")
print(f"  {'Max depth':<30} {before_max:>10} {after_max:>10}")
for d in sorted(set(list(before_depth.keys()) + list(after_depth.keys()))):
    b = before_depth.get(d, 0)
    a = after_depth.get(d, 0)
    if b != a:
        print(f"  {'Nodes at depth ' + str(d):<30} {b:>10} {a:>10}")

# Print the fixed tree structure (first few levels)
print(f"\n{'='*80}")
print("FIXED TREE (first 3 depth levels):")
print(f"{'='*80}")
def print_tree(node, max_depth=4, indent=0):
    if node.depth > max_depth:
        return
    prefix = "  " * indent
    dur = (node.end_ms - node.start_ms) / 60000 if node.end_ms else 0
    child_count = len(node.children)
    suffix = f" ({child_count} children)" if child_count > 0 else ""
    print(f"  {prefix}{node.name} [d={node.depth}] {dur:.1f}m{suffix}")
    for c in node.children[:8]:
        print_tree(c, max_depth, indent + 1)
    if len(node.children) > 8:
        print(f"  {prefix}  ...({len(node.children) - 8} more)")

print_tree(root, max_depth=4)

# Verify: check for remaining suspicious nesting (same-start-time parent-child)
remaining_issues = []
for n in all_nodes:
    if n.parent and n.parent != root:
        if abs(n.start_ms - n.parent.start_ms) < THRESHOLD_MS:
            remaining_issues.append(f"  {n.name} [d={n.depth}] still within {THRESHOLD_MS}ms of parent {n.parent.name} [d={n.parent.depth}]")

if remaining_issues:
    print(f"\nWARNING: {len(remaining_issues)} remaining close-start-time parent-child pairs:")
    for issue in remaining_issues[:10]:
        print(issue)
else:
    print(f"\n✓ No remaining close-start-time parent-child relationships")
