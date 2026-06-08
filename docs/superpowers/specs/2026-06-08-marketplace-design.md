# Claude Command Deck — Marketplace Design Spec

> Дата: 2026-06-08
> Статус: затверджено (brainstorming) → готується план імплементації
> Тип: розширення наявного проєкту (друга панель + інсталятор + каталог)
> Базовий проєкт: [2026-06-07-claude-command-deck-design.md](2026-06-07-claude-command-deck-design.md)

## 1. Проблема

Розширення вже показує **встановлені** команди/скіли з `~/.claude` і вставляє їх у термінал.
Чого бракує:

- немає способу **знайти й поставити** нові популярні скіли/команди — лише ті, що вже на диску;
- немає **оновлення** до свіжих версій популярних скілів/команд;
- немає способу **прибрати** зайвий (невикористовуваний) скіл/команду прямо з UI.

## 2. Рішення (огляд)

Додаємо другу панель **Marketplace** у той самий Activity Bar-контейнер. Вона показує
**каталог** доступних команд/скілів (агрегований з кількох джерел), з кнопками
**Install / Update**. Встановлення для окремих скілів/команд — це завантаження `.md`-файлів
у `~/.claude` (file-drop); наявний file-watcher одразу оновлює панель Deck — перезапуск
не потрібен. У панель Deck (встановлене) додаємо дію **Uninstall** для видалення.

**Розподіл ролей:** Marketplace = «додати/оновити», Deck = «використати/прибрати».

## 3. Затверджені рішення (brainstorming 2026-06-08)

| Аспект | Рішення |
|--------|---------|
| Джерело каталогу | **Гібрид-агрегатор**: власний репо + публічні (superpowers, ECC, official marketplace) |
| Як формується каталог | **Білд-скрипт + GitHub Action**: Node-скрипт сканує джерела → статичний `catalog/index.json` у репо; Action оновлює щотижня. Розширення читає лише готовий JSON |
| Обсяг v1 | **Тільки окремі скіли/команди** (file-drop install + delete). Плагіни показуються, але кнопка = «Copy `/plugin install`» (без авто-встановлення) |
| UI | **Нативний TreeView**, друга панель `Marketplace` у тому ж контейнері |
| Видалення | **Hard delete + модальне підтвердження**; тільки `source:user` айтеми; плагінні — дія вимкнена |
| Угруповання Marketplace | **5a**: верхній рівень — категорії (як у Deck); у кожного айтема **бейдж origin** (official/custom); фільтр «тільки офіційні / тільки кастомні» в заголовку панелі |

### Поза обсягом v1 (свідомо відкладено)
- Авто-встановлення плагінів (редагування marketplace-конфігу / виклик `claude` CLI) — фаза 2.
- Кошик / undo для видалення (обрано hard delete).
- Webview з картками — лишаємось на нативному TreeView.
- Авто-визначення «невикористаних» скілів (не трекаємо usage) — користувач сам вирішує, що зайве.

## 4. Архітектура

```
Catalog repo (AndriyFit/claude-command-deck)        VS Code Extension (на хості)
──────────────────────────────────────────         ───────────────────────────────
scripts/build-catalog.mjs                           ┌─ Deck view (наявна) ─────────┐
  сканує: superpowers, ECC, official mp, власні  →  │ встановлені CommandItem[]      │
  → пише catalog/index.json (CatalogEntry[])        │ ПКМ → Uninstall (user-only)   │
        │                                           └───────────────────────────────┘
        │  .github/workflows/build-catalog.yml      ┌─ Marketplace view (нова) ─────┐
        │  (cron щотижня + workflow_dispatch)       │ CatalogRow[] (entry + status) │
        ▼                                           │ Install / Update / Copy-plugin│
   raw index.json ────────── fetch ───────────────► │ групи=категорії, бейдж origin │
                                                    └───────────────────────────────┘
```

Принцип той самий, що в базовому проєкті: **pure-логіка** (`catalog`) без `vscode`/мережі
й покрита unit-тестами; **мережа** ізольована (`catalogFetch`), **vscode-шар** тонкий.

## 5. Компоненти

