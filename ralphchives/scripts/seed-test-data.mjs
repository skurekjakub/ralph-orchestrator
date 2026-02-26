#!/usr/bin/env node

// Ralphchives CI Seed Script
//
// Creates a test category, generates an API token, and seeds topics for integration tests.
// Designed for ephemeral CI NodeBB instances (no idempotency needed).
//
// Usage:
//   node ralphchives/scripts/seed-test-data.mjs
//
// Outputs env vars to stdout (last 3 lines):
//   NODEBB_API_TOKEN=<token>
//   NODEBB_CATEGORY_ID=<cid>
//   NODEBB_API_URL=<url>

const NODEBB_URL = process.env.NODEBB_URL || "http://localhost:4567";
const ADMIN_USER = process.env.NODEBB_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.NODEBB_ADMIN_PASS || "RalphAdmin123!";

/** @type {string} */ let cookies;
/** @type {string} */ let csrf;

// ── API helpers ──────────────────────────────────────────────────────────

async function login() {
  const res = await fetch(`${NODEBB_URL}/api/v3/utilities/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  const configRes = await fetch(`${NODEBB_URL}/api/config`, {
    headers: { Cookie: cookies },
  });
  const config = await configRes.json();
  csrf = config.csrf_token;
}

async function apiPost(path, body) {
  const res = await fetch(`${NODEBB_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `POST ${path} → ${res.status}: ${data?.status?.message || JSON.stringify(data)}`
    );
  }
  return data.response;
}

// ── Seed data ────────────────────────────────────────────────────────────

