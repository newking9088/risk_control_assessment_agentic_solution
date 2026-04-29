# Security Policy

## Reporting a vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities.

Email: newking9088@gmail.com with subject `[SECURITY]`. Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours.

## Supported versions

Only the latest release on `main` receives security patches.

## Security controls

| Control | Implementation |
|---------|---------------|
| Authentication | Session cookies (httpOnly, secure, sameSite=strict) via Better Auth |
| Authorisation | RBAC (`admin > manager > analyst`) enforced in FastAPI middleware |
| Data isolation | PostgreSQL Row-Level Security on all `app.*` tables |
| Input validation | Pydantic models on all API inputs; magic-byte file validation |
| XSS prevention | DOMPurify on all rendered user content |
| SQL injection | Parameterised queries via psycopg3 — no string interpolation |
| Rate limiting | slowapi on sensitive endpoints |
| Security headers | HSTS, CSP, X-Frame-Options, X-Content-Type-Options via middleware |
| Dependency scanning | Dependabot on GitHub Actions |