| Модуль | Тип | Відповідальність | Залежить від |
|--------|-----|------------------|--------------|
| `catalog.ts` | pure | Парс `index.json`; `computeStatus(entries, installed)` → `CatalogRow[]` | types |
| `catalogFetch.ts` | network | Тягне `index.json` (з кешем у globalStorage) + вміст окремих файлів | fetch |
| `installer.ts` | fs | `install(entry, fetchFile)` пише файли в `~/.claude`; `uninstall(item)` hard-delete; `installedHashes(home)` → Map; path-safety | scanner types |
| `marketplaceProvider.ts` | vscode | Друга TreeView: групи=категорії, бейдж origin, фільтр, inline Install/Update | catalog categorize |
| `scripts/build-catalog.mjs` | dev (Node) | Сканує джерела → `catalog/index.json`. **Не входить у vsix** | — |
| `.github/workflows/build-catalog.yml` | CI | Щотижневий cron + manual → run build-catalog → commit index.json | — |
| `extension.ts` (доповнення) | vscode | Реєстрація 2-ї view; команди `install/uninstall/updateItem/copyPluginInstall/refreshMarketplace` | усе вище |

Існуючі `scanner.ts`, `categorize.ts`, `groups.ts`, `treeProvider.ts`, `translator.ts`,
`terminal.ts` — переюзуються; `treeProvider.ts` отримує context-menu пункт **Uninstall**.

## 6. Дані

```ts
type Origin = 'official' | 'custom';
type EntryType = 'command' | 'skill' | 'plugin';

interface CatalogFile {
  path: string;   // відносний шлях призначення (для skill: 'SKILL.md', 'references/x.md')
  url: string;    // raw-URL для завантаження
}

interface CatalogEntry {
  id: string;            // "skill:superpowers:brainstorming" — стабільний ключ запису каталогу
  type: EntryType;
  name: string;          // bare name → '/name' або skill-папка (== install identity)
  category: string;      // id категорії з categorize.ts
  origin: Origin;        // бейдж
  source: string;        // людська мітка джерела: "superpowers" | "ECC" | "yours"
  title: string;
  description: string;
  version: string;       // ДИСПЛЕЙ-рядок ("1.2.0" або короткий хеш) — лише для показу
  hash: string;          // sha повного вмісту всіх files (для детекції оновлень)
  files: CatalogFile[];  // для plugin — порожньо
  pluginInstall?: string; // для plugin: рядок команди для копіювання
}

type InstallState = 'not_installed' | 'installed' | 'update_available';
interface CatalogRow { entry: CatalogEntry; state: InstallState; }
```

`index.json` = `{ "version": 1, "generatedAt": "...", "entries": CatalogEntry[] }`.

**Identity та матчинг (важливо):** «що встановлено» визначає **ім'я на файловій системі**,
а не повний `id`. Коли entry з джерела `superpowers` ставиться file-drop'ом, файл лягає в
`~/.claude/skills/<name>/` і скан бачить його як `source:user` — тож повний `id` НЕ збігається.
Тому матчинг каталог↔встановлене йде по ключу **`${type}:${name}`** (ФС і так гарантує
унікальність імені скіла/команди). Детекція оновлень — по **повному хешу файлів**, а не по
`CommandItem.contentHash` (той хешує лише опис, для кешу перекладу).

## 7. Потоки

**Завантаження Marketplace:**
```
entries     = catalogFetch.fetchIndex(catalogUrl)              // + кеш на фейл
installedH  = installer.installedHashes(~/.claude)             // Map `${type}:${name}` → fileHash
rows        = catalog.computeStatus(entries, installedH)        // pure: join по type:name
marketplaceProvider.setData(rows, lang, originFilter)
```
`computeStatus`: для кожного entry — якщо ключа `type:name` нема в `installedH` → `not_installed`;
якщо є і хеш збігається з `entry.hash` → `installed`; якщо є, але хеш інший → `update_available`.
`installer.installedHashes` (fs) читає файли під `~/.claude/commands|skills` і рахує sha повного
вмісту — pure-логіка `computeStatus` лишається тестованою без диска.

**Install (команда/скіл):**
```
guard: entry.type !== 'plugin'
dest = installer.resolveDest(entry.files[i].path, type, name)  // path-safety
для кожного file: content = catalogFetch.fetchFile(url); write temp → move до dest
watcher авто-оновлює Deck; refreshMarketplace оновлює статус
```

