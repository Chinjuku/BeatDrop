---
name: artist-catalog-sync
description: Use when changing artist search, iTunes ingestion, track catalog, artist collaboration, deduplication, or sync jobs.
---

# Artist Catalog & Sync Skill

## Identity model
- Track identity and artist identity are different entities.
- A track may belong to multiple artists.
- Prefer authoritative source IDs (iTunes artistId / trackId) when present.
- Never infer artist identity by blindly splitting `&`, commas, `feat.`, `with`, or `x`.
- Keep display credit separate from normalized artist relationships.

## Ingestion
1. Inspect the current schema and both database adapters.
2. Normalize and validate external iTunes responses.
3. Upsert artists and tracks using stable unique keys.
4. Upsert track-artist relationships idempotently.
5. Deduplicate the same track returned by multiple artist searches.
6. Bound concurrency and apply timeout/backoff without retry storms.
7. Persist job state so work can resume after serverless interruption.
8. Do not use fire-and-forget background promises as durable job execution.
9. GET endpoints must not start or recover sync jobs.
10. Invalidate catalog and game-pool caches after successful writes.

## Verification
Test solo artist, collaboration, featured credit, repeated sync, concurrent sync, partial iTunes failure, retry, and Artist Mode visibility for every linked artist. Verify Cloud and SQLite behavior.
