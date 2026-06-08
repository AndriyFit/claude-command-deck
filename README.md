# Claude Command Deck

VS Code sidebar listing all Claude Code commands and skills (yours + plugins),
organized into thematic categories (Ads, Frontend, Backend, Testing, Planning,
Code Review, …) with descriptions in your language. Click an item to insert its
invocation into the active terminal (without running it).

## Install

1. Download `claude-command-deck-<version>.vsix` from
   [Releases](https://github.com/AndriyFit/claude-command-deck/releases/latest).
2. VS Code → Extensions → `···` → **Install from VSIX...**
3. Reload the window.

After install the extension checks GitHub for newer releases on startup and
offers to update itself — no manual reinstall needed.

## Features

- All `/commands` and skills grouped into thematic categories
- Follows symlinked skills (linked from other projects)
- Click to insert the invocation into the active terminal
- Descriptions translated to your language via OpenRouter (cached)
- Auto-refreshes when `~/.claude/**/*.md` changes
- Self-update from GitHub releases

## Settings

- `claudeCommandDeck.language` — description & category language (default `uk`)
- `claudeCommandDeck.claudeHome` — Claude config root (default `~/.claude`)
- `claudeCommandDeck.includePlugins` — include plugin commands/skills (default `true`)
- `claudeCommandDeck.openrouterKeyCommand` — command that prints the OpenRouter key
- `claudeCommandDeck.translationModel` — OpenRouter model (default `google/gemini-2.5-flash`)
- `claudeCommandDeck.autoUpdate` — check GitHub releases on startup (default `true`)
- `claudeCommandDeck.catalogUrl` — catalog index URL or local path
- `claudeCommandDeck.marketplaceOriginFilter` — show all / official / custom

## Marketplace

The **Marketplace** panel lists an aggregated catalog of commands and skills (official + custom),
grouped by category with an origin badge. Click **Install** to drop the files into `~/.claude`
(the Deck refreshes automatically), **Update** when a newer version is available, or — on the
Deck panel — right-click a custom item → **Uninstall** to delete it (hard delete, with confirmation).
Plugin entries offer **Copy plugin install command** to paste into the Claude terminal.

Catalog source: `claudeCommandDeck.catalogUrl` (default: this repo's `catalog/index.json`),
regenerated weekly by a GitHub Action.

## Notes

Runs on the host where `~/.claude` lives (e.g. a VPS via Remote-SSH).
Translation needs an OpenRouter key (via `openrouterKeyCommand`); without it the
deck still works and shows original descriptions. Translations are cached, so
later loads are offline.
