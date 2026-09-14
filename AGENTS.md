# Agent instructions

Read `CLAUDE.md` completely before changing this project.

<!-- BEGIN MANAGED: codex-model-routing -->
## Codex model routing

- Default primary model: `gpt-5.6-terra` with `medium` reasoning.
- Do not delegate simple or sequential work. Use subagents only for independent, bounded work when delegation saves time or protects the primary context.
- Use at most two subagents concurrently. Give each the smallest sufficient task packet; omit full conversation history unless required.
- Use `gpt-5.6-luna` with `low` reasoning for file discovery, evidence collection, test execution, mechanical checks, and short summaries.
- Use `gpt-5.6-terra` with `medium` reasoning for isolated implementation or debugging delegated from the primary agent.
- Escalate once to `gpt-6-astra` with `medium` reasoning only for cross-system architecture, difficult root-cause analysis, or after two failed reasoned approaches. Use `high` only for critical production, security, or irreversible data decisions.
- If Astra is unavailable or rejected by the runtime allowlist, retry once with `gpt-5.6-sol` at `high`; use `xhigh` only when the critical task still requires deeper reasoning. Never loop between escalation models.
- If multi-agent tools are unavailable, continue with the primary model and report the degraded routing briefly.
- Subagents return concise conclusions with verifiable file and line references; do not return raw logs when a summary is sufficient.
<!-- END MANAGED: codex-model-routing -->