const SEED_TOPICS = [
  [
    "DOC-3143: Add schema nesting and change propagation remarks to RFS page",
    "What Was Done\nAdded two new H3 subsections under the existing ## Remarks heading on the RFS page.\n\nKey Changes\n- Schema nesting documentation with examples\n- Change propagation rules and cascading behavior\n- Added cross-references to content model docs",
  ],
  [
    "DOC-3143: Add schema nesting and propagation remarks to RFS page",
    "What Was Done\nRevision of the previous attempt with improved structure.\n\nChanges\n- Reorganized schema nesting section\n- Added propagation diagram reference\n- Fixed broken anchor links",
  ],
  [
    "DOC-3143: [Test] Ralph sandbox issue — DOC-3143",
    "What Was Done\nAdded two new subsections to the Remarks section of the RFS documentation.\n\nTest observations\n- Sandbox environment validated successfully\n- All cross-references resolve correctly",
  ],
  [
    "DF-456: Updated Content Delivery API documentation",
    "What Was Done\nRefreshed the Content Delivery API reference with new endpoint examples and updated response schemas.\n\nGreat work my boys\n\nChanges\n- Updated GET /items endpoint documentation\n- Added new filtering parameters\n- Fixed response schema for nested content types",
  ],
  [
    "DOC-1001: Migrate Jekyll plugins to latest version",
    "What Was Done\nUpgraded all Jekyll plugins to their latest compatible versions. Updated Gemfile.lock and verified local build passes.\n\nKey Changes\n- jekyll-redirect-from upgraded from 0.14 to 0.16\n- jekyll-sitemap upgraded from 1.2 to 1.4\n- Fixed deprecation warnings in custom Liquid tags\n\nObservations\n- The jekyll-feed plugin requires Ruby 3.0+ now\n- Build time improved by ~15% after the upgrade",
  ],
  [
    "DOC-2055: Add webhook configuration guide to REST API docs",
    "What Was Done\nCreated a new page documenting webhook setup, payload formats, and retry behavior for the Content Delivery REST API.\n\nKey Sections Added\n- Webhook registration endpoint\n- Payload schema with JSON examples\n- Authentication headers (HMAC-SHA256)\n- Retry policy and exponential backoff\n- Troubleshooting common 4xx/5xx errors",
  ],
  [
    "DOC-789: Fix broken cross-references in taxonomy documentation",
    "What Was Done\nAudited all cross-references in the taxonomy section and fixed 23 broken links.\n\nRoot Cause\n- URL slugs changed when pages were reorganized in sprint 42\n- Some anchors were manually typed instead of using the include tag\n\nPrevention\n- Added a CI check that validates internal links on every PR",
  ],
  [
    "DOC-1500: Document content model inheritance and schema composition",
    "What Was Done\nWrote comprehensive documentation for content type inheritance, schema composition patterns, and field propagation rules.\n\nTopics Covered\n- Base content types and derived types\n- Field inheritance vs field override\n- Schema composition with mixins\n- Propagation of changes to child content types\n- Breaking vs non-breaking schema changes\n\nRelated Issues\n- DOC-3143 also covers schema propagation in the RFS context",
  ],
  [
    "DF-999: Update authentication flow diagrams",
    "What Was Done\nRefreshed all authentication flow diagrams to reflect the new OAuth 2.0 PKCE flow.\n\nDiagrams Updated\n- Authorization code flow with PKCE\n- Client credentials flow\n- Token refresh sequence\n- Multi-tenant SSO federation\n\nTools Used\n- Mermaid for source diagrams\n- Exported to SVG for the docs site",
  ],
  [
    "DOC-3200: Add migration guide for v14 to v15 API breaking changes",
    "What Was Done\nDocumented all breaking changes between API v14 and v15 with migration steps.\n\nBreaking Changes\n- Pagination cursor format changed from offset to keyset\n- Content item response schema flattened (nested \"system\" object removed)\n- Webhook payload v2 now includes content type codename\n- Rate limiting headers renamed from X-RateLimit to RateLimit (RFC 9110)\n\nMigration Steps\n- Step 1: Update pagination logic\n- Step 2: Adjust response parsing\n- Step 3: Update webhook handlers\n- Step 4: Test with sandbox environment",
  ],
  [
    "DOC-500: Improve search functionality documentation",
    "What Was Done\nExpanded the search API documentation with advanced query syntax, fuzzy matching examples, and performance tips.\n\nNew Sections\n- Full-text search operators (AND, OR, NOT, phrase matching)\n- Fuzzy search with configurable threshold\n- Filtering by content type, language, and collection\n- Search analytics and popular queries endpoint\n- Performance optimization: indexing strategies",
  ],
  [
    "DF-123: Fix rendering issues in code sample components",
    "What Was Done\nFixed syntax highlighting and copy button behavior in code sample components across the docs site.\n\nIssues Fixed\n- Prism.js language detection failing for YAML and HCL blocks\n- Copy button copying line numbers along with code\n- Long lines not wrapping correctly in mobile viewport\n- Tab switching losing scroll position in multi-language samples",
  ],
  [
    "DOC-4000: Document GraphQL delivery API",
    "What Was Done\nCreated complete GraphQL API reference including schema introspection, query examples, and rate limiting.\n\nSections\n- Schema overview and type system\n- Query complexity limits and depth restrictions\n- Pagination with relay-style cursors\n- Filtering and ordering\n- Error handling and partial responses\n- Authentication and API key scoping\n- Performance: query batching and persisted queries",
  ],
  [
    "DOC-2100: Create troubleshooting guide for content sync failures",
    "What Was Done\nBuilt a troubleshooting decision tree for diagnosing content synchronization failures between environments.\n\nScenarios Covered\n- Webhook delivery failures (timeout, auth, payload too large)\n- Content model drift between environments\n- Circular reference detection during import\n- Language variant conflicts during merge\n- Asset pipeline failures (image optimization timeout)\n\nDiagnostic Steps\n- Check sync log timestamps\n- Verify webhook signatures\n- Compare content model checksums\n- Review environment-specific publish rules",
  ],
];

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.error("═══ Ralphchives CI Seed ═══\n");

  // Login as admin
  console.error("Logging in...");
  await login();
  console.error("✓ Logged in\n");

  // Create test category
  console.error("Creating test category...");
  const category = await apiPost("/api/v3/categories", {
    name: "ci-test",
    description: "Ephemeral category for CI integration tests",
  });
  const cid = category.cid;
  console.error(`✓ Created category "ci-test" (cid: ${cid})\n`);

  // Create API token for the admin user (uid 1)
  console.error("Generating API token...");
  const tokenData = await apiPost("/api/v3/admin/tokens", {
    uid: 1,
    description: "ci-integration-test",
  });
  const token = tokenData.token;
  console.error(`✓ Token created: ${token}\n`);

  // Seed topics
  console.error(`Seeding ${SEED_TOPICS.length} topics...`);
  for (const [title, content] of SEED_TOPICS) {
    await apiPost("/api/v3/topics", { cid, title, content });
    console.error(`  ✓ ${title.slice(0, 60)}...`);
  }
  console.error(`✓ Seeded ${SEED_TOPICS.length} topics\n`);

  // Output env vars to stdout (parseable by CI)
  console.log(`NODEBB_API_TOKEN=${token}`);
  console.log(`NODEBB_CATEGORY_ID=${cid}`);
  console.log(`NODEBB_API_URL=${NODEBB_URL}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
