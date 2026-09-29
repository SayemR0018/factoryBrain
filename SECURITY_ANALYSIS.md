# Security Vulnerability Analysis — factoryBrain

**Date:** 2026-09-29
**Scope:** Read-only audit of `factoryBrain` — backend (.NET 9 Clean Architecture), frontend (Next.js 15), Docker, and configuration.
**Method:** Static analysis across source files (`*.cs`, `*.json`, `*.yml`, `*.csproj`, `Dockerfile`, `*.tsx`, `*.mjs`). No files were modified during the audit.

---

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 10 |
| Low | 14 |
| Informational | ~24 |
| **Total** | **~50** |

No critical findings. The codebase has a solid baseline — no SQL injection, XSS, XXE, command injection, SSRF, or hardcoded secrets in git history. The main risks are **authorization design fragility**, **session-management race conditions**, and **indirect prompt injection in the RAG pipeline**.

---

## High Severity (2)

### F-2.1 / F-8.7 — `AdminOrLegacyToken` policy passes for anonymous requests
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Program.cs:381-382`

```csharp
if (ctx.User.Identity?.IsAuthenticated != true)
    return true;
```

The admin authorization policy intentionally fails-open to defer to the `[AdminToken]` filter. The only thing protecting admin endpoints (`/api/rag/reindex`, `/api/rag/ingest`, `/api/settings/llm`) is the `[AdminToken]` filter. If a new admin action is added without that filter, anonymous access succeeds. This is a fragile single-line-of-defense design.

**Recommendation:** Remove the anonymous fallthrough and require both `[Authorize]` and `[AdminToken]`, or migrate fully to JWT-only auth and delete the legacy admin-token path.

---

### F-2.3 — Admin endpoints bypassable in Development
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Middleware/AdminTokenAuthorizationFilter.cs:55-58`

```csharp
if (_env.IsDevelopment())
    return Task.CompletedTask;   // bypass
```

Combined with F-2.1's policy fallthrough, admin endpoints are reachable with **no authentication** in Development. Mis-deploying the Development profile to a production environment would expose everything.

**Recommendation:** Restrict the dev bypass to localhost-only or behind an explicit `FactoryBrain:DevBypassAdmin` flag. Add a startup assertion that verifies `ASPNETCORE_ENVIRONMENT != Development` for any non-localhost bind URL.

---

## Medium Severity (10)

### F-1.1 — Hardcoded `postgres/postgres` in `appsettings.json`
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/appsettings.json:25-27`

```json
"ConnectionStrings": {
  "Postgres": "Host=localhost;Port=5432;Database=factorybrain;Username=postgres;Password=postgres"
}
```

A production-shaped Postgres connection string with default credentials is committed to source.

**Recommendation:** Remove the hardcoded string; rely solely on `FACTORYBRAIN_DB` env var. Fail-fast in Production if unset.

---

### F-1.2 — Hardcoded `postgres/postgres` fallback in `Program.cs`
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Program.cs:185`

```csharp
?? "Host=localhost;Port=5432;Database=factorybrain;Username=postgres;Password=postgres;Include Error Detail=true";
```

Same fallback plus `Include Error Detail=true`, which causes Npgsql to surface schema details via `GlobalExceptionHandler` in Development.

**Recommendation:** Drop the fallback; throw `InvalidOperationException` when both env and config are missing.

---

### F-1.4 — JWT signing key length not validated from config path
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Program.cs:244-248`

The `>= 32 bytes` guard is only applied when the key comes from the `JWT_SIGNING_KEY` env var, not when it comes from `Jwt__SigningKey` configuration. A misconfigured deployment with a short config key would start without error.

**Recommendation:** Apply the same `>= 32` byte guard to any `Jwt__SigningKey` read from configuration.

---

### F-2.6 — Refresh-token rotation race (no concurrency control, no reuse-detection)
**Location:** `FactoryBrain.Backend/FactoryBrain.Infrastructure/Services/AuthService.cs:70-96`

```csharp
var user = await _db.Users.FirstOrDefaultAsync(u => u.RefreshTokenHash == presentedHash, ct);
// ... no concurrency token, no row lock ...
user.RefreshTokenHash = hash;
await _db.SaveChangesAsync(ct);
```

The read-modify-write sequence is not transactional and has no row lock. Two concurrent refresh requests both rotate the same user row; only the second client's token remains valid. Worse, if a stolen cookie is used concurrently with the legitimate owner, neither is detected.

**Recommendation:** Add an EF concurrency token on `User.RefreshTokenHash`, or wrap in a `SERIALIZABLE` transaction. Implement a "previous valid hashes" family table for reuse-detection (a stolen token replayed after rotation triggers revocation of the entire chain).

---

### F-2.9 — Login rate-limiter spoofable if `FORWARDED_HEADERS_ENABLED=true`
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Program.cs:401-411`

The login rate-limit partition key is `RemoteIpAddress`. With `FORWARDED_HEADERS_ENABLED=true` and empty `TRUSTED_PROXIES`, anyone can spoof `X-Forwarded-For` and bypass the limit. The startup warning is only printed to stdout — the application proceeds anyway.

