---
name: pwa-offline
description: Use when implementing or reviewing BeatDrop PWA installability, manifest, service worker, caching, offline shell, or update lifecycle.
---

# PWA & Offline Skill

## Before implementation
- Inspect Next.js version, deployment constraints, current public assets, and existing service worker/manifest.
- Prefer the smallest compatible PWA implementation; do not add a large dependency without justification.
- Keep PWA work separate from critical gameplay bug fixes where possible.

## Installability
- Provide valid manifest, icons (including maskable), theme/background colors, and standalone display mode.
- Include iOS touch icon and supported metadata.
- Provide a non-intrusive install UX; iOS Safari may require manual Add to Home Screen instructions.

## Caching
- Cache versioned static assets and application shell safely.
- Do not cache privileged, personalized, or mutable API responses indiscriminately.
- Do not cache error responses as successful content.
- Provide cache invalidation and safe update activation.
- Do not cache all iTunes audio previews or create unbounded storage.
- Respect browser storage quotas and cleanup.

## Offline truthfulness
- Distinguish opening the app shell offline from having catalog data and audio available offline.
- Integrate with existing SQLite Offline Mode only after verifying its runtime compatibility with browser deployment.
- Never claim full offline gameplay unless actual audio is locally available.
- Clearly label unavailable online-only features.

## Verification
Test installability, service worker lifecycle, offline/online transition, cache upgrade, rollback, stale assets, iOS Safari, Android Chrome, and every supported game mode.
