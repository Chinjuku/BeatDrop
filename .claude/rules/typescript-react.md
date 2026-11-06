---
description: TypeScript and React conventions for BeatDrop source code.
paths:
  - "app/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
  - "context/**/*.{ts,tsx}"
  - "hooks/**/*.{ts,tsx}"
  - "lib/**/*.{ts,tsx}"
  - "shared/**/*.{ts,tsx}"
  - "types/**/*.{ts,tsx}"
---

# TypeScript and React rules

- Prefer explicit domain types and narrow unions over `any`.
- Treat API, iTunes, database, localStorage, and URL data as untrusted until validated.
- Keep client components focused on interaction; keep server/data logic server-side.
- Avoid unnecessary client boundaries and avoid importing server-only code into client components.
- Keep effects idempotent; guard asynchronous effects against stale responses and unmounts.
- Clean up timers, audio resources, event listeners, and subscriptions.
- Avoid duplicated state when a value can be derived.
- Use stable React keys and avoid index keys for mutable collections.
- Use semantic elements and accessible labels/focus states.
- Preserve the project's existing styling and component conventions; do not introduce a new design system without approval.
