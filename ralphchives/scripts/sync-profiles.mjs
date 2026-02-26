#!/usr/bin/env node

// Ralphchives Profile Sync Script
//
// Scans profiles/*/profile.json and ensures NodeBB has:
// - A category for each profile
// - A user + API token for each variant
// - Admin permissions on all bot users
//
// Safe to re-run — only creates what's missing.
//
// Usage: node ralphchives/scripts/sync-profiles.mjs

import { readdir, readFile } from "node:fs/promises";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const NODEBB_URL = process.env.NODEBB_URL || "http://localhost:4567";
const ADMIN_USER = process.env.NODEBB_ADMIN_USER || "admin";
const ADMIN_PASS = process.env.NODEBB_ADMIN_PASS || "RalphAdmin123!";
const PROFILES_DIR = resolve(import.meta.dirname, "../../profiles");
const ROOT_ENV_PATH = resolve(import.meta.dirname, "../../.env");

let cookies;
let csrf;

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
      const uniqueVariants = [
        ...new Map(variants.map((v) => [v.displayName, v])).values(),
      ];
      profiles.push({ id: entry.name, variants: uniqueVariants });
    } catch {
      // No profile.json or parse error — skip
    }
  }

  return profiles;
}

// ── Sync logic ───────────────────────────────────────────────────────────

async function syncCategories(profiles) {
  const data = await apiGet("/api/categories");
  const existing = data.categories || [];
  const results = [];
  let created = 0;

  for (const profile of profiles) {
    const match = existing.find((c) => c.name === profile.id);
    if (match) {
      results.push({ profileId: profile.id, cid: match.cid, new: false });
      continue;
    }
    const cat = await apiPost("/api/v3/categories", {
      name: profile.id,
      description: `Agent activity log for ${profile.id} profile`,
    });
    console.log(`  + Category "${profile.id}" (cid: ${cat.cid})`);
    results.push({ profileId: profile.id, cid: cat.cid, new: true });
    created++;
  }

  if (created === 0) console.log("  (no new categories)");
  return results;
}

async function syncUsers(profiles) {
  const results = [];
  let created = 0;

  for (const profile of profiles) {
    for (const variant of profile.variants) {
      const username = `${profile.id}-${variant.displayName}`;
      const email = `${username}@ralphchives.local`;

      try {
        const user = await apiPost("/api/v3/users", {
          username,
          password: `Bot${username}${Math.random().toString(36).slice(2, 8)}!`,
          email,
        });
        console.log(`  + User "${username}" (uid: ${user.uid})`);
        results.push({ profileId: profile.id, variant: variant.displayName, username, uid: user.uid, new: true });
        created++;
      } catch (err) {
        if (err.message.includes("taken") || err.message.includes("exists")) {
          const searchRes = await apiGet(`/api/v3/users?query=${encodeURIComponent(username)}`);
          const match = (searchRes?.users || searchRes || []).find((u) => u.username === username);
          if (match) {
            results.push({ profileId: profile.id, variant: variant.displayName, username, uid: match.uid, new: false });
          }
        } else {
          console.error(`  ! Failed to create "${username}": ${err.message}`);
        }
      }
    }
  }

  if (created === 0) console.log("  (no new users)");
  return results;
}

async function syncTokens(users) {
  const tokenData = await apiGet("/api/admin/settings/api");
  const existingTokens = tokenData.tokens || [];
  const results = [];
  let created = 0;

  for (const user of users) {
    const description = `ralphchives-${user.username}`;
    const existing = existingTokens.find((t) => t.description === description);
    if (existing) {
      results.push({ ...user, token: existing.token, new: false });
      continue;
    }

    const token = await apiPost("/api/v3/admin/tokens", {
      uid: user.uid,
      description,
    });
    console.log(`  + Token for "${user.username}": ${token.token}`);
    results.push({ ...user, token: token.token, new: true });
    created++;
  }

  if (created === 0) console.log("  (no new tokens)");
  return results;
}

async function syncAdminPermissions(users) {
  let granted = 0;
  for (const user of users) {
    if (!user.new) continue;
    try {
      await apiPut(`/api/v3/groups/administrators/membership/${user.uid}`, {});
      console.log(`  + Admin granted to "${user.username}"`);
      granted++;
    } catch (err) {
      if (!err.message.includes("already")) {
        console.error(`  ! Failed to grant admin to "${user.username}": ${err.message}`);
      }
    }
  }
  if (granted === 0) console.log("  (no new grants needed)");
}

// ── .env writer ───────────────────────────────────────────────────────────

/**
 * Append new per-variant NODEBB_TOKEN_* entries to the orchestrator's root .env file.
 * Also ensures NODEBB_API_URL is present.
 */
function writeNewTokensToEnv(newTokens) {
  const envPath = ROOT_ENV_PATH;
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = existing.split("\n");

  const updates = new Map();
  // Ensure NODEBB_API_URL is always present
  if (!lines.some((l) => l.startsWith("NODEBB_API_URL="))) {
    updates.set("NODEBB_API_URL", "http://host.docker.internal:4567");
  }
  for (const t of newTokens) {
    const envKey = `NODEBB_TOKEN_${t.username.toUpperCase().replace(/-/g, "_")}`;
    updates.set(envKey, t.token);
  }

  if (updates.size === 0) return;

  for (const [key, value] of updates) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (idx >= 0) {
      lines[idx] = `${key}=${value}`;
    } else {
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines.splice(lines.length - 1, 0, `${key}=${value}`);
      } else {
        lines.push(`${key}=${value}`);
      }
    }
  }

  writeFileSync(envPath, lines.join("\n"), "utf-8");
  console.log(`  ✓ Written ${updates.size} entries to ${envPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══ Ralphchives Profile Sync ═══\n");

  await login();
  console.log("✓ Connected to NodeBB\n");

  const profiles = await discoverProfiles();
  console.log(`Found ${profiles.length} profiles: ${profiles.map((p) => p.id).join(", ")}\n`);

  console.log("── Categories ──");
  const categories = await syncCategories(profiles);

  console.log("\n── Users ──");
  const users = await syncUsers(profiles);

  console.log("\n── API Tokens ──");
  const tokens = await syncTokens(users);

  console.log("\n── Admin Permissions ──");
  await syncAdminPermissions(users);

  // Report new items
  const newCategories = categories.filter((c) => c.new);
  const newTokens = tokens.filter((t) => t.new);

  if (newCategories.length === 0 && newTokens.length === 0) {
    console.log("\n✓ Everything is in sync — nothing to add.\n");
    return;
  }

  console.log("\n\n═══ New Resources Created ═══\n");

  if (newCategories.length > 0) {
    console.log("New categories:");
    for (const c of newCategories) {
      console.log(`  ${c.profileId} → cid: ${c.cid}`);
    }
  }

  if (newTokens.length > 0) {
    console.log("\nNew user tokens:");
    for (const t of newTokens) {
      const envKey = `NODEBB_TOKEN_${t.username.toUpperCase().replace(/-/g, "_")}`;
      console.log(`  ${envKey}=${t.token}`);
    }

    // Auto-write new tokens to orchestrator .env
    console.log("\n── Writing new tokens to orchestrator .env ──");
    writeNewTokensToEnv(newTokens);
  }

  console.log("\nFull category mapping:");
  console.log(JSON.stringify(Object.fromEntries(categories.map((c) => [c.profileId, c.cid])), null, 2));
}

main().catch((err) => {
  console.error("\n✗ Sync failed:", err.message);
  process.exit(1);
});
