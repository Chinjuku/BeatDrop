---
description: Next.js App Router, route handlers, and navigation conventions.
paths:
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
---

# Next.js App Router rules

- Use `next/link` for internal navigation and the Next.js router only for imperative navigation.
- Verify destination routes exist before adding links.
- Route Handlers must validate method, body, query parameters, and authorization.
- GET handlers must not mutate state or trigger expensive background jobs.
- Do not rely on unawaited promises continuing after a Vercel Serverless response.
- Keep secrets and privileged database access on the server.
- Avoid caching user-specific or mutable API responses without an explicit invalidation policy.
- Test desktop and mobile navigation, browser back/forward, loading, and error states.
