---
description: Supabase, PostgreSQL, SQLite, migrations, and server security rules.
paths:
  - "lib/**/*.{ts,tsx}"
  - "shared/**/*.{ts,tsx}"
  - "supabase/**/*.{sql}"
  - "scripts/**/*.{ts,tsx,js,mjs}"
  - "app/api/**/*.{ts,tsx}"
  - "data/**/*"
---

# Database and security rules

- Preserve both Supabase Cloud and SQLite Offline Mode unless a task explicitly changes support.
- Use the existing project database abstraction; do not add direct database access paths casually.
- Keep service-role credentials server-only.
- Never expose secrets in client code, logs, tests, or error messages.
- Use parameterized queries and validate all external inputs.
- Use stable IDs and database constraints for identity and deduplication.
- Make sync and retry operations idempotent.
- Treat migrations as production changes: inspect current schema, provide safe forward migration, and consider rollback.
- Never overwrite or delete `data/beatdrop.db` without a verified backup and explicit approval.
- Do not trust client-submitted scores, elapsed times, ownership, or authorization claims.
