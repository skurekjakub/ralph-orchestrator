#!/usr/bin/env python3
"""
Corpus Scanner — indexes every markdown page in the documentation workspace.
Produces .docwriter/doc-index.json with front matter, headings, cross-references, and topic clusters.
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

WORKSPACE_ROOT = Path("/workspace/src/_documentation")
DOC_COLLECTION_DIR = WORKSPACE_ROOT / "_documentation"
OUTPUT_DIR = Path("/workspace/.docwriter")
OUTPUT_FILE = OUTPUT_DIR / "doc-index.json"
STATUS_FILE = OUTPUT_DIR / "agents" / "corpus-scanner-status.json"
MANIFEST_FILE = OUTPUT_DIR / "manifest.json"

# ---------------------------------------------------------------------------
# Front-matter parser (simple YAML-like, no dependency needed)
# ---------------------------------------------------------------------------

def parse_front_matter(text):
    """Parse YAML front matter from markdown text. Returns (dict, body)."""
    fm = {}
    body = text
    stripped = text.lstrip()
    if not stripped.startswith("---"):
        return fm, body

    # Find the closing ---
    first_sep = stripped.index("---")
    rest = stripped[first_sep + 3:]
    second_sep = rest.find("\n---")
    if second_sep == -1:
        return fm, body

    fm_block = rest[:second_sep].strip()
    body = rest[second_sep + 4:]  # after closing ---

    # Two-pass parser:
    # Pass 1: identify all top-level keys and their raw values
    lines = fm_block.split("\n")
    keys_order = []
    key_values = {}
    current_key = None

    for line in lines:
        raw = line
        stripped_line = line.strip()
        if not stripped_line or stripped_line.startswith("#"):
            continue

        # Detect if this is a top-level key (not indented or lightly indented, has colon)
        # We treat lines with leading whitespace that start with "- " as list continuations
        leading_spaces = len(raw) - len(raw.lstrip())

        if stripped_line.startswith("- ") and current_key is not None:
            # List item continuation
            if current_key not in key_values:
                key_values[current_key] = []
            if not isinstance(key_values[current_key], list):
                key_values[current_key] = []
            item_val = stripped_line[2:].strip().strip("'\"")
            key_values[current_key].append(item_val)
            continue

        colon_idx = stripped_line.find(":")
        if colon_idx > 0:
            key = stripped_line[:colon_idx].strip()
            value = stripped_line[colon_idx + 1:].strip()

            # Check if this is a nested sub-key (indented significantly under parent)
            # We'll only capture top-level or shallow keys
            if leading_spaces > 8 and current_key:
                # Treat as nested, skip or attach as sub-property
                continue

            current_key = key
            if key not in key_values:
                keys_order.append(key)

            if value.startswith("[") and value.endswith("]"):
                # Inline list
                inner = value[1:-1]
                items = [v.strip().strip("'\"") for v in inner.split(",") if v.strip()]
                key_values[key] = items
            elif value == "" or value == "|" or value == ">":
                # Could be followed by list items or block scalar
                if key not in key_values or not isinstance(key_values.get(key), list):
                    key_values[key] = ""
            else:
                key_values[key] = value.strip("'\"")

    fm = key_values
    return fm, body


# ---------------------------------------------------------------------------
# Heading extractor
# ---------------------------------------------------------------------------

def extract_headings(body):
    """Extract h2 and h3 headings from markdown body."""
    headings = []
    for line in body.split("\n"):
        stripped = line.strip()
        if stripped.startswith("## ") and not stripped.startswith("### "):
            heading = stripped[3:].strip().rstrip("#").strip()
            heading = re.sub(r'[*_`]', '', heading)
            # Remove Liquid tags
            heading = re.sub(r'\{%.*?%\}', '', heading).strip()
            if heading:
                headings.append(heading)
        elif stripped.startswith("### "):
            heading = stripped[4:].strip().rstrip("#").strip()
            heading = re.sub(r'[*_`]', '', heading)
            heading = re.sub(r'\{%.*?%\}', '', heading).strip()
            if heading:
                headings.append(heading)
    return headings


# ---------------------------------------------------------------------------
# Cross-reference extractor
# ---------------------------------------------------------------------------

def extract_cross_refs(body):
    """Extract internal links, page_link references, include references."""
    outgoing_identifiers = set()
    include_refs = set()

    # {% page_link IDENTIFIER ... %}
    for m in re.finditer(r'\{%\s*page_link\s+(\S+)', body):
        ident = m.group(1).strip('"\'')
        if ident:
            outgoing_identifiers.add(ident)

    # {% include ... %} or {% render ... %}
    for m in re.finditer(r'\{%\s*(?:include|render)\s+([^\s%}]+)', body):
        ref = m.group(1).strip("'\"")
        if ref and not ref.startswith("{"):
            include_refs.add(ref)

    # Standard markdown links to internal paths
    for m in re.finditer(r'\[([^\]]*)\]\((/[^)]+)\)', body):
        link_target = m.group(2)
        if not link_target.startswith("http"):
            outgoing_identifiers.add(link_target)

    # {% link ... %} references
    for m in re.finditer(r'\{%\s*link\s+([^\s%}]+)', body):
        ref = m.group(1).strip("'\"")
        if ref:
            outgoing_identifiers.add(ref)

    return sorted(outgoing_identifiers), sorted(include_refs)


# ---------------------------------------------------------------------------
# Topic cluster inference
# ---------------------------------------------------------------------------

CLUSTER_MAP = {
    # developers-and-admins subtopics
    "development": "Development",
    "customization": "Customization",
    "configuration": "Configuration",
    "installation": "Installation",
    "deployment": "Deployment",
    "ci-cd": "CI/CD",
    "api": "API",
    "saas": "SaaS",
    "data-protection": "Data Protection",
    "digital-marketing-setup": "Digital Marketing Setup",
    "digital-commerce-setup": "Digital Commerce Setup",
    "security-guidelines": "Security Guidelines",
    "upgrade-to-xperience-by-kentico": "Upgrade & Migration",
    "integrate-with-decoupled-systems": "Integrations",
    "third-party-integrations": "Integrations",
    # business-users subtopics
    "content-hub": "Content Hub",
    "website-content": "Website Content",
    "digital-marketing": "Digital Marketing",
    "media-libraries": "Media Libraries",
    "content-versioning": "Content Versioning",
    "headless-content": "Headless Content",
    # top-level
    "changelog": "Changelog",
    "security-advisories": "Security Advisories",
}

def infer_topic_cluster(rel_path, fm):
    """Infer topic cluster from path and front matter."""
    parts = Path(rel_path).parts

    # Top-level files
    if len(parts) == 1:
        stem = parts[0].replace(".md", "")
        if stem in CLUSTER_MAP:
            return CLUSTER_MAP[stem]
        return stem.replace("-", " ").replace("_", " ").title()

    # changelog/
    if parts[0] == "changelog":
        return "Changelog"

    # security-advisories/
    if parts[0] == "security-advisories":
        return "Security Advisories"

    # developers-and-admins/TOPIC/... or business-users/TOPIC/...
    if len(parts) >= 2:
        area = parts[0]  # developers-and-admins or business-users
        if len(parts) >= 3:
            topic_dir = parts[1]
        else:
            # e.g., developers-and-admins.md is a top-level for its area
            topic_dir = parts[1].replace(".md", "")

        if topic_dir in CLUSTER_MAP:
            return CLUSTER_MAP[topic_dir]

        # Fallback: humanize the directory name
        return topic_dir.replace("-", " ").replace("_", " ").title()

    return "General"


def classify_page(fm, body, rel_path):
    """Classify page type."""
    layout = fm.get("layout", "")
    if isinstance(layout, str) and layout in ("error", "redirect"):
        return layout

    title = fm.get("title", "")
    if isinstance(title, str):
        title_lower = title.lower()
    else:
        title_lower = ""

    # Changelog release notes
    if "changelog" in rel_path:
        return "changelog"

    # Security advisories
    if "security-advisories" in rel_path or "security advisory" in title_lower:
        return "reference"

    # Reference pages
    if "reference" in title_lower or rel_path.endswith("reference.md"):
        return "reference"

    # Check for step-based how-to content
    if body:
        # Count numbered steps in first 3000 chars
        step_count = len(re.findall(r'^\d+\.', body[:3000], re.MULTILINE))
        if step_count >= 3:
            return "howto"

    return "concept"


# ---------------------------------------------------------------------------
# Main scanner
# ---------------------------------------------------------------------------

def scan_workspace():
    all_files = sorted(DOC_COLLECTION_DIR.rglob("*.md"))
    total = len(all_files)
    print(f"Found {total} markdown files to index.")

    pages = []
    identifier_to_path = {}
    path_to_outgoing_ids = {}

    for idx, filepath in enumerate(all_files):
        rel_path = str(filepath.relative_to(DOC_COLLECTION_DIR))

        if idx % 200 == 0:
            print(f"  Processing {idx}/{total}...")

        try:
            text = filepath.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"  WARN: Could not read {rel_path}: {e}")
            continue

        fm, body = parse_front_matter(text)

        title = fm.get("title", "")
        if isinstance(title, list):
            title = title[0] if title else ""
        if not title:
            title = filepath.stem.replace("-", " ").replace("_", " ").title()

        identifier = fm.get("identifier", "")
        if isinstance(identifier, list):
            identifier = identifier[0] if identifier else ""

        # Personas
        persona_raw = fm.get("persona", fm.get("personas", ""))
        if isinstance(persona_raw, list):
            personas = [p.strip() for p in persona_raw if p.strip()]
        elif isinstance(persona_raw, str) and persona_raw:
            personas = [p.strip() for p in persona_raw.split(",") if p.strip()]
        else:
            personas = []

        classification = classify_page(fm, body, rel_path)
        product_version = fm.get("product_version", "")
        if isinstance(product_version, list):
            product_version = product_version[0] if product_version else ""
        layout = fm.get("layout", "")
        if isinstance(layout, list):
            layout = layout[0] if layout else ""
        permalink = fm.get("permalink", "")
        if isinstance(permalink, list):
            permalink = permalink[0] if permalink else ""
        order = fm.get("order", "")
        searchable = fm.get("searchable", "")
        related_pages = fm.get("related_pages", [])

        headings = extract_headings(body)
        outgoing_ids, include_refs = extract_cross_refs(body)

        topic_cluster = infer_topic_cluster(rel_path, fm)

        # Store identifier mapping
        if identifier:
            identifier_to_path[str(identifier)] = rel_path

        path_to_outgoing_ids[rel_path] = outgoing_ids

        page_entry = {
            "path": rel_path,
            "title": str(title),
            "collection": "documentation",
            "classification": classification,
            "personas": personas,
            "identifier": str(identifier),
            "headings": headings,
            "outgoingRefs": outgoing_ids,
            "includeRefs": include_refs,
            "topicCluster": topic_cluster,
        }

        # Optional enrichment
        if str(product_version):
            page_entry["productVersion"] = str(product_version)
        if str(layout):
            page_entry["layout"] = str(layout)
        if str(permalink):
            page_entry["permalink"] = str(permalink)
        if order:
            page_entry["order"] = str(order)
        if str(searchable).lower() == "false":
            page_entry["searchable"] = False
        if related_pages:
            rp = related_pages if isinstance(related_pages, list) else [str(related_pages)]
            page_entry["relatedPages"] = rp

        pages.append(page_entry)

    print(f"Indexed {len(pages)} pages. Building cross-reference map...")

    # ---------------------------------------------------------------------------
    # Build incoming links (reverse index)
    # ---------------------------------------------------------------------------
    path_to_incoming = defaultdict(set)
    for src_path, out_ids in path_to_outgoing_ids.items():
        for oid in out_ids:
            target_path = identifier_to_path.get(oid)
            if target_path and target_path != src_path:
                path_to_incoming[target_path].add(src_path)

    for page in pages:
        incoming = sorted(path_to_incoming.get(page["path"], set()))
        page["incomingRefs"] = incoming

    # ---------------------------------------------------------------------------
    # Build topic clusters
    # ---------------------------------------------------------------------------
    cluster_pages = defaultdict(list)
    for page in pages:
        cluster_pages[page["topicCluster"]].append(page["path"])

    topic_clusters = []
    for name in sorted(cluster_pages.keys()):
        paths = sorted(cluster_pages[name])
        topic_clusters.append({
            "name": name,
            "pageCount": len(paths),
            "pagePaths": paths,
        })

    # ---------------------------------------------------------------------------
    # Cross-ref stats
    # ---------------------------------------------------------------------------
    total_outgoing = sum(len(p["outgoingRefs"]) for p in pages)
    total_incoming = sum(len(p["incomingRefs"]) for p in pages)

    # Orphaned pages: no incoming or outgoing refs, excluding changelog and meta pages
    orphaned = []
    for p in pages:
        if (not p["incomingRefs"] and not p["outgoingRefs"]
                and p["topicCluster"] != "Changelog"
                and p["path"] not in ("index.md", "404.md", "search.md")):
            orphaned.append(p["path"])

    # Most linked pages (by incoming count)
    most_linked = sorted(
        [p for p in pages if p["incomingRefs"]],
        key=lambda p: len(p["incomingRefs"]),
        reverse=True
    )[:30]
    most_linked_summary = [
        {"path": p["path"], "title": p["title"], "incomingCount": len(p["incomingRefs"])}
        for p in most_linked
    ]

    # ---------------------------------------------------------------------------
    # Assemble output
    # ---------------------------------------------------------------------------
    doc_index = {
        "version": 1,
        "generatedBy": "docwriter-corpus-scanner",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalPages": len(pages),
        "collections": {
            "documentation": len(pages),
        },
        "pages": pages,
        "topicClusters": topic_clusters,
        "crossRefStats": {
            "totalOutgoingRefs": total_outgoing,
            "totalIncomingRefs": total_incoming,
            "orphanedPages": len(orphaned),
            "orphanedPagePaths": sorted(orphaned),
            "mostLinkedPages": most_linked_summary,
        },
    }

    return doc_index


def write_output(doc_index):
    """Write doc-index.json, status, and manifest."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "agents").mkdir(parents=True, exist_ok=True)

    # Write doc-index.json
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(doc_index, f, indent=2, ensure_ascii=False)
    size = os.path.getsize(OUTPUT_FILE)
    print(f"Wrote {OUTPUT_FILE} ({size:,} bytes)")

    # Write status
    status = {
        "agent": "docwriter-corpus-scanner",
        "status": "done",
        "result": "doc-index-ready",
        "totalPages": doc_index["totalPages"],
        "collectionsScanned": len(doc_index["collections"]),
        "topicClusters": len(doc_index["topicClusters"]),
    }
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)
    print(f"Wrote {STATUS_FILE}")

    # Prepend to manifest
    manifest_entry = {
        "agent": "docwriter-corpus-scanner",
        "action": "wrote doc-index.json",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    manifest = []
    if MANIFEST_FILE.exists():
        try:
            with open(MANIFEST_FILE, "r") as f:
                manifest = json.load(f)
        except Exception:
            manifest = []
    manifest.insert(0, manifest_entry)
    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"Updated {MANIFEST_FILE}")


if __name__ == "__main__":
    doc_index = scan_workspace()
    write_output(doc_index)

    # Summary
    cluster_summary = sorted(
        doc_index["topicClusters"],
        key=lambda c: c["pageCount"],
        reverse=True
    )
    print(f"\n{'='*60}")
    print(f"CORPUS SCAN COMPLETE")
    print(f"{'='*60}")
    print(f"Total pages indexed: {doc_index['totalPages']}")
    print(f"Topic clusters:      {len(doc_index['topicClusters'])}")
    print(f"Outgoing refs:       {doc_index['crossRefStats']['totalOutgoingRefs']}")
    print(f"Incoming refs:       {doc_index['crossRefStats']['totalIncomingRefs']}")
    print(f"Orphaned pages:      {doc_index['crossRefStats']['orphanedPages']}")
    print(f"\nTop topic clusters:")
    for c in cluster_summary[:15]:
        print(f"  {c['name']:40s} {c['pageCount']:>5d} pages")
    print(f"\nMost linked pages:")
    for p in doc_index['crossRefStats']['mostLinkedPages'][:10]:
        print(f"  {p['path']:70s} ← {p['incomingCount']} refs")