**Install (plugin):** `copyPluginInstall` → у буфер копіюється `entry.pluginInstall`; тост
«Встав у Claude-термінал».

**Update:** те саме, що Install (перезапис файлів новою версією).

**Uninstall (з Deck):**
```
guard: item.source === 'user'  (шлях під ~/.claude/commands|skills, не plugins/cache)
модальне підтвердження зі шляхом
hard delete: команда → unlink файл; скіл → rm -rf папки скіла
refresh Deck + Marketplace
```

## 8. Обробка помилок і безпека

> Каталог — **зовнішні дані** → не довіряємо (prompt-defense baseline).

- **Path-traversal guard (критично):** запис ДОЗВОЛЕНО лише в межах `~/.claude/commands`
  та `~/.claude/skills`. Відкидаємо абсолютні шляхи, `..`, порожні/дивні імена; нормалізуємо
  й перевіряємо, що фінальний шлях лишається під дозволеним коренем. Качаємо лише текст (`.md`
  та відомі текстові розширення).
- **Uninstall guard:** тільки `source:user`; для плагінних айтемів дія вимкнена через `when`-клоз
  + перевірка в рантаймі.
- **Атомарний install:** пишемо в temp-файл, потім `rename` у призначення → нема пів-скілів.
- **Fetch-фейл index:** тост + лишаємо останній кешований `index.json`.
- **Fetch-фейл файлу під час install:** скасувати install цього entry, прибрати частково
  завантажене, показати тост; інші entry не чіпати.
- **Hard delete** — лише після модального підтвердження зі шляхом (без кошика — рішення користувача).

## 9. Конфігурація (нові ключі)

| Ключ | Default | Призначення |
|------|---------|-------------|
| `claudeCommandDeck.catalogUrl` | raw-URL `catalog/index.json` твого репо | звідки тягнути каталог |
| `claudeCommandDeck.catalogRefreshHours` | `24` | як часто перечитувати index (кеш) |
| `claudeCommandDeck.marketplaceOriginFilter` | `all` | `all` / `official` / `custom` (керується кнопкою) |

## 10. Тестування

Pure-логіка покривається Vitest (як у базовому проєкті):

- **`catalog.computeStatus`**: not_installed (нема ключа) / installed (хеш збігається) /
  update_available (хеш інший); join по `${type}:${name}`; ігнор невідомих полів entry.
- **`installer`** (temp dir): `resolveDest` повертає коректний шлях для command/skill;
  **відкидає** traversal (`../`, абсолютні, дивні імена); install пише файли; uninstall видаляє
  тільки user-айтем і відмовляє для plugin-шляху.
- **`build-catalog.mjs`**: лёгкий smoke (формат запису валідний) — це dev-скрипт, без повного покриття.

vscode-шар (`marketplaceProvider`, доповнення `extension.ts`/`treeProvider.ts`) — верифікація
запуском розширення (F5), як і в базовому проєкті.

## 11. Поетапність

- **Фаза 1 (цей спек):** каталог (build-script + Action), `catalog`/`catalogFetch`/`installer`,
  Marketplace TreeView з Install/Update/Copy-plugin, Uninstall у Deck, конфіг, тести.
- **Фаза 2 (пізніше):** авто-встановлення плагінів; можливо webview; usage-сигнали для «невикористаних».

## 12. Критерії готовності v1

- [ ] Marketplace-панель показує агрегований каталог, згрупований по категоріях, з бейджем origin і фільтром.
- [ ] Клік Install на скілі/команді кладе файл(и) в `~/.claude`; Deck оновлюється автоматично.
- [ ] Update перезаписує застарілий айтем; статус перераховується.
- [ ] Plugin-айтем дає «Copy `/plugin install`» (без авто-встановлення).
- [ ] Uninstall у Deck видаляє тільки user-айтем після підтвердження; плагінні захищені.
- [ ] Path-traversal і не-текстові файли відхиляються (є тести).
- [ ] `build-catalog.mjs` генерує валідний `index.json`; GitHub Action його оновлює.
- [ ] Unit-тести зелені, typecheck чистий, vsix пакетується.
