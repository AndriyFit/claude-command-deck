# Claude Command Deck

VS Code sidebar listing all Claude Code commands and skills (yours + plugins) with
descriptions in your language. Click an item to insert its invocation into the active
terminal (without running it).

## Settings
- `claudeCommandDeck.language` — description language (default `uk`)
- `claudeCommandDeck.claudeHome` — Claude config root (default `~/.claude`)
- `claudeCommandDeck.includePlugins` — include plugin commands/skills (default `true`)
- `claudeCommandDeck.openrouterKeyCommand` — command that prints the OpenRouter key
- `claudeCommandDeck.translationModel` — OpenRouter model (default `google/gemini-2.5-flash`)

## Notes
Must run on the host where `~/.claude` and `vault-get` live (e.g. VPS via Remote-SSH).
Translations are fetched once via OpenRouter and cached; subsequent loads are offline.
