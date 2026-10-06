# Measurement recipes

Numbers in a follow-up come from one of these, with the method named in the
file. Each recipe lists the trap that produced a wrong number before. Add the
recipes your stack needs as you pay for them.

## File and corpus statistics

```bash
find <dir> -name '*.<ext>' -type f -printf '%s\n' \
  | awk '{n++; s+=$1; if($1>m)m=$1} END {printf "files=%d total=%.1fMB mean=%.0fB max=%dB\n", n, s/1048576, s/n, m}'
find <dir> -name '*.<ext>' -type f -printf '%s %p\n' | sort -n | tail -5
```

Trap: counting occurrences across many files needs `grep -c` per file summed,
not `grep -rc` eyeballed. On macOS, `find -printf` doesn't exist — use
`stat -f '%z'` or `gfind`.

## Micro-benchmark of a code path

Scripts live in the scratchpad (never the repo), import the repo's own modules,
and resolve the repo's dependencies. For TypeScript with `tsx`:

```bash
S=<scratchpad>; ln -sfn "$PWD/node_modules" $S/node_modules
npx tsx --tsconfig tsconfig.json $S/bench.mts; rm -f $S/node_modules
```

Shape: three passes, report the third (warm); mean / p50 / p90 / max; sample
across the real inputs plus the known outliers by size. Use the repo's own
configuration of the code path (its plugin lists, options, fixtures) — a
benchmark with a different configuration measures a different pipeline.

Trap: `.ts` under tsx hits `ERR_PACKAGE_PATH_NOT_EXPORTED` for ESM-only
dependencies — name the script `.mts`.

## Server response timing

```bash
curl -s -o /dev/null -w '%{time_starttransfer}\n' http://localhost:3101/<route>   # first (cold) vs second (warm) request
```

Measure against a production build when the question is about production:
dev servers compile on demand and skip caches.

## Client payload of a page

Save the HTML (`curl` or `agent-browser get html`) and the network log; byte
count what each visitor downloads, and `gzip -c file | wc -c` for what the
wire actually carries.

## Runtime behaviour in the browser

`agent-browser vitals <url>` for TTFB / LCP / CLS / FCP / INP. Render
profiling only captures what mounts *after* it starts; across a navigation it
often captures nothing — use `vitals` for load-time questions.

## Framework and library facts

1. The installed framework source (for example `node_modules/<framework>/…`) —
   the behaviour that ships. Cite `file:line`. Read the function, not the
   comment above it.
2. The version-matched docs the stack profile names — cite `path:line`. Newer
   than anything in training data.
3. Package source for libraries (`node_modules/<pkg>/…`).
4. Vendor pages via WebFetch — note the URL and that it was fetched today;
   vendor docs redirect between product generations, so confirm the product and
   tier on the page you landed on.

Repo docs (`docs/conventions`, `.ai/*`, README prose) are hypotheses, not
evidence; they go stale exactly where the interesting findings are.

## Shell traps that cost a round trip

- A `cd` inside a compound command moves the persistent working directory for
  every later call; use absolute paths.
- `grep` with huge `.{0,N}` windows on minified files hangs — slice by byte
  offset in node instead.
- If a proxy or wrapper filters command output, compute facts that come from
  output (a count, a version) with `awk`/`node` so nothing is elided.
