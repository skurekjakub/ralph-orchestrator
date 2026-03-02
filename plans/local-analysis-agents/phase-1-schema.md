# Phase 1: Schema — `postTaskHooks` Config

**Goal:** Add `IPostTaskHook` type, Zod schema, and enforce `mode: "local"` for all hook stages.

## Changes

### `src/config/types.ts` — `IPostTaskHook`

```typescript
/** A named post-task hook pipeline — runs after main pipeline + log collection + teardown. */
export interface IPostTaskHook {
  /** Hook identifier — used in log prefixes, activity log, and output subdirectory name. */
  readonly name: string;
  /** Sequential local-only stages within this hook. Abort-on-fail. */
  readonly stages: IStage[];
}
```

Add to `IVariant`:

```typescript
export interface IVariant {
  // ... existing fields ...
  /** Optional post-task hook pipelines. Run after main pipeline, log collection, and teardown. */
  readonly postTaskHooks?: IPostTaskHook[];
}
```

### `src/config/schemas.ts` — `postTaskHookSchema`

```typescript
const postTaskHookSchema = z.object({
  name: z.string().min(1).regex(/^[a-z0-9-]+$/, "Hook name must be lowercase alphanumeric with hyphens"),
  stages: z.array(stageSchema)
    .min(1)
    .refine(
      (stages) => stages.every(s => s.mode === "local"),
      "Post-task hook stages must be mode: 'local'",
    )
    .refine(
      (stages) => new Set(stages.map(s => s.role)).size === stages.length,
      "Stage roles must be unique within a hook",
    ),
});
```

Add to `variantSchema`:

```typescript
postTaskHooks: z.array(postTaskHookSchema)
  .optional()
  .refine(
    (hooks) => !hooks || new Set(hooks.map(h => h.name)).size === hooks.length,
    "Post-task hook names must be unique within a variant",
  ),
```

### Role uniqueness

Hook stage roles must be unique within the hook. They do NOT need to be unique across the main pipeline — a hook role `"analyzer"` doesn't conflict with a main stage role `"analyzer"` (though in practice they'll differ). The `collectedLogs` key prefix uses `<role>-<logId>`, so main pipeline roles and hook roles occupy separate namespaces (hooks write to `outputDir/hooks/<name>/`).

## Files

- `src/config/types.ts` — `IPostTaskHook` interface, `IVariant` update
- `src/config/schemas.ts` — `postTaskHookSchema`, `variantSchema` update
- `tests/config/schemas.test.ts` — validation tests

## Verification

| Input | Expected |
|---|---|
| Hook stage with `mode: "container"` | Rejected — "must be mode: 'local'" |
| Hook stage with `mode: "local"` | Accepted |
| Hook with empty `stages: []` | Rejected — min 1 |
| Hook with duplicate stage roles | Rejected |
| Two hooks with same `name` | Rejected — "names must be unique" |
| Hook name `"run-analysis"` | Accepted |
| Hook name `"Run Analysis"` | Rejected — lowercase alphanumeric + hyphens only |
| Variant with no `postTaskHooks` | Accepted (optional) |
| Variant with `postTaskHooks: []` | Accepted (empty array) |
