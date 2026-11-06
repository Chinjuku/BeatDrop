---
description: Music gameplay, snippet timing, scoring, rounds, and audio lifecycle rules.
paths:
  - "context/**/*.{ts,tsx}"
  - "hooks/**/*.{ts,tsx}"
  - "components/**/*.{ts,tsx}"
  - "lib/engine/**/*.{ts,tsx}"
  - "shared/**/*.{ts,tsx}"
---

# Gameplay and audio rules

- Keep gameplay rules in domain/config modules, not duplicated across UI components.
- Canonical custom snippet bounds: 0.1–15 seconds.
- Standard preset: 0.5–15 seconds.
- Songspot is a separate preset; do not conflate it with Standard.
- Daily Challenge inherits canonical Songspot timing configuration.
- Convert seconds to milliseconds only at the audio API boundary.
- Validate actual playback duration, not only slider labels.
- Prevent duplicate round initialization, answer submission, score awards, and skip penalties.
- Audio must stop and clean up on route change, round transition, replay, and unmount.
- Server-authoritative logic must validate competitive scores and challenge results.
- Test timing boundaries and all affected game modes.
