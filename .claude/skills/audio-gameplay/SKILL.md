---
name: audio-gameplay
description: Use when changing audio preview playback, snippet duration, game rounds, timers, answer/skip flow, or audio UI.
---

# Audio & Gameplay Skill

1. Trace timing from preset/configuration through UI, game engine, hook, and actual media playback.
2. Keep one canonical duration config.
3. Product requirement: custom bounds 0.1–15 seconds; Standard preset 0.5–15 seconds; Songspot remains a distinct preset.
4. Daily Challenge inherits Songspot timing.
5. Convert seconds to milliseconds only at the media boundary.
6. Verify the actual media element/Web Audio behavior; a correct slider value is insufficient.
7. Handle metadata-not-ready, seek restrictions, autoplay rejection, network failure, and missing preview URL.
8. Stop and release audio on round change, route change, replay, and unmount.
9. Guard timers and async callbacks against stale round IDs.
10. Prevent duplicate answer/skip events and ensure timeouts are deterministic.
11. Test boundary values, slow networks, mobile Safari/Chrome, and all affected modes.
