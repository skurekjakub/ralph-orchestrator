#!/usr/bin/env node

// Ralphchives NodeBB Setup Script
//
// Reads profiles from profiles/*/profile.json and creates:
// - One category per profile
// - One user per unique agent variant in each profile
// - One API token per user
//
// Also cleans up default NodeBB categories and any duplicate admin tokens.
// Idempotent — skips categories/users that already exist.
//
// Usage: node ralphchives/scripts/setup-nodebb.mjs

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const NODEBB_URL = process.env.NODEBB_URL || "http://localhost:4567";
const ADMIN_USER = process.env.NODEBB_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.NODEBB_ADMIN_PASS || "RalphAdmin123!";
const PROFILES_DIR = resolve(import.meta.dirname, "../../profiles");

// Default categories to remove after setup
const DEFAULT_CATEGORY_NAMES = [
  "Announcements",
  "General Discussion",
  "Blogs",
  "Comments & Feedback",
  "Comments &amp; Feedback",
];

/** @type {string} */ let cookies;
/** @type {string} */ let csrf;

// ── API helpers ──────────────────────────────────────────────────────────

async function login() {
  const res = await fetch(`${NODEBB_URL}/api/v3/utilities/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

  const configRes = await fetch(`${NODEBB_URL}/api/config`, {
    headers: { Cookie: cookies },
  });
  const config = await configRes.json();
  csrf = config.csrf_token;
  console.log("✓ Logged in as admin");
}

async function apiGet(path) {
  const res = await fetch(`${NODEBB_URL}${path}`, {
    headers: { Cookie: cookies },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
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
  if (!res.ok)
    throw new Error(
      `POST ${path} → ${res.status}: ${data?.status?.message || JSON.stringify(data)}`
    );
  return data.response;
}

async function apiDelete(path) {
  const res = await fetch(`${NODEBB_URL}${path}`, {
    method: "DELETE",
    headers: { Cookie: cookies, "x-csrf-token": csrf },
  });
  return res.status;
}

async function apiPut(path, body) {
  const res = await fetch(`${NODEBB_URL}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      "x-csrf-token": csrf,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `PUT ${path} → ${res.status}: ${data?.status?.message || JSON.stringify(data)}`
    );
  return data.response;
}

// ── Profile discovery ────────────────────────────────────────────────────

async function discoverProfiles() {
  const entries = await readdir(PROFILES_DIR, { withFileTypes: true });
  const profiles = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const profilePath = join(PROFILES_DIR, entry.name, "profile.json");
    try {
      const raw = await readFile(profilePath, "utf-8");
      const profile = JSON.parse(raw);
      const variants = (profile.variants || []).map((v) => {
        const displayName = (v.agent || "").replace(/^ralph\./, "");
        return { agent: v.agent, displayName };
      });
      // Deduplicate by displayName within a profile
      const uniqueVariants = [
        ...new Map(variants.map((v) => [v.displayName, v])).values(),
      ];

      profiles.push({
        id: entry.name,
        variants: uniqueVariants,
      });
    } catch {
      // No profile.json or parse error — skip
    }
  }

  return profiles;
}

// ── Category management ──────────────────────────────────────────────────

async function getExistingCategories() {
  const data = await apiGet("/api/categories");
  return data.categories || [];
}

async function createProfileCategories(profiles, existingCategories) {
  const created = [];
  for (const profile of profiles) {
    const existing = existingCategories.find((c) => c.name === profile.id);
    if (existing) {
      console.log(`  ⏭ Category "${profile.id}" already exists (cid: ${existing.cid})`);
      created.push({ profileId: profile.id, cid: existing.cid });
      continue;
    }
    const cat = await apiPost("/api/v3/categories", {
      name: profile.id,
      description: `Agent activity log for ${profile.id} profile`,
    });
    console.log(`  ✓ Created category "${profile.id}" (cid: ${cat.cid})`);
    created.push({ profileId: profile.id, cid: cat.cid });
  }
  return created;
}

async function removeDefaultCategories(existingCategories) {
  for (const cat of existingCategories) {
    if (DEFAULT_CATEGORY_NAMES.includes(cat.name)) {
      const status = await apiDelete(`/api/v3/categories/${cat.cid}`);
      console.log(`  ✓ Removed default category "${cat.name}" (${status})`);
    }
  }
}

// ── User management ──────────────────────────────────────────────────────

async function getExistingUsers() {
  const data = await apiGet("/api/v3/users");
  return data || [];
}

