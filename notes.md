# Claude Command Deck — notes

VS Code extension: сайдбар зі списком усіх Claude Code commands + skills (user + plugins),
описи перекладені на потрібну мову через OpenRouter (кеш), клік вставляє invocation у
активний термінал БЕЗ запуску.

## Хронологія
- 2026-06-07: Реалізовано план повністю (Tasks 1-10). 5 чистих модулів (scanner/translator/
  openrouter/groups + vscode-шар treeProvider/terminal/extension). 23 unit-тести зелені,
  typecheck чистий. Smoke на реальному ~/.claude: 209 items (74 cmd, 135 skills), 0 дублів.
  Спаковано claude-command-deck-0.1.0.vsix (6 файлів, 7.46 KB).

## Лишилось (потребує UI/Андрія)
- Встановити vsix у VS Code через Remote-SSH (на VPS немає `code` CLI):
  Extensions → "…" → Install from VSIX → claude-command-deck-0.1.0.vsix
- F5 manual verification (Task 9 step 4): перевірити tree, переклад, click-to-insert.

## Архітектура
Pure-логіка (scanner/translator/groups/openrouter) без vscode — юніт-тести Vitest.
vscode-шар тонкий. OpenRouter key через `vault-get shared/openrouter_api_key`.
Модель за замовч. google/gemini-2.5-flash. Кеш перекладів у globalStorage.
- 2026-06-07 18:50: Завершено Tasks 3-10: scanner/translator/treeProvider/terminal — 23/23 тести OK, typecheck чисто, vsix 7.46 KB
- 2026-06-07 18:53: Завершив Tasks 3-10: scanner/translator/groups/treeProvider — 23/23 тестів, vsix 7.46KB, залежності чисті
- 2026-06-07 18:56: Завершив Tasks 3-10, спакував vsix (7.46 KB) — 23/23 тести, typecheck чистий, smoke 209 items
- 2026-06-07 19:01: Встановив claude-command-deck через code-server — extension розгорнуто на VPS, готовий до Remote-SSH
- 2026-06-08 09:32: Виправив три проблеми extension (tooltip, переклад, групи) — rebuild vsix з categories по source та curl Vault
- 2026-06-08 09:39: Виправив tooltip, переклад та групування в extension — items показуються одразу, rebuild vsix
- 2026-06-08 09:47: Виправив tooltip/переклад/іконку та опублікував .vsix на GitHub Releases — extension готовий до поширення
- 2026-06-08 10:21: Опублікував v0.2.0 з тематичними категоріями та автооновленням — фікс симлінків (238 items), нова іконка, 15 тем, 84 тести
- 2026-06-08 10:40: Виправив scanner симлінків + іконку на codicon — 238 items, тематичні категорії, реліз v0.2.1
- 2026-06-08 11:16: Зафіксував архітектуру Marketplace (гібрид, TreeView, build-скрипт) — визначено v1 scope, модулі та guards для install/uninstall
- 2026-06-08 11:22: Написав і закомітив спек Marketplace (гібрид+build-script+TreeView 5a) — виправлено 3 баги матчингу/хешів, дизайн затверджено
- 2026-06-08 11:36: Затвердив спек marketplace-design, написав план на 10 TDD-тасків — GitHub PAT прибрано з URL, додано у Vault
