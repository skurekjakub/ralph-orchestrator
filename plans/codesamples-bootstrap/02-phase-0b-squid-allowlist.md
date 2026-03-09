# Phase 0b: Squid Proxy Allowlist Update

**Repo:** `ralph-orchestrator`
**File:** `shared/security/squid.conf`
**Blocking:** Phases A–F (agent container can't reach ADO NuGet feeds without this)

## Problem

The agent container routes all outbound traffic through Squid proxy. Currently allowed (relevant):

- `.nuget.org` ✅ — public NuGet registry

Missing: Azure DevOps package feeds and artifact endpoints needed for `dotnet restore` from Kentico.Private feed and build artifact downloads.

## Domains to add

| Domain | Purpose | Used by |
|--------|---------|---------|
| `pkgs.dev.azure.com` | ADO NuGet package feeds | `dotnet restore` with Kentico.Private feed |
| `dev.azure.com` | ADO REST API | Pipeline/build/artifact queries (PR/build URL formats) |
| `vsblob.dev.azure.com` | Artifact blob storage | Signed download URLs from build artifacts |
| `.blob.core.windows.net` | Azure blob fallback | Some artifact signed URLs route through general blob storage |

## Change

Add to `acl allowed_domains dstdomain` list in `shared/security/squid.conf`, after the existing Azure entries:

```squid
# Azure DevOps — NuGet feeds and build artifact downloads
acl allowed_domains dstdomain pkgs.dev.azure.com
acl allowed_domains dstdomain dev.azure.com
acl allowed_domains dstdomain vsblob.dev.azure.com
acl allowed_domains dstdomain .blob.core.windows.net
```

## Open question

`.blob.core.windows.net` is broad (all Azure blob storage). Artifact signed URLs may use specific subdomains like `artprodcus*.blob.core.windows.net`, but Squid doesn't support wildcard globs within subdomains.

**Recommendation:** Start with just `vsblob.dev.azure.com`. Add `.blob.core.windows.net` only if artifact downloads fail without it. Test with a real build artifact download to verify.

## Contingency if proxy path still fails

The allowlist update is the preferred first fix because it preserves the normal app-container execution path. If a real PR URL or build URL test still fails after the targeted allowlist expansion, do not narrow the public `xpversion` contract.

Instead, move only the ADO artifact-download step onto an alternate execution path that is not blocked by the app-container proxy policy, then hand the downloaded packages back to the bootstrap flow. Examples include a sidecar-mediated path or another already-authorized execution surface.

## Verification

```bash
# From inside the agent container:
curl -I https://pkgs.dev.azure.com    # Should get 200/302, not 403
dotnet restore --configfile src/nuget.config  # Should succeed with private feed
```

Also test at least one real PR URL or build URL artifact download through the same path before declaring the allowlist sufficient.
