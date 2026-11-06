---
name: beatdrop-architecture
description: Use when changing BeatDrop architecture, shared domain logic, database boundaries, module structure, or cross-cutting features.
---

# BeatDrop Architecture Skill

1. Read root `AGENTS.md` and inspect the actual repository tree.
2. Trace the feature through UI, context/hooks, domain logic, API, and persistence.
3. Identify the canonical owner of each rule or datum; avoid multiple sources of truth.
4. Preserve the dual persistence contract: Supabase PostgreSQL and SQLite Offline Mode.
5. Keep server-only modules separate from browser code.
6. Prefer explicit domain functions and typed boundaries over broad context objects or ad hoc fetch calls.
7. For schema changes, inspect current SQL and both adapters before designing migration.
8. Document invariants, migration safety, and compatibility.
9. Verify with `npm run typecheck` and `npm run build`; run targeted tests if available.
10. Report confirmed facts separately from assumptions.