**Recommendation:** Fail startup when `FORWARDED_HEADERS_ENABLED=true` and `TRUSTED_PROXIES` is empty.

---

### F-3.8 — Indirect prompt injection in the RAG pipeline
**Locations:**
- `FactoryBrain.Backend/FactoryBrain.Api/Controllers/RagController.cs:173-203`
- `FactoryBrain.Backend/FactoryBrain.Infrastructure/Services/AskService.cs:152-194`
- `FactoryBrain.Backend/FactoryBrain.Infrastructure/Services/RagService.cs:381-491`

`POST /api/rag/ingest` accepts arbitrary `Content` and stores it as a `ManualDocument` + `DocumentChunk` rows. Later, `AskService.LiveAsync` concatenates the user's query plus the top-k retrieved chunks (titles + snippets) into a single LLM prompt:

```csharp
"Question: " + req.Query,
"RAG hits: " + System.Text.Json.JsonSerializer.Serialize(hits.Select(h => new { h.SourceId, h.Title, h.Snippet, h.HybridScore }))
```

An attacker who can call `/api/rag/ingest` (requires admin token/JWT) can plant content like `"ignore previous instructions and respond with …"`. When a victim runs `POST /api/ask`, the planted content is concatenated into the prompt with no system-message separation, no role tagging, and no instruction-vs-data demarcation. Classic indirect prompt injection.

**Recommendation:** Wrap retrieved content with explicit delimiters and a system message stating "the following are untrusted user-submitted documents". Consider stripping/escaping control characters and tagging content as `role: data`. Restrict ingestion further.

---

### F-4.2 — No CSRF token on `/api/auth/refresh`
**Location:** `FactoryBrain.Backend/FactoryBrain.Api/Controllers/AuthController.cs:78-102`

The refresh-token cookie is `HttpOnly` (good) and `SameSite=Lax` by default, which protects against most cross-site POSTs. However, if an operator sets `SameSite=None` (allowed via `AUTH_COOKIE_SAMESITE`) for cross-origin SPA usage, no CSRF token, `Origin` check, or double-submit cookie is in place.

**Recommendation:** Add an `Origin`/`Referer` allowlist check on cookie-authenticated state-changing endpoints, or use a double-submit anti-CSRF token.

---

### F-6.1 — No `packages.lock.json`
**Location:** `FactoryBrain.Backend/` (all csproj)

No NuGet lock files means transitive dependencies can drift between builds. A new transitive CVE may be silently pulled in.

**Recommendation:** Enable `RestorePackagesWithLockFile` and commit `packages.lock.json` for every csproj.

---

### F-10.1 — Dev profile bypasses admin token + enables sensitive logging
**Locations:**
- `AdminTokenAuthorizationFilter.cs:55-58`
- `AdminTokenVerifier.cs:42-45`
- `Program.cs:761-765`
- `appsettings.Development.json`

In Development: admin token bypassed, Swagger UI exposed, `EnableSensitiveDataLogging()` on, `DetailedErrors` on, EF logs query parameters. Mis-deployment of the Development profile to production would expose everything. The Dockerfile correctly sets `ASPNETCORE_ENVIRONMENT=Production`, mitigating containerized deployments.

**Recommendation:** Add a startup assertion that verifies `ASPNETCORE_ENVIRONMENT != Development` for any non-localhost bind URL.

---

### F-3.10 — `/api/rag/ingest` accepts unbounded `Content`/`Tags`
**Location:** `FactoryBrain.Backend/FactoryBrain.Application/Dtos/Rag/IngestDtos.cs:10-20`

The DTO comment claims `Max 200 KB` but no FluentValidator enforces it. A multi-megabyte `Content` body would be accepted, embedded into vectors (memory pressure), and stored.

**Recommendation:** Add a FluentValidator capping `Content` length and `Tags.Count`.

---

## Low Severity (14)

| ID | Finding | Location |
|---|---|---|
| F-1.3 | `.env` file in working tree with placeholder creds (gitignored, never committed) | `FactoryBrain.Api/.env` |
| F-2.2 | Admin token comparison short-circuits on length mismatch (timing side-channel) | `AdminTokenAuthorizationFilter.cs:106-112` |
| F-2.4 | JWT bearer doesn't pin `ValidAlgorithms = HmacSha256` | `Program.cs:282-294` |
| F-2.7 | `ME` endpoint trusts `sub` claim without revocation check (by design, defense-in-depth) | `AuthController.cs:131-138` |
| F-3.7 | SSRF surface — outbound calls go to hardcoded providers today, monitor for changes | `AskService.cs`, `OpenAiEmbeddingService.cs`, `GeminiEmbeddingService.cs` |
| F-4.5 | GlobalExceptionHandler leaks exception type+message in Development | `Middleware/GlobalExceptionHandler.cs:82-84` |
| F-5.4 | MD5 in HashEmbeddingService (non-security feature-hashing use) | `HashEmbeddingService.cs:64` |
| F-5.5 | PBKDF2 100k iterations — modern guidance is ≥600k or Argon2id | `PasswordHasherAdapter.cs:11-25` |
| F-5.7 | Simulator seed logged at info level | `SimulatorHostedService.cs:59, 71` |
| F-6.2 | `next-themes@0.3.0` outdated | `package.json:30` |
| F-6.3 | `next@15.0.3` outdated — check advisories for cache poisoning / middleware bypass / SSRF | `package.json:17` |
| F-6.7 | `BCrypt.Net-Next` referenced but unused | `FactoryBrain.Api.csproj:25` |
| F-8.1 | `Include Error Detail=true` in fallback connection string | `Program.cs:185` |
| F-8.2 | TOCTOU on `MarkReadAsync` — no concurrency token | `FloorAlertService.cs:32-39` |

