# claude-command-deck — План впровадження
> last_updated: 2026-08-06 · поточна фаза: 3/3

## Правила оновлення
- Статус пункту змінюється В ТІЙ САМІЙ задачі, що й робота — не «потім».
- Завершений → ✅ + дата; блокер → 🔴 + причина.
- Фаза = done лише коли всі її пункти ✅; тоді інкремент «поточна фаза».
- PLAN = ВІХИ. Дрібну декомпозицію → TODO.md.
- Статуси: 🔲 заплановано · 🟡 в роботі · ✅ зроблено · 🔴 блокер.

## Фаза 1 — Базовий Deck (v1)  ✅
- ✅ 2026-06-07: scanner/translator/openrouter/groups (чисті модулі, 23 юніт-тести)
- ✅ 2026-06-07: treeProvider/terminal/extension (vscode-шар, click-to-insert без запуску)
- ✅ 2026-06-07: vsix 0.1.0 спаковано і встановлено через code-server
- ✅ 2026-06-08: v0.2.0 — тематичні категорії, symlink-скани, self-update, іконка

## Фаза 2 — Marketplace (install/update/uninstall каталогу)  ✅
- ✅ 2026-06-08: спроєктовано архітектуру (гібрид: build-script + TreeView), спек затверджено
- ✅ 2026-06-08: 10 TDD-тасків — catalog types/parsing, installer path-safety, computeStatus, marketplace view/commands, weekly GitHub Action
- ✅ 2026-06-08: 125 тестів, E2E pass, hardening (text-ext allowlist, guard remote→local reads), vsix 0.2.1
- ✅ 2026-06-08: змержено feat/implementation → main

## Фаза 3 — Ручна верифікація на хості + GitHub-first  🟡
- 🔲 F5 manual verification у VS Code (Remote-SSH): tree, переклад, click-to-insert, marketplace install/uninstall (потребує Андрія)
- 🔲 Встановити/оновити vsix 0.2.1 у VS Code через Install from VSIX (потребує UI)
- ✅ 2026-08-06: міграція документації в GitHub (канонічний набір CLAUDE/PLAN/TODO/notes/docs, секретів у доках не виявлено)
