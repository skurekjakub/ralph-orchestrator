# Phase F: New Skill — `ralph-codesamples-adminui`

**Repo:** `ralph-orchestrator`
**Depends on:** Phase A (bootstrap skill for project setup context)

## Step 8: Create the admin UI skill

**File:** `shared/skills/tasks/ralph-codesamples-adminui/SKILL.md`

### Skill content outline

Teaches the agent how to interact with the Xperience by Kentico admin UI for creating and managing objects that cannot be created via code alone.

**Sections:**

1. **Access**
   - URL: `localhost:666/admin`
   - Credentials: `administrator` / `admin`
   - Prerequisite: codesamples server must be running (`npm run codesamples:serve`)

2. **Navigation patterns** (via playwright-cli)
   - Content tree: `/admin/content`
   - Settings: `/admin/settings`
   - Commerce sections: promotions, shipping, order statuses
   - Taxonomies: `/admin/taxonomies`

3. **Object creation workflows**
   - **Promotions:** Navigate to Commerce → Promotions → Create
   - **Taxonomies:** Navigate to Taxonomies → Create taxonomy
   - **Shipping methods:** Commerce → Shipping → Create
   - **Order statuses:** Commerce → Order statuses → Create
   - Each workflow: navigate → fill form → save → verify

4. **CI persistence**
   - After creating objects via admin UI: `npm run codesamples:store`
   - This serializes admin-created objects to XML files in `CIRepository/`
   - Objects must use `codesamples` code name prefix for CI serialization
   - Verify new XML files appear in `CIRepository/` after store

5. **`repository.config` whitelisting**
   - If new object types don't serialize: check `repository.config`
   - Add the object type to the whitelist if missing
   - Example: `<ObjectType>cms.taxonomy</ObjectType>`

6. **Playwright-cli interaction patterns**
   - Login flow: navigate → fill username → fill password → click sign in → wait for dashboard
   - Form filling: navigate → wait for form → fill fields → save → verify success toast
   - Screenshots: take before/after for verification evidence
   - Wait for XHR: admin UI uses async AJAX — wait for network idle after actions

## Step 9: Add skill to profile.json

**File:** `profiles/ralph-docs/profile.json`

Add `"ralph-codesamples-adminui"` to the `skills` array of the `ralph` variant stage, near the other codesamples skills:

```json
"ralph-codesamples-bootstrap",
"ralph-code-samples",
"ralph-codesamples-project",
"ralph-codesamples-verification",
"ralph-codesamples-adminui",
```
