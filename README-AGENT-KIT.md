# BeatDrop Agent Kit

This kit adds shared project instructions, Claude Code rules/agents, and reusable skills for coding assistants.

## Install

Copy the contents of this kit into the root of the BeatDrop repository. Review existing files first; merge rather than overwrite any existing instructions.

Expected layout:

```text
BeatDrop/
├── AGENTS.md
├── CLAUDE.md
├── README-AGENT-KIT.md
├── .agents/
│   └── skills/
│       ├── beatdrop-architecture/SKILL.md
│       ├── nextjs-app-router/SKILL.md
│       ├── artist-catalog-sync/SKILL.md
│       ├── daily-challenge/SKILL.md
│       ├── audio-gameplay/SKILL.md
│       ├── pwa-offline/SKILL.md
│       └── preview-release-qa/SKILL.md
└── .claude/
    ├── agents/
    ├── rules/
    └── skills/  # real duplicated skill files to ../.agents/skills
```

The canonical skill source is `.agents/skills/`. `.claude/skills/` contains real duplicated skill files so skills are not duplicated and do not drift.

If your operating system or archive tool does not preserve duplicate files, recreate them from the repository root:

```bash
mkdir -p .claude/skills
for skill in .agents/skills/*; do
  name="$(basename "$skill")"
  ln -s "../../.agents/skills/$name" ".claude/skills/$name"
done
```

## How to use

- **Codex / Antigravity / compatible agents:** read root `AGENTS.md`; invoke the relevant skill by asking the agent to use it.
- **Claude Code:** reads `CLAUDE.md`, which imports `AGENTS.md`; path-scoped rules are in `.claude/rules/`; skills are in `.claude/skills/`.
- **Subagents:** Claude Code agent definitions are in `.claude/agents/`.

## Important project-specific notes

- This kit was prepared against the public BeatDrop repository structure and package scripts visible during review. Always verify current branch state and source paths before acting.
- Current known scripts include `dev`, `build`, `start`, `typecheck`, and `migrate:supabase`. Do not assume lint/test scripts exist.
- Do not deploy production, merge PRs, or mutate production data without explicit approval.
