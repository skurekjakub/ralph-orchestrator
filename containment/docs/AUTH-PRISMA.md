# Authentication & authorization best practices — Next.js 16 + Prisma

A practical guide to defense-in-depth authentication for Next.js applications with Prisma ORM, aligned with 2026 industry standards (OWASP, OAuth 2.1, BFF pattern).

---

## Core principle: defense in depth

Never rely on a single layer for security. Every sensitive operation must independently verify the caller's identity and permissions. If any one layer is bypassed (as demonstrated by CVE-2025-29927), the layers below it must still protect the application.

Each layer serves a distinct purpose:

- **Layer 1 (proxy.ts):** Fast, optimistic gating — UX, not security.
- **Layer 2 (Route Handler / Server Component):** Cryptographic identity verification — the real guard.
- **Layer 3 (Data Access Layer — Prisma):** Row-level scoping — the vault.

---

## Prisma setup

### Installation (Prisma 7+)

Prisma 7 requires Driver Adapters. The old direct-connection setup no longer works.

```bash
# Dev dependencies
npm install prisma --save-dev

# Production dependencies
npm install @prisma/client @prisma/adapter-pg pg
```

### Singleton client

Next.js hot-reloading creates new module instances on every change. Without a singleton, you'll spawn dozens of database connections in development.

```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL!

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>
} & typeof global

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
```

### Schema (example with auth models)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  role          Role      @default(USER)
  passwordHash  String
  sessions      Session[]
  projects      Project[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Session {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  @@index([userId])
}

model Project {
  id        String   @id @default(cuid())
  title     String
  content   String?
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
}

enum Role {
  USER
  EDITOR
  ADMIN
}
```

### Deployment

Add a `postinstall` script so Prisma Client is generated on every deploy:

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "build": "next build"
  }
}
```

Run migrations before deployment in CI/CD:

```bash
npx prisma migrate deploy
```

---

## Layer 1 — `proxy.ts` (the gateway)

The proxy layer runs before every matching request. Keep it lightweight. It exists for user experience (fast redirects), not as a security boundary.

### Do

- Check for the presence of a session cookie.
- Perform a quick, non-cryptographic expiry check (e.g. decode the JWT payload without verifying the signature to check `exp`).
- Redirect unauthenticated users to `/login` before any rendering occurs.
- Use `config.matcher` to exclude public routes and static assets from proxy checks.

### Don't

- Perform full JWT signature verification here — it runs on every request including CSS, images, and fonts.
- Make database calls or network requests to validate sessions.
- Treat this as your authorization layer — it can be bypassed (CVE-2025-29927 proved this).
- Rely on this layer alone for any security-sensitive decision.

### Example

```typescript
// proxy.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup', '/api/auth']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const session = request.cookies.get('session')
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Optimistic expiry check (no signature verification)
  try {
    const payload = JSON.parse(atob(session.value.split('.')[1]))
    if (payload.exp * 1000 < Date.now()) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  } catch {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## Layer 2 — Route Handler / Server Component (the real guard)

This is where authentication and authorization actually happen. Every Route Handler, Server Action, and Server Component that touches sensitive data must begin with a call to a shared verification function.

### Do

- Validate the JWT signature cryptographically using your secret or public key.
- Check token claims: `exp`, `iss`, `aud`, `sub`.
- Verify roles and permissions before performing any operation.
- Use a single shared helper (`verifySession()`) to avoid duplicating logic.
- Use `React.cache()` to memoize the auth check within a single render pass (prevents redundant DB queries across Server Components in the same request).
- Return `401` when the identity cannot be established and `403` when identity is confirmed but permissions are insufficient.

### Don't

- Assume the proxy already checked authentication.
- Pass user data from proxy to Route Handler via headers and trust it blindly.
- Expose sensitive claims (internal IDs, roles, permissions) to Client Components via props.
- Skip verification on Server Actions — they are the most critical security surface.

### Example

```typescript
// lib/auth.ts
import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { cache } from 'react'
import prisma from '@/lib/prisma'

export type SessionUser = {
  userId: string
  role: string
  permissions: string[]
}

export class AuthError extends Error {
  constructor(
    public code: string,
    public status: number
  ) {
    super(code)
  }
}

export const verifySession = cache(async (): Promise<SessionUser> => {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value

  if (!token) {
    throw new AuthError('UNAUTHENTICATED', 401)
  }

  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET),
      { issuer: 'your-app', audience: 'your-app' }
    )

    // Optional: verify session still exists in DB (catches revoked sessions)
    const session = await prisma.session.findUnique({
      where: { id: payload.sid as string },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      throw new AuthError('SESSION_EXPIRED', 401)
    }

    return {
      userId: session.user.id,
      role: session.user.role,
      permissions: payload.permissions as string[] ?? [],
    }
  } catch (e) {
    if (e instanceof AuthError) throw e
    throw new AuthError('INVALID_SESSION', 401)
  }
})

