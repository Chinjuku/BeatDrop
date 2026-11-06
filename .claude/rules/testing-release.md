---
description: Verification, regression, preview, and release safety rules.
---

# Testing and release rules

- Inspect `package.json` before choosing commands; do not invent scripts.
- Known baseline gates: `npm run typecheck` and `npm run build`.
- Add or run targeted tests when a test harness exists.
- If browser automation is unavailable, state that UI behavior was not browser-tested.
- Preview deployments are for verification; production deployment requires explicit user approval.
- Do not merge or push unless explicitly requested.
- Review `git diff --check`, `git status --short`, and changed files before reporting.
- Report exact commands, outcomes, skipped tests, and unresolved risks.
- Never claim a deployment or test succeeded without observable confirmation.
