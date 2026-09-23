@AGENTS.md

## Claude Code specifics
- Use **plan mode** for anything in Golden rule 8. Present the plan and wait for approval.
- Work one sub-task at a time: implement, run the relevant tests, show the diff and results, then continue.
- Use `/clear` between unrelated features. Hand off long sessions with a short summary instead of carrying stale context.
- For ledger, sync or auth changes, run a focused second-pass review (a subagent or a fresh session) on correctness and invariants before calling it done.
- End every session with the wrap-up in `docs/ai-workflow-rules.md` §2.