export function requireRole(user: SessionUser, ...roles: string[]) {
  if (!roles.includes(user.role)) {
    throw new AuthError('FORBIDDEN', 403)
  }
}
```

```typescript
// app/api/projects/route.ts
import { verifySession, requireRole } from '@/lib/auth'
import { getProjectsByUser } from '@/data/projects'

export async function GET() {
  const user = await verifySession()          // 401 if fails
  requireRole(user, 'ADMIN', 'EDITOR')        // 403 if fails

  const projects = await getProjectsByUser(user.userId)
  return Response.json(projects)
}
```

### When to return 401 vs 403

| Condition | Code | Meaning |
|-----------|------|---------|
| No cookie / missing token | 401 | Unauthenticated — we don't know who you are |
| JWT signature invalid / tampered | 401 | Unauthenticated — identity cannot be verified |
| Token expired, refresh failed | 401 | Unauthenticated — session is dead |
| Token revoked server-side | 401 | Unauthenticated — session was explicitly killed |
| Valid identity, wrong role | 403 | Unauthorized — you lack the required role |
| Valid identity, not the resource owner | 403 | Unauthorized — this isn't yours |
| Valid identity, insufficient scope | 403 | Unauthorized — your token doesn't cover this action |
| Valid identity, account suspended | 403 | Unauthorized — access has been revoked |

Rule of thumb: if logging in again would fix it, it's a 401. If logging in again gives the same result, it's a 403.

---

## Layer 3 — Data Access Layer with Prisma (the vault)

The final line of defense. Authorization is enforced at the query level so that even if layers 1 and 2 are completely bypassed, data is never exposed to the wrong user.

### Do

- Scope every Prisma query to the authenticated user via `where` clauses.
- Build a data access module that always requires a `userId` parameter — never allow unscoped queries for sensitive tables.
- Return `null` (not errors) when the user has no access — this is the silent 403 pattern. There is nothing to "bypass" because the data was never queryable.
- Validate input with schema validation (Zod) before any Prisma query.
- Use Prisma transactions for multi-step operations that must be atomic.

### Don't

- Trust a `userId` passed from the client — always derive it from the verified session.
- Write Prisma queries that filter by user-supplied IDs without checking ownership.
- Assume that if Layer 2 passed, the data layer doesn't need to enforce boundaries.
- Use `$queryRaw` without parameterized inputs — Prisma's query builder is already safe from SQL injection, but raw queries are not.

### Example — data access module

```typescript
// data/projects.ts
import prisma from '@/lib/prisma'
import { z } from 'zod'

// Input validation schemas
const CreateProjectInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().max(10000).optional(),
})

const UpdateProjectInput = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(10000).optional(),
})

// Every function requires an authenticated userId — no exceptions

export async function getProjectsByUser(userId: string) {
  return prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      // Exclude content from list queries for performance
    },
  })
}

export async function getProjectById(userId: string, projectId: string) {
  // Ownership check baked into the query itself
  const project = await prisma.project.findUnique({
    where: { id: projectId, ownerId: userId },
  })

  // Returns null — not a 403 error. The project simply
  // doesn't exist from this user's perspective.
  return project
}

