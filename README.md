<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/pi--ui-🖥️-89B4FA?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBkPSJNMjAgM0wxIDM3aDM4eiIgZmlsbD0iIzg5QjRGQSIvPjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMxRTFDMkIiPuKZrzwvdGV4dD48L3N2Zz4=">
    <img src="https://img.shields.io/badge/pi--ui-🖥️-89B4FA?style=for-the-badge" alt="pi-ui" height="48">
  </picture>
</p>

<p align="center">
  <strong>Custom Terminal UI for <a href="https://github.com/earendil-works/pi-coding-agent">pi</a> Coding Agent</strong>
  <br>
  <sub>Beautiful themes, smart status bar, and enhanced message rendering</sub>
</p>

<p align="center">
  <a href="#-features"><img src="https://img.shields.io/badge/Features-📋-89B4FA?style=flat-square"></a>
  <a href="#-installation"><img src="https://img.shields.io/badge/Installation-📦-00B894?style=flat-square"></a>
  <a href="#-usage"><img src="https://img.shields.io/badge/Usage-🚀-0984E3?style=flat-square"></a>
  <a href="#-themes"><img src="https://img.shields.io/badge/Themes-🎨-FD79A8?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@rokiy/pi-ui"><img src="https://img.shields.io/npm/v/@rokiy/pi-ui?style=flat-square&color=CB3837"></a>
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/🇨🇳_中文-FADB4A?style=flat-square"></a>
</p>

<p align="center">
  <img src="https://img.dog/file/1779930836329_t8E4k5f5v3FuxK3PnlUJEvoS.webp" alt="pi-ui preview" width="600">
</p>

---

## 📋 Features

pi-ui is a **pi-package** extension for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) that enhances your terminal with a custom status bar, rich theming, and improved editing experience.

