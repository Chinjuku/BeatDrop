---
name: preview-release-qa
description: Use before merging a BeatDrop feature or reviewing a Vercel Preview / production release.
---

# Preview & Release QA Skill

1. Confirm branch, commit, deployment URL, and deployment environment.
2. Verify the Preview is accessible; if SSO blocks access, report browser QA as blocked.
3. Check `git status --short` and `git diff --check`.
4. Run only scripts that exist in `package.json`; baseline known gates are `npm run typecheck` and `npm run build`.
5. Test affected feature and regression-critical game modes.
6. Check desktop and mobile layouts, keyboard navigation, loading/error/empty states.
7. Inspect database migrations, generated files, SQLite binary diffs, and accidental secrets.
8. Separate:
   - Confirmed defects
   - Potential risks from static review
   - Runtime tests passed
   - Blocked/not tested
9. Never merge, push, or deploy production without explicit approval.
10. Report commit SHA, Preview URL, test evidence, unresolved issues, and recommendation.
