# Claude Command Deck — Design Spec

> Дата: 2026-06-07
> Статус: затверджено (brainstorming) → готується план імплементації
> Тип: новий проєкт (VS Code extension)

## 1. Проблема

Працюючи з Claude Code у вбудованому терміналі VS Code, важко тримати в голові всі доступні команди та скіли (62 slash-команди + 117 скілів, плюс плагіни). Потрібна завжди-видима, клікабельна «шпаргалка», як **Termius Snippets**, але:

- сніпети підтягуються **автоматично** з конфігу Claude Code (не вводяться руками);
- описи показуються **обраною мовою** (українською за замовчуванням);
- клік по пункту **вставляє команду в активний термінал**.

## 2. Рішення (огляд)

VS Code-розширення з панеллю в боковому меню (Activity Bar). Панель показує дерево: групи **Commands** та **Skills**, кожен пункт — назва + перекладений опис. Клік вставляє рядок виклику (`/command` або `/plugin:skill`) у активний інтегрований термінал **без запуску** (без Enter), щоб користувач міг дописати аргументи.

Референс-механіка: [Termius Snippets](https://docs.termius.com/terminal/snippets) — бічна панель + клік для вставки/запуску. Відмінність на нашу користь: джерело сніпетів — автоматичне сканування `~/.claude/`.

## 3. Затверджені рішення

| Аспект | Рішення |
|--------|---------|
| Платформа | VS Code-розширення (головна і єдина платформа v1) |
| Поверхня | Панель у боковому меню (Activity Bar container + TreeView) |
| Вміст | Усі команди + усі скіли — і власні (`~/.claude/`), і з плагінів |
| Мова описів | Разовий переклад через OpenRouter → кеш у JSON → далі офлайн |
| Поведінка кліку | Вставити в термінал **без запуску** (курсор в кінці) |
| UI-підхід | Нативний VS Code TreeView (не webview) |

## 4. Архітектура

П'ять незалежних модулів + точка входу. Кожен має одну відповідальність і чіткий інтерфейс.

```
┌─ Scanner ──────┐   ┌─ Translator ───┐   ┌─ TreeProvider ─┐   ┌─ Terminal ─┐
│ читає ~/.claude│ → │ переклад 1 раз │ → │ малює панель   │ → │ sendText() │
│ commands+skills│   │ + кеш JSON     │   │ (TreeView)     │   │ в термінал │
│ + plugins      │   │ OpenRouter     │   │ групи, пошук   │   │ без Enter  │
└────────────────┘   └────────────────┘   └────────────────┘   └────────────┘
         └────────── extension.ts (вхід, реєстрація команд, file-watcher) ────┘
```

### 4.1 Scanner (`src/scanner.ts`)

Відповідальність: знайти всі команди/скіли та нормалізувати їх.

Джерела сканування (шляхи відносно `claudeHome`, дефолт `~/.claude`):
- Власні команди: `commands/*.md` → invocation = `/<filename>`
- Власні скіли: `skills/<name>/SKILL.md` або `skills/<name>.md` → invocation = `/<name>`
- Команди плагінів: `plugins/cache/*/<plugin>/**/commands/*.md` → invocation = `/<plugin>:<name>`
- Скіли плагінів: `plugins/cache/*/<plugin>/**/skills/<name>/` → invocation = `/<plugin>:<name>`

Видобуток на кожен пункт:
- `id` — стабільний (наприклад `type:source:name`)
- `type` — `command` | `skill`
- `name` — назва
- `invocation` — рядок, що вставляється в термінал
- `source` — `user` або назва плагіна
- `rawDescription` — з frontmatter поля `description:`; fallback — перший непорожній абзац без заголовка; останній fallback — назва файлу
- `contentHash` — хеш `rawDescription` (для інвалідції кешу перекладу)

Вихід: `CommandItem[]`.

### 4.2 Translator (`src/translator.ts`)

Відповідальність: перекласти описи обраною мовою з кешуванням.

- Вхід: `CommandItem[]` + код мови.
- Кеш: `translations/<lang>.json` у `context.globalStorageUri`, ключ = `id`, значення = `{ hash, text }`.
- Для пунктів, чий `contentHash` відсутній у кеші або не збігається → зібрати **один батч-запит** до OpenRouter, отримати короткі переклади.
- Зберегти кеш. Повернути `Map<id, translatedText>`.
- Ключ OpenRouter: виконати shell-команду з налаштування `openrouterKeyCommand` (дефолт `vault-get shared/openrouter_api_key`). Секрет ніде не зберігається в коді/налаштуваннях.
- Модель: налаштування `translationModel` (дефолт `google/gemini-2.5-flash`).
- Промпт: «переклади ці короткі технічні описи на <мову>, поверни JSON id→текст, збережи технічні назви/команди без перекладу».

### 4.3 TreeProvider (`src/treeProvider.ts`)

Відповідальність: малювати панель.

- Реалізує `vscode.TreeDataProvider<Node>`.
- Верхній рівень: дві групи, що згортаються — `Commands (N)` та `Skills (N)`.
- Лист: `TreeItem` де `label` = invocation/назва, `description` (сірий текст) = перекладений опис, `tooltip` = назва + повний опис (оригінал + переклад), `iconPath` = `ThemeIcon` (різні для command/skill), `command` = виклик `claudeCommandDeck.insert` з пунктом.
- Пошук: вбудований type-to-filter VS Code TreeView.
- Сортування: алфавітне в межах групи.

### 4.4 Terminal (`src/terminal.ts`)

Відповідальність: вставити команду в термінал.

- `insertCommand(item)`: взяти `vscode.window.activeTerminal`; якщо нема — створити новий і показати; виконати `terminal.sendText(item.invocation, false)` (`false` = без переводу рядка = без запуску); `terminal.show()`.

### 4.5 extension.ts (точка входу)

- `activate()`:
  - зареєструвати Activity Bar container + TreeView;
  - `scanner.scan()` → `translator.translate(items, lang)` → передати в TreeProvider;
  - зареєструвати команди:
    - `claudeCommandDeck.refresh` — пересканувати + доперекласти відсутнє
    - `claudeCommandDeck.insert` — обробник кліку
    - `claudeCommandDeck.setLanguage` — QuickPick мов → перемалювати
    - `claudeCommandDeck.copy` — копіювати рядок виклику (контекстне меню)
  - file-watcher на `commands/`, `skills/`, `plugins/` → авто-`refresh`.

### 4.6 Потік даних

```
activate → scan() → CommandItem[] → translate(items, lang) → TreeProvider.render
користувач клікає пункт → insert(item) → terminal.sendText(invocation, false)
зміна мови → setLanguage → translate(items, newLang) [кеш + доперекласти нове] → render
зміна файлів → watcher → refresh → scan → translate → render
```

## 5. Налаштування (VS Code settings)

| Ключ | Дефолт | Опис |
|------|--------|------|
| `claudeCommandDeck.language` | `uk` | Мова описів |
| `claudeCommandDeck.claudeHome` | `~/.claude` | Корінь конфігу Claude Code |
| `claudeCommandDeck.includePlugins` | `true` | Чи показувати команди/скіли з плагінів |
| `claudeCommandDeck.openrouterKeyCommand` | `vault-get shared/openrouter_api_key` | Команда, що друкує ключ OpenRouter |
| `claudeCommandDeck.translationModel` | `google/gemini-2.5-flash` | Модель перекладу |
| `claudeCommandDeck.clickAction` | `insert` | Поведінка кліку (на майбутнє: `insert`/`run`) |

## 6. Обробка помилок

| Ситуація | Поведінка |
|----------|-----------|
| OpenRouter/Vault недоступні при перекладі | Показати оригінальні (англ.) описи + тиха попередження в статусі. Панель повністю робоча. |
| Нема активного терміналу при кліку | Створити новий термінал і вставити туди. |
| Нема директорії `~/.claude` | Порожній стан з повідомленням «Claude config не знайдено». |
| `.md` без опису | Fallback: перший абзац → назва файлу. |
| Помилка парсингу окремого файлу | Пропустити файл, залогувати, не валити весь скан. |

## 7. Тестування

- **Юніт:**
  - Scanner: парсинг frontmatter `description:`, ланцюг fallback (абзац → назва), побудова `invocation` для плагінів (`/plugin:name`).
  - Translator: логіка кешу — незмінний `contentHash` → пропуск запиту; змінений → доперекласти.
- **Інтеграція:** фікстура-папка з імітацією `~/.claude` (кілька команд/скілів/плагінів) → `scan()` → перевірка нормалізованого списку.
- **Ручне:** клік вставляє правильний рядок у активний термінал без Enter.
- Тести використовують фікстуру, а не реальний `~/.claude`.

## 8. Стек і розміщення

- TypeScript + VS Code Extension API + esbuild (бандлінг).
- Без важких залежностей; OpenRouter через вбудований `fetch` (Node 25).
- Тести: `@vscode/test-electron` + Mocha (інтеграція), чисті юніти можна на Mocha/Vitest.
- Розташування проєкту: `/root/projects/claude-command-deck/`.
- Пакування: `vsce package` → `.vsix` → встановлення в VS Code.

## 9. Важливий нюанс розгортання

Розширення мусить стояти на **тому боці, де живуть `~/.claude` і `vault-get`** — тобто на VPS (remote extension host у VS Code Remote-SSH), а не на локальній машині. Інакше воно не знайде ні даних команд, ні ключа Vault.

## 10. Поза рамками v1 (YAGNI)

- Webview з картками/кольорами (нативний TreeView достатньо).
- Гарячі клавіші та власні bash-хелпери (нема авто-джерела описів).
- `insert + run` як дефолт (лишаємо `insert`; `clickAction` закладено на майбутнє).
- Фрази-тригери для скілів (v1 — універсально через `/skill-name`).
- Публікація в VS Code Marketplace (інструмент персональний).

## Джерела

- [Termius Snippets — docs](https://docs.termius.com/terminal/snippets)