export async function createProject(userId: string, raw: unknown) {
  const data = CreateProjectInput.parse(raw) // throws ZodError if invalid

  return prisma.project.create({
    data: {
      ...data,
      ownerId: userId,
    },
  })
}

export async function updateProject(
  userId: string,
  projectId: string,
  raw: unknown
) {
  const data = UpdateProjectInput.parse(raw)

  // updateMany returns count — scoped to owner so it silently
  // returns { count: 0 } if the user doesn't own this project
  const result = await prisma.project.updateMany({
    where: { id: projectId, ownerId: userId },
    data,
  })

  return result.count > 0
}

export async function deleteProject(userId: string, projectId: string) {
  const result = await prisma.project.deleteMany({
    where: { id: projectId, ownerId: userId },
  })

  return result.count > 0
}
```

### Example — transaction for multi-step operations

```typescript
// data/transfer.ts
import prisma from '@/lib/prisma'

export async function transferProjectOwnership(
  currentOwnerId: string,
  projectId: string,
  newOwnerId: string
) {
  // Transaction ensures atomicity — either both operations
  // succeed or neither does
  return prisma.$transaction(async (tx) => {
    // Verify current ownership inside the transaction
    const project = await tx.project.findUnique({
      where: { id: projectId, ownerId: currentOwnerId },
    })

    if (!project) return null // Silent 403

    // Verify new owner exists
    const newOwner = await tx.user.findUnique({
      where: { id: newOwnerId },
    })

    if (!newOwner) return null

    return tx.project.update({
      where: { id: projectId },
      data: { ownerId: newOwnerId },
    })
  })
}
```

### Example — admin data access (role-aware queries)

```typescript
// data/admin.ts
import prisma from '@/lib/prisma'

// Admins can query across users — but the function signature
// still makes this explicit, not accidental
export async function getAllProjects(adminUserId: string) {
  // Caller (Layer 2) must have already verified ADMIN role.
  // This function trusts that, but still logs who made the query.
  return prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: {
        select: { id: true, name: true, email: true },
      },
    },
  })
}
```

---

## Wiring it all together — complete endpoint

Here's the full flow from request to response:

```typescript
// app/api/projects/[id]/route.ts
import { NextRequest } from 'next/server'
import { verifySession, requireRole } from '@/lib/auth'
import { getProjectById, updateProject, deleteProject } from '@/data/projects'

// GET /api/projects/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Layer 2: Verify identity
  const user = await verifySession()

  const { id } = await params

  // Layer 3: Scoped query — returns null if not owner
  const project = await getProjectById(user.userId, id)

  if (!project) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json(project)
}

// PATCH /api/projects/:id
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifySession()
  const { id } = await params
  const body = await req.json()

  const updated = await updateProject(user.userId, id, body)

  if (!updated) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}

// DELETE /api/projects/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifySession()
  const { id } = await params

  const deleted = await deleteProject(user.userId, id)

  if (!deleted) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  return Response.json({ success: true })
}
```

---

## Session & token management

### Cookie configuration

All session cookies must use these attributes:

```typescript
import { cookies } from 'next/headers'

const cookieStore = await cookies()
cookieStore.set('session', token, {
  httpOnly: true,       // JS cannot read it — XSS cannot steal it
  secure: true,         // HTTPS only
  sameSite: 'lax',      // CSRF protection (use 'strict' for sensitive apps)
  path: '/',
  maxAge: 60 * 60 * 24, // 24 hours (match your token TTL)
})
```

### Token lifecycle

- **Access tokens:** Short-lived (15–60 minutes). Validated cryptographically on every request.
- **Refresh tokens:** Longer-lived (days to weeks). Stored server-side or in an HttpOnly cookie. Used to rotate access tokens without requiring re-login.
- **Rotation:** Issue a new refresh token on every use and invalidate the old one. If an old refresh token is reused, invalidate the entire token family (possible theft detected).
- **Revocation:** On password change, suspicious activity, or explicit logout, invalidate all sessions for the user server-side.

### Session revocation with Prisma

```typescript
// lib/session.ts
import prisma from '@/lib/prisma'