- 🖥️ **Custom Status Bar** — Real-time footer display showing model name, thinking level, current working directory, git branch, context usage (%), token usage (↑input ↓output), and API cost — all in one glance
- 🎨 **Catppuccin Dark Theme** — A meticulously crafted dark theme based on [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) with 64+ color mappings covering syntax highlighting, markdown rendering, thinking levels, UI components, and export backgrounds
- ✨ **Boxed Editor** — Unicode border editor (`╭─╮` style) replacing the default editor with elegant rounded corners
- ⏳ **Custom Loading Animation** — Animated spinner with 8 frames (󰪞→󰪥) replacing the default working indicator, cycling at 120ms intervals
- 💬 **Enhanced Message Rendering** — Custom assistant message renderer with optional expanded JSON details display
- 🔄 **Event-Driven Updates** — UI automatically refreshes on `session_start`, `model_select`, `thinking_level_select`, and `turn_end` events
- 🔌 **Zero Dependencies** — Pure peer-dependency package; no additional npm packages required
- ⚡ **TypeScript Native** — Source code loaded directly via [jiti](https://github.com/unjs/jiti) — no build step needed

## 📦 Installation

### Option 1: Install from npm (Recommended)

```bash
pi install npm:@rokiy/pi-ui
```

### Option 2: Install from GitHub

```bash
pi install git:github.com/DragonYH/pi-ui
```

### Option 3: Local Development

```bash
git clone https://github.com/DragonYH/pi-ui.git
cd pi-ui
pi install ./
```

### Verify Installation

Restart pi. You should see the custom footer appear at the bottom of your terminal, with the Catppuccin dark theme applied automatically.

## 🚀 Usage

Once installed, pi-ui works **completely automatically** — no configuration required:

1. **On session start** — the custom UI initializes: footer, editor, spinner, and theme are all applied
2. **On model switch** — the footer updates to show the new model name
3. **On thinking level change** — the thinking level indicator in the footer updates
4. **After each conversation** (`turn_end`) — token usage and cost statistics refresh automatically

### Status Bar Layout

The two-line footer displays at the bottom of your terminal:

```
󰏿 | 󰚩 provider/model 󰧑 thinking_level  cwd  branch 󰨊 context% 󰡓 ↑input ↓output 󰈁 cost
 | 󰲠 extension-status-1 󰲢 extension-status-2 ...
```

Each section uses Nerd Font icons and adaptive color theming. The footer gracefully **shrinks** to fit your terminal width — non-critical sections are dropped first, ensuring the most important info (cwd, branch) always stays visible.

### Editor

The default message editor is replaced with a **BoxedEditor** that uses Unicode box-drawing characters:

```
╭──────────────────────────────────────────╮
│  Your message content goes here...       │
╰──────────────────────────────────────────╯
```

### Working Indicator

The default "Working..." indicator is replaced with an animated **spinner sequence** (󰪞 󰪟 󰪠 󰪡 󰪢 󰪣 󰪤 󰪥), cycling every 120ms with alternating accent/muted colors.

## 🎨 Themes

| Theme | Description |
|-------|-------------|
| `catppuccin-dark` | Full Catppuccin Mocha dark theme — 64+ color mappings for syntax highlighting, markdown, UI components, thinking levels, and export backgrounds |

### Color Palette

The Catppuccin Dark theme maps 24 distinct palette variables across every visual layer:

| Category | Colors |
|----------|--------|
| **UI** | `primary` `secondary` `accent` `surface` `overlay` `text` `subtext0` `subtext1` |
| **Semantic** | `green` `red` `yellow` `blue` `mauve` `teal` `sky` `pink` `peach` `maroon` `lavender` `flamingo` |
| **Thinking Levels** | Each level gets a distinct color: `off`→subtext0, `minimal`→accent, `low`→blue, `medium`→teal, `high`→mauve, `xhigh`→red |
| **Export** | Page/card/info export backgrounds for sharing conversations (light `#11111b`, `#1e1e2e`, `#313244`) |

### Using Themes

pi-ui themes are automatically registered when installed. You can switch themes in pi:

```
/theme catppuccin-dark
```

See the [pi themes documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md) for more details.

## 🏗️ Project Structure

```
pi-ui/
├── src/
│   └── index.ts              # Extension entry point — footer, BoxedEditor, working indicator, message renderer
├── themes/
│   └── catppuccin-dark.json  # Catppuccin Mocha dark theme (64+ color mappings)
├── .github/
│   └── workflows/
│       └── release.yml       # CI/CD — auto-publishes to npm on version tag
├── LICENSE                   # MIT license
├── README.md                 # English documentation
├── README.zh-CN.md           # Chinese documentation
└── package.json              # Node.js and pi package manifest
```

## 🧠 How It Works

```
┌──────────────────────────────────────────────────────────────┐
│  pi Coding Agent                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ╭────────────────────────────────────────────╮        │  │
│  │  │  [Chat Interface with BoxedEditor]         │        │  │
│  │  ╰────────────────────────────────────────────╯        │  │
│  │                                                        │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  󰏿 | 󰚩 deepseek/deepseek-chat 󰧑 medium  my-project  │  │
│  │   main 󰨊 45% 󰓡 ↑1.2k ↓3.4k 󰈁 0.0012               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Extension: pi-ui ──────────────────────────────────┐  │
│  │  session_start  ──►  setupCustomUI()  ──►  footer    │  │
│  │                         editor                        │  │
│  │                         spinner                       │  │
│  │                         messageRenderer               │  │
│  │  model_select  ──►  rerenderFooter()                  │  │
│  │  thinking_level_select ──►  rerenderFooter()          │  │
│  │  turn_end      ──►  rerenderFooter()                  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Events Handled

- **`session_start`** — initializes custom UI components (footer, editor, working indicator, message renderer)
- **`model_select`** — re-renders footer when you switch models
- **`thinking_level_select`** — updates the thinking level badge in the footer
- **`turn_end`** — refreshes token usage and cost statistics after each conversation turn

## 🛠️ For Developers

### Development

Since pi-ui uses **zero dependencies** and TypeScript is loaded via pi's built-in jiti transformer, there's nothing to build. Just clone and install:

```bash
git clone https://github.com/DragonYH/pi-ui.git
cd pi-ui
pi install ./
```

### Publish Checklist

This project publishes through GitHub Actions when a version tag is pushed.

Before publishing, verify the package contents:

```bash
npm pack --dry-run
```

Then create and push a tag that matches `package.json`:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Before pushing the tag, configure npm Trusted Publishing for this package:

- Publisher: GitHub Actions
- Owner: `DragonYH`
- Repository: `pi-ui`
- Workflow: `release.yml`
- Environment: leave empty

### Adding a New Theme

Create a JSON theme file in `themes/` following the [pi theme schema](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json). It will be automatically discovered by pi at startup.

### Compatibility

- Node.js >= 20
- pi runtime loads TypeScript directly via jiti — no build step required
- Works with any model provider supported by pi

## 📄 License

[MIT](./LICENSE)

---

<p align="center">
  <sub>Built for the <a href="https://github.com/earendil-works/pi-coding-agent">pi coding agent</a> ecosystem</sub>
  <br>
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/🇨🇳_阅读中文版本-FFD700?style=for-the-badge"></a>
</p>
