# claude-command-deck — VS Code sidebar для Claude Code команд/скілів
> status: active · stack: TypeScript + VS Code Extension API + esbuild + Vitest · last_verified: 2026-08-06

## Стек (поточний)
- TypeScript, VS Code Extension API (`engines.vscode ^1.85.0`)
- esbuild (бандл `src/extension.ts` → `dist/extension.js`, external `vscode`)
- Vitest (юніт-тести чистих модулів)
- OpenRouter (переклад описів, модель за замовч. `google/gemini-2.5-flash`)
- `vault-get` / `vault-get shared/openrouter_api_key` (ключ береться shell-командою, ніде не хардкодиться)
- Пакування: `@vscode/vsce` → `.vsix`

## Архітектура (як працює ЗАРАЗ)
П'ять незалежних модулів + точка входу (`src/extension.ts`), кожен з однією відповідальністю:
- **scanner.ts** — сканує `~/.claude/{commands,skills,plugins/cache/*/*/*}` → нормалізований `CommandItem[]` (frontmatter `description:` → перший абзац → назва файлу як fallback)
- **translator.ts** — кешує переклад по `contentHash`; перекладає лише змінені/нові пункти одним батчем
- **openrouter.ts** — єдине місце, що торкається мережі/ключа; `fetchTranslations` + `makeKeyGetter` (виконує shell-команду з налаштування)
- **groups.ts / categorize.ts** — групування Commands/Skills та тематичні категорії
- **treeProvider.ts / terminal.ts** — тонкий vscode-шар: малює TreeView, клік → `terminal.sendText(invocation, false)` (вставка БЕЗ запуску)
- **Marketplace** (`catalog.ts`, `catalogFetch.ts`, `catalogTypes.ts`, `installer.ts`, `marketplaceProvider.ts`) — окрема панель: агрегований каталог (official+custom), install/update (atomic file-drop у `~/.claude`) / uninstall (hard delete, тільки user-items), copy plugin-install команда
- **updater.ts** — self-update: перевіряє GitHub Releases, качає `.vsix`, `workbench.extensions.installExtension`

Потік: `activate()` → `scan()` → `translate()` → `TreeProvider.render`; file-watcher на `~/.claude/**/*.md` → авто-refresh; клік по пункту → вставка в активний термінал.

## Точки входу / сервіси
- Немає бекенд-сервісу — чистий VS Code extension, виконується в extension host **на тому боці, де живуть `~/.claude` і `vault-get`** (VPS через Remote-SSH), інакше не знайде ні даних, ні ключа
- Каталог маркетплейсу: `catalog/index.json`, дефолтний URL `claudeCommandDeck.catalogUrl` = `https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/index.json`
- `.github/workflows/build-catalog.yml` — щотижня (Пн 06:00 UTC) + вручну, ганяє `scripts/build-catalog.mjs`, комітить оновлений `catalog/index.json` якщо змінився
- Публікація нових версій — GitHub Releases (tag `vX.Y.Z` + `.vsix` asset), `updater.ts` тягне звідти

## Живі рішення (чинні)
- 2026-06-08: Marketplace — гібридна модель (build-script генерує каталог + TreeView для install/update/uninstall), не webview
- 2026-06-08: Install — atomic file-drop у `~/.claude`; Uninstall — hard delete, лише для user-items (`deckItemUser`), щоб не чіпати plugin-файли
- 2026-06-08: OpenRouter ключ — тільки через `openrouterKeyCommand`/`openrouterApiKey` setting, ніколи не хардкодиться (fix 52a429a прибрав хардкоджений vault-ключ)
- 2026-06-08 (harden 28352ff): text-ext allowlist на install, блок remote→local file reads, guard на порожню copy-плагіна, приберано мертвий конфіг

## Деплой
- Локальна розробка: `npm install && npm run build && npm run typecheck && npm test`
- Пакування: `npm run package` → `claude-command-deck-<version>.vsix`
- Встановлення: VS Code → Extensions → `···` → **Install from VSIX...** (на хості без `code` CLI — через UI, не CLI)
- Автооновлення: розширення саме перевіряє GitHub Releases при старті (`claudeCommandDeck.autoUpdate`, дефолт `true`)
- Реліз: підняти `version` у `package.json`, закомітити, `npm run package`, створити GitHub Release з тегом `vX.Y.Z` і прикріпити `.vsix`

## Gotchas / жорсткі правила
- Розширення МУСИТЬ виконуватись на боці з `~/.claude` і `vault-get` (VPS Remote-SSH), не на локальній машині користувача
- Клік вставляє invocation **без Enter** (`sendText(invocation, false)`) — юзер сам дописує аргументи й запускає
- Переклад — одноразовий батч по `contentHash`; мережева/ключова помилка → тихий fallback на оригінальний опис, панель лишається робочою
- Uninstall дозволено тільки для `viewItem == deckItemUser` — захист від видалення plugin-файлів
- `scripts/build-catalog.mjs`: self-hosted `raw.githubusercontent.com/.../main/...` URL читається локально з диска (без мережі); інший ref (не `main`) або URL з декількома `/` у ref — читається некоректно (див. коментар NOTE у скрипті)
- `.vsix`-артефакти в `.gitignore` (`*.vsix`) — локальні build-артефакти, НЕ комітяться; поширення версій йде через GitHub Releases

## Глибше → docs/ · план → PLAN.md · задачі → TODO.md
- Дизайн v1: `docs/superpowers/specs/2026-06-07-claude-command-deck-design.md`
- План v1: `docs/superpowers/plans/2026-06-07-claude-command-deck.md`
- Дизайн Marketplace: `docs/superpowers/specs/2026-06-08-marketplace-design.md`
- План Marketplace: `docs/superpowers/plans/2026-06-08-marketplace.md`
