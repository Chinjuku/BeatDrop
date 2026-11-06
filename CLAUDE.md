# BeatDrop — Claude Code Instructions

@AGENTS.md

## Claude-specific workflow

- Read the matching files in `.claude/rules/` before editing a matching area.
- Discover reusable workflows in `.claude/skills/` (mirrors `.agents/skills/`).
- Use the specialized subagents in `.claude/agents/` for focused implementation, review, and QA when useful.
- Do not commit, push, merge, or deploy production unless the user explicitly requests it.
- Before finishing, provide the exact commands run and their actual outcomes.
