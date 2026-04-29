# ADR 001 — Session-based auth over JWT

**Status:** Accepted

## Context

The system needs to authenticate API requests from a browser SPA. Two common options are stateless JWT tokens and server-side sessions.

## Decision

Use server-side sessions via Better Auth with httpOnly cookies.

## Rationale

- **Revocability:** Sessions can be invalidated immediately (e.g. on logout, role change, or security incident). JWTs cannot be revoked before expiry without a token denylist, which adds complexity.
- **No token leakage via JS:** httpOnly cookies are inaccessible to JavaScript, eliminating XSS token theft.
- **Simpler frontend:** No token storage, refresh logic, or Authorization header management needed.
- **Acceptable performance:** The auth middleware caches session lookups (SHA-256 keyed LRU, 60 s TTL) so the auth service is not hit on every request.

## Trade-offs

- Requires sticky sessions or shared session storage in a horizontally scaled deployment (Redis is already in the stack).
- CSRF protection must be applied to mutating endpoints (Better Auth handles this via `sameSite=strict`).
- Cross-origin requests require explicit CORS + `credentials: include`.

## Alternatives considered

**JWT (stateless):** Simpler horizontal scaling, but requires a denylist for revocation and exposes tokens to XSS if stored in localStorage.
