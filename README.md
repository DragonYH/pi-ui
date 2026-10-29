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
  <img src="https://img.dog/file/1779944542014_image.webp" alt="pi-ui preview" width="600">
</p>

---

## 📋 Features

pi-ui is a **pi-package** extension for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) that enhances your terminal with a custom status bar, rich theming, and improved editing experience.

- 🖥️ **Custom Status Bar** — Real-time footer display showing model name, thinking level, current working directory, git branch, context usage (%), token usage (↑input ↓output), and API cost — all in one glance
- 📚 **Readable Startup Resources** — Skills and extensions show item counts in lists that adapt to terminal width. Package names and installed npm/Git versions are aligned in separate columns; long names wrap when needed. Empty Context, Prompts, and Themes sections are hidden. Skills are listed by name.
- 🌀 **Native Startup Initialization Progress** — Run `pi` normally: its first screen animates a trail around the PI logo, pi-ui initializes first, and extensions appear progressively with measured session initialization times.
- 🟢 **Inline Version Updates** — When Pi or an npm extension has a newer release, its version changes to `v1.2.0->v1.2.1`, with the new version highlighted in green. Update checks run in the background; packages without a welcome-screen row use a compact notice.
- 🎨 **Catppuccin Dark Theme** — A meticulously crafted dark theme based on [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) with 64+ color mappings covering syntax highlighting, markdown rendering, thinking levels, UI components, and export backgrounds
- ✨ **Boxed Editor** — Unicode border editor (`╭─╮` style) replacing the default editor with elegant rounded corners
- ⏳ **Adaptive Working Indicator** — Animated spinner (󰪞→󰪥) at 120ms with **3-tone adaptive coloring** (green→yellow→red based on token recency). Shows cumulative output tokens and elapsed time for the current task (`Working... (↓ 1.2k tokens · 12s)`), including thinking and tool-call arguments.
- 📊 **Per-Message Usage Stats** — After each assistant reply, a **token/cost/duration summary** is displayed inline (`↑271 ↓50 · $0.0017 · 󰅐 4.1s`) with a matching-width separator line. Stats are displayed only — **automatically stripped from LLM context** to avoid polluting the conversation.
- 🧰 **Compact Tool Cards** — Rounded frames with execution state, recorded duration, and a four-row result preview. Shell output keeps its latest lines; successful file reads collapse to a hidden-line hint. Expand with your configured tool shortcut or a click; native diffs and extension tools share the same frame (Pi 1.4+).
- 💬 **Message Cards** — User messages occupy the right half and assistant replies the left, with rounded frames matching tool cards. Recorded local times appear at the user's bottom right and the assistant's bottom left; native Markdown, streaming and thinking controls are retained.
- 🔌 **Zero Dependencies** — Pure peer-dependency package; no additional npm packages required
- ⚡ **TypeScript Native** — Source code loaded directly via [jiti](https://github.com/unjs/jiti) — no build step needed
- 🧩 **Modular Architecture** — Focused modules cover the entry point, UI setup, footer, editor, welcome layout, installed package versions, update notices, and startup progress.

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

1. **On session start** — the custom UI initializes: footer, editor, spinner, message renderer
2. **On agent activity** (`agent_start` → `message_update` → `agent_end`) — the working indicator adapts its color in real-time, and the footer stats refresh
3. **On thinking level change** (`thinking_level_select`) — the thinking level indicator in the footer updates
4. **On session shutdown** (`session_shutdown`) — all working timers are cleaned up gracefully

### Startup Progress

Run `pi` normally after installation. No additional entry point or command alias is needed. Verified with Pi **1.4.0** in regular and fullscreen mode.

- The extension factory adapts the SDK lifecycle in the current process and mounts the animation in Pi's existing UI tree, so the native terminal's first frame already contains the PI animation.
- Only the `session_start` emission snapshot puts pi-ui first, installing the welcome screen, editor, and footer before other extensions initialize. Other extensions keep their relative order, and other event ordering stays unchanged.
- The trail moves every 80 ms. Each extension appears when its initialization begins, showing its current state and elapsed time.
- Timings accumulate all of an extension's `session_start` handlers. Extensions without a handler are identified as such and take 0 ms; earlier module imports and factory registration are excluded.
- Startup completion stops the animation and restores the welcome screen, keeping `(init 640 ms)` next to matched names or versions. Errors retain Pi's native reporting and also appear in the progress list.
- `/reload` and session changes start a fresh timing run, shutdown clears timers, narrow terminals stack the logo and list, and noninteractive modes skip the animation.

**Module import boundary:** Pi imports extensions and runs their factories before it creates the terminal UI and emits `session_start`. Its loader provides no event that hands the remaining import queue to a plugin, so initialization progress cannot reconstruct those earlier timings. This project does not rewrite installed Pi files or global settings and has no alternative startup command. Synchronous code can block animation until it returns control to the event loop.

Development checks: `npm test` exercises the real SDK emitter for ordering, timing, errors, and layout. `python3 tests/startup-pty.py` directly runs native `pi` with isolated fixtures inside this project, covering regular/fullscreen mode, `/reload`, initialization failures, and unchanged installed files/global settings. The integration depends on SDK UI and event implementation details; rerun these checks after upgrading Pi.

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

### Message Cards

User messages occupy the right half of the transcript, and assistant replies occupy the left half. Both use the same rounded frame as tool cards and reserve the scrollbar column. Long text wraps within its half of the screen.

```text
                                        ╭─ You ───────────────────────────────╮
                                        │ Please check the build.             │
                                        ╰────────────────────────── 12:34:56 ─╯

╭─ Assistant ─────────────────────────╮
│ The build passed.                   │
╰─ 12:34:58 ──────────────────────────╯
```

Times use `HH:mm:ss` in the local timezone from the original message timestamp, so restoring or reloading a conversation keeps them stable. Assistant cards update during streaming and retain native Markdown, code highlighting, links, thinking controls and error messages. Tool-call-only assistant messages do not add empty cards.

With Pi installed, `node tests/message-cards-runtime.mjs` verifies native message rendering, themes, resizing, streaming, thinking clicks and reload behavior; `python3 tests/tool-cards-pty.py` checks resumed messages and tool interaction in regular and fullscreen terminals.

### Tool Cards

Tool calls use the same rounded visual language as the editor:

```text
╭─ ✓ $ npm test ──────────────────────── done · 100 ms ─╮
│ … 16+ lines hidden                                    │
│ test 17 passed                                        │
│ test 18 passed                                        │
│ test 19 passed                                        │
│ test 20 passed                                        │
╰─────────────────────────────────────── ctrl+o expand ─╯
```

- The single top border distinguishes preparing, queued, running, `done`, and `fail` calls. Its right-hand area uses 13 terminal columns by default (`done · 100 ms`), with one outer space on each side, and aligns with `ctrl+o expand` below. `fold` keeps the expanded control within the same width. Long custom shortcuts enlarge both areas together; narrow cards prioritize the shortcut. All widths use terminal display columns. Missing durations use `—`; longer durations use compact units.
- Collapsed results show at most four visual rows, plus an omission hint in the body. Shell tools place the hint above their tail preview; other tools place it below their head preview. Successful `read` calls collapse to an omission hint. Errors retain a visible preview, and output truncation and full-log paths are shown separately.
- Use the configured tool expansion shortcut (normally **Ctrl+O**) or click the card to expand/collapse through Pi. Expanded built-in results retain native syntax highlighting; image display stays under Pi's control.
- The frame aligns with the input editor on the left and leaves one column clear on the right for the scrollbar. Tool names use a warm heading color, commands use cyan/teal, and paths use muted text; frame accents and output retain separate colors. The bottom border contains only the expansion control in the theme's lowest-contrast `dim` text color; total line counts are omitted.
- Native edit/diff previews and custom extension tools, including `skill_manage` and `todo`, use the same frame while retaining their content and controls. Interactive controls remain visible when collapsed.
- Completed output parsing is cached. Collapsed results only wrap their preview lines, and cards add no polling timers.

Cards require Pi's `registerToolRenderer` API, verified on **Pi 1.4.0**. Older versions retain their existing tool rendering. The renderer changes display only; tool definitions, execution, model context, and stored results are preserved.

Development checks: `npm test`, `npm run typecheck`, and `npm run lint`. With Pi installed, run `node tests/tool-cards-runtime.mjs` to exercise its real loader and tool components across themes, terminal widths, errors, and expansion; an ANSI preview is saved under `.pi/`.

### Working Indicator

The default "Working..." indicator is replaced with an animated **spinner sequence** (󰪞 󰪟 󰪠 󰪡 󰪢 󰪣 󰪤 󰪥) cycling every 120ms. The spinner features **3-tone adaptive coloring**:

| Tone  | Condition                        | Meaning         |
|-------|----------------------------------|-----------------|
| 🟢 Green | Last token received < 10s ago    | Active streaming |
| 🟡 Yellow | 10–30s since last token          | Thinking / idle |
| 🔴 Red    | > 30s since last token           | Possible stall  |

The indicator starts on `agent_start`, resets its color on incoming assistant stream events (`message_update`), and stops on `agent_end`.

Following the [pi-cc-extensions Working row](https://github.com/minuque/pi-cc-extensions), it also displays the current task's cumulative output tokens and elapsed time:

```text
Working... (↓ 1.2k tokens · 12s)
```

Text, thinking, and tool-call argument deltas contribute to a live token estimate. Provider-reported output usage corrects that estimate when available, including hidden reasoning; input and cached tokens are excluded. Counts continue across tool calls and reset for the next agent run. The timer includes model and tool waits, uses seconds/minutes/hours, and updates every 100ms. Before any output, only waits of at least 3 seconds show a timer. Shutdown, reload, and session replacement clear the working state and timers.

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
│   ├── index.ts              # Extension entry — registers events
│   ├── ui.ts                 # UI setup — footer, BoxedEditor, message renderer
│   ├── tool-cards.ts         # Compact tool frames, result previews, renderer compatibility
│   ├── working.ts            # Working row — output tokens, elapsed time, adaptive spinner
│   ├── footer.ts             # Footer rendering — model, usage, context, git branch
│   ├── editor.ts             # BoxedEditor component — Unicode border decoration
│   ├── welcome.ts            # Startup header — resource counts and adaptive lists
│   ├── resource-versions.ts  # Installed package versions from local metadata
│   ├── update-notices.ts     # Inline Pi/package updates with green target versions
│   └── startup/              # Native UI lifecycle integration, initialization timings, PI animation
├── tests/                    # Timing/layout tests and real-terminal verification
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
│  │  session_start      ──►  setupCustomUI()  ──►  footer  │  │
│  │                                editor                  │  │
│  │                                spinner                 │  │
│  │                                messageRenderer         │  │
│  │  agent_start        ──►  reset tokens, start timer      │  │
│  │  message_update     ──►  count tokens, update color     │  │
│  │  agent_end          ──►  stop timer, reset message      │  │
│  │                     ──►  rerenderFooter()              │  │
│  │  thinking_level_select ──►  rerenderFooter()            │  │
│  │  session_shutdown   ──►  dispose working state          │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Events Handled

| Event | Handler | Description |
|-------|---------|-------------|
| `session_start` | `setupCustomUI()` / working lifecycle | Registers footer, BoxedEditor, message renderer, and working UI context |
| `session_shutdown` | dispose working state | Cleans up timers and UI context on session end |
| `agent_start` | reset working state | Resets task token totals, starts the adaptive spinner and elapsed timer; re-renders footer |
| `message_start` | reset message estimate | Starts a fresh output-token estimate for each assistant response |
| `message_update` | count output tokens | Counts text/thinking/tool-call deltas, incorporates provider usage, and refreshes color and working text |
| `message_end` | finalize output usage / append usage stats | Adds assistant output usage to task totals; also displays existing per-message token/cost/duration stats |
| `agent_end` | stop working timer | Stops refreshing, restores the default working message, and re-renders footer |
| `thinking_level_select` | `rerenderFooter()` | Updates the thinking level label in the footer |
| `context` | strip usage stats | Filters out the usage stats text blocks before messages are sent to the LLM, keeping context clean |

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