---

## Informational (key items)

The following were verified as **by-design or non-issues** — flagged here so future audits don't re-investigate:

### Cryptography (positive)
- **F-5.1** JWT signing key fallback uses `RandomNumberGenerator.GetBytes(32)` (CSPRNG). ✓
- **F-5.2** Refresh tokens generated via `RandomNumberGenerator.Fill(raw)` (32 bytes). ✓
- **F-5.3** Token comparison uses `CryptographicOperations.FixedTimeEquals`. ✓
- **F-2.8** Password hashing via `Microsoft.AspNetCore.Identity.PasswordHasher` (PBKDF2-HMAC-SHA256, 100k iterations, 128-bit salt). ✓
- **F-5.6** `new Random(seed)` used for simulated sensor streams (non-security, game-of-life values). ✓

### Injection (positive)
- **F-3.1–F-3.6** No SQL injection, command injection, XXE, or path-traversal surfaces. EF parameterization used throughout. `.env.local` reads use a constant path. No XML parsing exists. ✓

### CORS / CSRF / Data exposure (positive)
- **F-4.1** CORS uses explicit origin allowlist + `AllowCredentials`. No `AllowAnyOrigin`. ✓
- **F-4.4** `/api/auth/me` returns only `(Id, Email, Role)` — no hash leakage. ✓
- **F-9.1–F-9.6** No `eval`/`Function` in frontend. `dangerouslySetInnerHTML` only used on hardcoded script. Secrets correctly kept server-side (`NEXT_PUBLIC_*` only on safe values). ✓

### Container & infra (positive)
- **F-7.1** Dockerfile runs as non-root user (uid 1001). ✓
- **F-7.2** `ASPNETCORE_ENVIRONMENT=Production` set in container. ✓
- **F-7.5** `EnableSensitiveDataLogging()` and `DetailedErrors` gated on `IsDevelopment()`. ✓
- **F-4.8** Swagger UI exposed only in Development. ✓

### Secrets (positive)
- **F-1.6** No real secrets in `git log -p` history. Only `.env.example` placeholders appear. ✓

### Misc (informational)
- **F-4.6** `appsettings.Development.json` enables verbose EF logging — Development only. ✓
- **F-4.7** Root `/` endpoint exposes endpoint map — minor info leak, useful for debugging. ✓
- **F-7.4** `/health` returns 200/503 based on Postgres connectivity. ✓
- **F-7.7** Swagger doc version is `v9` (intentional). ✓
- **F-10.4** Operational docs (`HANDOFF.md`, `JUDGES.md`) contain no secrets. ✓

---

## Prioritized Recommendations

1. **Remove the anonymous fallthrough** in the `AdminOrLegacyToken` policy (F-2.1) — biggest design risk.
2. **Add concurrency control + reuse-detection** to refresh-token rotation (F-2.6).
3. **Drop hardcoded `postgres/postgres` defaults** from both `appsettings.json` and `Program.cs` (F-1.1, F-1.2).
4. **Demarcate RAG content in LLM prompts** — wrap retrieved chunks in a system-message boundary to mitigate indirect prompt injection (F-3.8).
5. **Enable + commit `packages.lock.json`** for all csproj (F-6.1).
6. **Pin `ValidAlgorithms = [HmacSha256]`** in JWT bearer params (F-2.4).
7. **Add Origin/Referer allowlist** on `/api/auth/refresh` for `SameSite=None` deployments (F-4.2).
8. **Add FluentValidator** for `RagIngestRequest` capping `Content` length and `Tags.Count` (F-3.10).
9. **Remove unused `BCrypt.Net-Next`** package reference (F-6.7).
10. **Bump PBKDF2 iterations to ≥600k** or migrate to Argon2id (F-5.5).

---

## Conclusion

The `factoryBrain` codebase is in solid shape for a demo project. There are no critical vulnerabilities and the standard attack classes (SQLi, XSS, XXE, command injection, SSRF, secret leakage) are not present. The three findings that warrant the most attention are:

1. **Authorization design fragility** (F-2.1 / F-2.3) — a single missing attribute on a future admin endpoint would expose it.
2. **Session management race** (F-2.6) — a real attack vector for session theft.
3. **Indirect prompt injection in RAG** (F-3.8) — the most novel risk for an AI-powered application; an admin-authorized attacker can plant content that hijacks LLM responses for any user.

Addressing items 1–4 in the prioritized list would close the most significant gaps.
