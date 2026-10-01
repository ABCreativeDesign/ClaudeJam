<p align="center">
  <img src="images/icon.png" width="96" height="96" alt="ClaudeJam icon">
</p>

# ClaudeJam

Work with your Claude Code agent directly inside FigJam. Think through ideas, map out flows, and build boards together in real time.

ClaudeJam is a FigJam plugin plus a small local server. Claude Code reads and writes the board you have open, so you can ask for a journey map, react to it, and keep shaping it together, all on the same canvas.

![A customer journey map built with ClaudeJam](images/customer-journey.png)

## What you'll need

- The **Figma desktop app** (FigJam plugins installed this way only run in the desktop app)
- **Claude Code** or **Cowork** (the Claude desktop app)
- **Node.js**

## Install

### 1. Get the plugin

Download this repository (green **Code** button, then **Download ZIP**) and unzip it somewhere permanent, or clone it:

```
git clone https://github.com/ABCreativeDesign/ClaudeJam.git
```

### 2. Add it to FigJam

Open any FigJam file in the Figma desktop app, then go to **Plugins → Development → Import plugin from manifest…** and choose `manifest.json` from the folder you just downloaded.

Figma doesn't list ClaudeJam in its Community, so it installs as a development plugin. That's why it lives under **Plugins → Development**; it works the same as any other plugin. Curious why it isn't listed? I wrote about it in my [ClaudeJam case study](https://aaronbutler.com/work/product-ux/ab-creative-design/claudejam/).

### 3. Connect Claude

Set this up once, for whichever Claude you use.

#### Claude Code

For the Code tab in the Claude desktop app, or Claude Code in a terminal or editor. In the project folder you use with Claude Code, run:

```
npx claudejam setup
```

This registers the ClaudeJam server with Claude Code for that project.

#### Cowork

For Cowork in the Claude desktop app:

1. In the Claude app, open **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`.
2. Add ClaudeJam under `mcpServers`. If the file is empty, it should look like this:

   ```json
   {
     "mcpServers": {
       "claudejam": { "command": "npx.cmd", "args": ["-y", "claudejam@latest", "--stdio"] }
     }
   }
   ```

   If it already has an `mcpServers` section, add just the `"claudejam": …` line inside it, with a comma after the entry before it. On macOS, use `npx` instead of `npx.cmd`.
3. Fully quit the Claude app (from the system tray on Windows, or the menu bar on macOS) and reopen it.

This also makes ClaudeJam available in the desktop app's Code tab for every project, so you don't need `npx claudejam setup` there as well. (It doesn't apply to Claude Code in a terminal, which uses the setup command above.)

## Use it

1. Open a FigJam file and run **Plugins → Development → ClaudeJam**. The plugin shows **Waiting** until Claude needs it.
2. In Claude Code or Cowork, ask Claude to work on the board. For example: *"I need to map out our onboarding flow but I'm not sure where to start. Can you help me think through it on the open FigJam board?"*
3. ClaudeJam connects the first time Claude uses it, usually within a few seconds, and the plugin switches to **Connected**.

ClaudeJam stays idle until then, so having it set up doesn't affect Claude sessions where you aren't using it.

## What it can build

Claude can create stickies, shapes, text, connectors, tables and code blocks, edit and arrange what's already there, and read the board back to check its work. It also knows tested layouts for common board types: brainstorms, competitive analyses, customer journey maps, kanban boards, mood boards, retrospectives, feature prioritization, timelines, and user persona maps.

| | |
|---|---|
| ![Brainstorm](images/brainstorming.png) | ![Competitive analysis](images/competitive-analysis.png) |
| ![User persona map](images/user-persona.png) | ![Login flow with MFA](images/auth-flow.png) |

## Good to know

- **One board at a time.** ClaudeJam works on the FigJam file the plugin is running in. To work on a different board, run the plugin there.
- **One Claude session at a time.** Only one Claude session can use ClaudeJam at once. If another session already has it, Claude will tell you; finish there, then try again.

## How it works

Claude Code talks to the ClaudeJam server over MCP. The server relays each command over a local WebSocket to the plugin, which makes the change on your canvas. Everything runs on your computer; nothing is sent anywhere else.

## Updating

The plugin and the server update separately.

**Plugin.** Download the latest version and replace the plugin folder (or run `git pull` if you cloned it). FigJam picks up the new files the next time you run the plugin.

**Server.** `npx` can reuse a copy it downloaded earlier, so the server doesn't always update on its own. What runs depends on how it's listed in your config:

| In your config | What runs |
|---|---|
| `claudejam` | Whatever copy npx already has, which may be out of date. |
| `claudejam@latest` | Checks npm each time Claude starts it. Always current, but starts a little slower and needs internet. |
| `claudejam@1.5.4` | Exactly that version, until you change it by hand. |

`npx claudejam setup` writes plain `claudejam`. To stay current, run the newest setup and then change that line in your project's `.mcp.json` to use `@latest` (`-y` lets npx download it without stopping to ask):

```
npx claudejam@latest setup
```

```json
"claudejam": { "command": "npx.cmd", "args": ["-y", "claudejam@latest", "--stdio"] }
```

The Claude desktop app setup under **Install** already uses `@latest`. After changing either config, restart Claude so the server reloads.

**Checking versions.** The plugin shows its version in the bottom-right corner of its panel. The plugin and server should be on the same version. If they differ, update both: download the latest plugin files, then restart Claude so the server reloads.

## License

[MIT](LICENSE) © 2026 Aaron Butler