export async function revokeAllUserSessions(userId: string) {
  await prisma.session.deleteMany({
    where: { userId },
  })
}

export async function revokeSession(sessionId: string) {
  await prisma.session.delete({
    where: { id: sessionId },
  })
}

export async function cleanExpiredSessions() {
  await prisma.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  })
}
```

### BFF pattern (recommended)

The backend-for-frontend pattern keeps OAuth tokens entirely server-side:

1. User initiates login → browser redirects to identity provider.
2. Identity provider redirects back to your Next.js Route Handler with an authorization code.
3. Route Handler exchanges the code for tokens server-side — the browser never sees them.
4. Route Handler creates a Session record in Prisma and sets a session cookie (HttpOnly, Secure, SameSite).
5. On subsequent requests, the Route Handler reads the cookie, looks up the session in Prisma, and attaches the real token when calling protected APIs.

The browser only ever holds a session identifier. The actual OAuth tokens never touch the client.

---

## Auth.js + Prisma adapter (optional)

If using Auth.js (NextAuth.js) instead of rolling your own auth, it has a first-party Prisma adapter:

```typescript
// auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import prisma from '@/lib/prisma'
import GitHub from 'next-auth/providers/github'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [GitHub],
  session: { strategy: 'database' }, // Sessions stored in Prisma
})
```

This handles user creation, session storage, and account linking automatically via Prisma. The defense-in-depth principles still apply — use `auth()` in your Route Handlers and scope data queries in your data access layer.

---

## Hardening checklist

### Headers & transport

- Enforce HTTPS everywhere — no exceptions.
- Set `Content-Security-Policy` headers to prevent XSS. Use nonces for inline scripts.
- Set `Strict-Transport-Security` (HSTS) with a long max-age.
- Configure CORS to allow only your own origins.
- Strip or reject unexpected headers (e.g. `x-middleware-subrequest`).

### Rate limiting

- Rate limit authentication endpoints (login, signup, password reset) aggressively.
- Use exponential backoff or account lockout after repeated failures.
- Consider IP-based and user-based limits independently.

### Input validation

- Validate all inputs at the boundary (Route Handlers, Server Actions) with Zod before any processing.
- Never trust client-supplied IDs, roles, or permissions.
- Use Prisma's query builder (not `$queryRaw`) wherever possible — it parameterizes queries automatically.

### Monitoring

- Log authentication failures, permission denials, and anomalous patterns.
- Alert on token family reuse (indicates possible refresh token theft).
- Audit sensitive operations (role changes, data exports, bulk deletes).

### Dependencies

- Keep Next.js, Prisma, and all auth libraries up to date — patch immediately for security releases.
- Use automated dependency scanning (Snyk, Dependabot) for known vulnerabilities.
- Pin dependency versions in production and review updates before merging.
- Always run `prisma generate` in your build/deploy pipeline via the `postinstall` script.

---

## Quick reference: the three-layer model

```
┌─────────────────────────────────────────────────┐
│  CLIENT                                         │
│  HttpOnly session cookie auto-attached          │
└─────────────────┬───────────────────────────────┘
                  │
    ┌─────────────▼──────────────┐
    │  LAYER 1 — proxy.ts       │  Fast, optimistic
    │  Cookie present? Expired?  │  → /login if not
    └─────────────┬──────────────┘
                  │
    ┌─────────────▼──────────────┐
    │  LAYER 2 — Route Handler   │  Cryptographic
    │  verifySession()           │  → 401 / 403
    │  JWT sig + role check      │
    │  Prisma session lookup     │
    └─────────────┬──────────────┘
                  │
    ┌─────────────▼──────────────┐
    │  LAYER 3 — Data Access     │  Row-level scoping
    │  Prisma queries scoped     │  → null if no access
    │  WHERE ownerId = userId    │
    └─────────────┬──────────────┘
                  │
        ┌─────────▼─────────┐
        │  PostgreSQL        │
        │  (via Prisma 7)    │
        └───────────────────┘
```

Each layer is independently sufficient. Layer 1 improves UX. Layers 2 and 3 provide actual security. If any single layer is compromised or bypassed, the remaining layers still protect the application.