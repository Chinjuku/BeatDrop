---
name: nextjs-app-router
description: Use when implementing or debugging Next.js App Router pages, layouts, navigation, Route Handlers, caching, or Vercel behavior.
---

# Next.js App Router Skill

- Inspect current Next.js version and existing conventions before coding.
- Prefer Server Components by default; add `use client` only for interactive browser behavior.
- Keep secrets and privileged database access in server-only modules.
- Use `next/link` for internal links; verify all target routes.
- Route Handlers validate methods, params, body, and authorization.
- GET is read-only. Mutations use appropriate methods.
- Do not rely on unawaited work continuing after a Vercel Serverless response.
- Avoid duplicate requests and repeated catalog initialization.
- Define cache policy explicitly; invalidate caches after mutations.
- Handle loading, error, empty, and offline states.
- Test route navigation, refresh, browser history, mobile breakpoints, typecheck, and production build.