async function createVariantUsers(profiles) {
  const created = [];

  for (const profile of profiles) {
    for (const variant of profile.variants) {
      const username = `${profile.id}-${variant.displayName}`;
      const email = `${username}@ralphchives.local`;
      const password = `Bot${username}${Math.random().toString(36).slice(2, 8)}!`;

      try {
        const user = await apiPost("/api/v3/users", {
          username,
          password,
          email,
        });
        console.log(`  ✓ Created user "${username}" (uid: ${user.uid})`);
        created.push({
          profileId: profile.id,
          variant: variant.displayName,
          username,
          uid: user.uid,
          password,
        });
      } catch (err) {
        if (err.message.includes("taken") || err.message.includes("exists")) {
          console.log(`  ⏭ User "${username}" already exists`);
          // Find existing uid
          const searchRes = await apiGet(
            `/api/v3/users?query=${encodeURIComponent(username)}`
          );
          const match = (searchRes?.users || searchRes || []).find(
            (u) => u.username === username
          );
          if (match) {
            created.push({
              profileId: profile.id,
              variant: variant.displayName,
              username,
              uid: match.uid,
              password: "(existing)",
            });
          }
        } else {
          console.error(`  ✗ Failed to create user "${username}": ${err.message}`);
        }
      }
    }
  }
  return created;
}

// ── Token management ─────────────────────────────────────────────────────

async function getExistingTokens() {
  const data = await apiGet("/api/admin/settings/api");
  return data.tokens || [];
}

async function createUserTokens(users) {
  const tokens = [];
  for (const user of users) {
    const description = `ralphchives-${user.username}`;
    const token = await apiPost("/api/v3/admin/tokens", {
      uid: user.uid,
      description,
    });
    console.log(`  ✓ Token for "${user.username}": ${token.token}`);
    tokens.push({ ...user, token: token.token, description });
  }
  return tokens;
}

async function cleanupDuplicateAdminTokens(existingTokens) {
  // Keep only one "Ralphchives Master" token, delete duplicates
  const masterTokens = existingTokens.filter(
    (t) => t.description === "Ralphchives Master"
  );
  if (masterTokens.length > 1) {
    for (let i = 1; i < masterTokens.length; i++) {
      await apiDelete(`/api/v3/admin/tokens/${masterTokens[i].token}`);
      console.log(`  ✓ Cleaned up duplicate admin token`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Ralphchives NodeBB Setup ═══\n");

  await login();

  // Discover profiles
  console.log("\n── Discovering profiles ──");
  const profiles = await discoverProfiles();
  for (const p of profiles) {
    console.log(
      `  ${p.id}: ${p.variants.map((v) => v.displayName).join(", ")}`
    );
  }

  // Clean up existing tokens
  console.log("\n── Cleaning up tokens ──");
  const existingTokens = await getExistingTokens();
  await cleanupDuplicateAdminTokens(existingTokens);

  // Create categories
  console.log("\n── Creating profile categories ──");
  const existingCategories = await getExistingCategories();
  const categories = await createProfileCategories(profiles, existingCategories);

  // Remove defaults
  console.log("\n── Removing default categories ──");
  const refreshedCategories = await getExistingCategories();
  await removeDefaultCategories(refreshedCategories);

  // Create users per variant
  console.log("\n── Creating variant users ──");
  const users = await createVariantUsers(profiles);

  // Create API tokens per user
  console.log("\n── Generating API tokens ──");
  const tokens = await createUserTokens(users);

  // Create a master admin token if none exists
  console.log("\n── Ensuring admin master token ──");
  const updatedTokens = await getExistingTokens();
  const hasMaster = updatedTokens.some(
    (t) => t.description === "Ralphchives Master"
  );
  let masterToken;
  if (hasMaster) {
    masterToken = updatedTokens.find(
      (t) => t.description === "Ralphchives Master"
    ).token;
    console.log(`  ⏭ Master token exists: ${masterToken}`);
  } else {
    const t = await apiPost("/api/v3/admin/tokens", {
      uid: 1,
      description: "Ralphchives Master",
    });
    masterToken = t.token;
    console.log(`  ✓ Created master token: ${masterToken}`);
  }

  // Summary
  console.log("\n\n═══════════════════════════════════════════");
  console.log("           SETUP COMPLETE");
  console.log("═══════════════════════════════════════════\n");

  console.log("Master Admin Token:");
  console.log(`  ${masterToken}\n`);

  console.log("Categories:");
  for (const c of categories) {
    console.log(`  ${c.profileId} → cid: ${c.cid}`);
  }

  console.log("\nUsers & Tokens:");
  for (const t of tokens) {
    console.log(`  ${t.username} (uid: ${t.uid}) → ${t.token}`);
  }

  console.log(
    "\n── Add to ralphchives/.env ──"
  );
  console.log(`NODEBB_MASTER_TOKEN=${masterToken}`);
  for (const t of tokens) {
    const envKey = `NODEBB_TOKEN_${t.username.toUpperCase().replace(/-/g, "_")}`;
    console.log(`${envKey}=${t.token}`);
  }

  console.log("\n── Category mapping (for sync config) ──");
  console.log(JSON.stringify(Object.fromEntries(categories.map(c => [c.profileId, c.cid])), null, 2));
}

main().catch((err) => {
  console.error("\n✗ Setup failed:", err.message);
  process.exit(1);
});
