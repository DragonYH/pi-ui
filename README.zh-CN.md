<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/pi--ui-🖥️-89B4FA?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cGF0aCBkPSJNMjAgM0wxIDM3aDM4eiIgZmlsbD0iIzg5QjRGQSIvPjx0ZXh0IHg9IjIwIiB5PSIyNSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNCIgZm9udC13ZWlnaHQ9ImJvbGQiIGZpbGw9IiMxRTFDMkIiPuKZrzwvdGV4dD48L3N2Zz4=">
    <img src="https://img.shields.io/badge/pi--ui-🖥️-89B4FA?style=for-the-badge" alt="pi-ui" height="48">
  </picture>
</p>

<p align="center">
  <strong>pi Coding Agent 自定义终端 UI</strong>
  <br>
  <sub>精美的主题、智能状态栏、增强的消息渲染</sub>
</p>

<p align="center">
  <a href="#-功能特性"><img src="https://img.shields.io/badge/功能特性-📋-89B4FA?style=flat-square"></a>
  <a href="#-安装"><img src="https://img.shields.io/badge/安装-📦-00B894?style=flat-square"></a>
  <a href="#-使用"><img src="https://img.shields.io/badge/使用-🚀-0984E3?style=flat-square"></a>
  <a href="#-主题"><img src="https://img.shields.io/badge/主题-🎨-FD79A8?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@rokiy/pi-ui"><img src="https://img.shields.io/npm/v/@rokiy/pi-ui?style=flat-square&color=CB3837"></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/🇬🇧_English-6C5CE7?style=flat-square"></a>
</p>

<p align="center">
  <img src="https://img.dog/file/1779944542014_image.webp" alt="pi-ui 预览" width="600">
</p>

---

## 📋 功能特性

pi-ui 是一个 **pi-package** 扩展，为 [pi coding agent](https://github.com/earendil-works/pi-coding-agent) 提供自定义终端 UI，包括状态栏、主题和编辑器增强。

- 🖥️ **自定义状态栏** — 底部实时显示模型名称、思考级别、当前工作目录、Git 分支、上下文使用率（%）、Token 用量（↑输入 ↓输出）和 API 费用，一目了然
- 📚 **清晰的启动资源列表** — 技能和扩展显示数量，并根据终端宽度自动分列；扩展包名与本机安装的 npm/Git 版本对齐显示，长名称在窄屏下自动换行。隐藏空的 Context、Prompts 和 Themes 区段；技能按名称显示。
- 🌀 **原生启动初始化进度** — 直接运行 `pi`，首屏显示围绕 PI 标志的动画；pi-ui 优先初始化，右侧逐项展示扩展的真实会话初始化耗时。
- 🟢 **行内版本更新提示** — Pi 或 npm 扩展有新版本时，原版本位置显示 `v1.2.0->v1.2.1`，新版本号以绿色高亮。更新检查在后台进行；不在欢迎屏列表中的包使用简洁的单行提示。
- 🎨 **Catppuccin 深色主题** — 基于 [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) 精心调制的深色主题，包含 64+ 颜色映射，覆盖语法高亮、Markdown 渲染、思考级别、UI 组件和导出背景
- ✨ **边框编辑器（Boxed Editor）** — 使用 Unicode 边框字符（`╭─╮` 风格）替代默认编辑器，呈现优雅圆角效果
- ⏳ **自适应工作指示器** — 旋转动画每 120ms 循环，具有**三色调自适应着色**：活跃 token 流时为绿色，10s 无响应变为黄色，30s 无响应变为红色。同时显示当前任务累计输出 token 与耗时，例如 `Working... (↓ 1.2k tokens · 12s)`，包含思考内容和工具调用参数。
- 🧰 **紧凑工具卡片** — 圆角细边框展示执行状态、实际耗时和最多四行的结果预览。Shell 优先显示末尾日志，成功读取文件时收起为隐藏行数提示。通过已配置的快捷键或点击展开；原生差异预览和扩展工具使用统一边框（Pi 1.4+）。
- 💬 **左右消息卡片** — 用户消息位于右半屏，模型回复位于左半屏，沿用工具卡片的圆角边框。用户消息右下角、模型回复左下角显示记录中的本地时间；保留原生 Markdown、流式输出和思考块交互。
- 🔄 **事件驱动更新** — UI 在 `session_start` 自动初始化，追踪 agent 生命周期（`agent_start`/`message_update`/`agent_end`），并在 `thinking_level_select` 和 `session_shutdown` 时重新渲染
- 🔌 **零依赖** — 纯对等依赖包，无需额外安装 npm 依赖
- ⚡ **原生 TypeScript** — 源码通过 [jiti](https://github.com/unjs/jiti) 直接加载运行，无需编译步骤
- 🧩 **模块化架构** — 各模块分别负责扩展入口、UI 设置、状态栏、编辑器、欢迎屏布局、已安装包版本读取、更新提示和启动进度。

## 📦 安装

### 方式一：通过 npm 安装（推荐）

```bash
pi install npm:@rokiy/pi-ui
```

### 方式二：通过 GitHub 安装

```bash
pi install git:github.com/DragonYH/pi-ui
```

### 方式三：本地开发安装

```bash
git clone https://github.com/DragonYH/pi-ui.git
cd pi-ui
pi install ./
```

### 验证安装

重启 pi，你应该能在终端底部看到自定义状态栏，Catppuccin 深色主题已自动生效。

## 🚀 使用

安装后 pi-ui **完全自动运行**，无需任何配置：

1. **会话启动** — 自定义 UI 自动初始化：状态栏、编辑器、加载动画、消息渲染器全部就绪
2. **Agent 活动**（`agent_start` → `message_update` → `agent_end`）— 工作指示器实时自适应着色，状态栏统计刷新
3. **切换思考级别**（`thinking_level_select`）— 状态栏中的思考级别指示器同步更新
4. **会话关闭**（`session_shutdown`）— 所有计时器优雅清理

### 启动加载进度

安装后照常运行 `pi`，无需额外入口或命令别名。已在 Pi **1.4.0** 的普通模式和全屏模式验证。

- pi-ui 在自己的扩展工厂中接入当前进程内的 SDK 生命周期，将动画组件放入 Pi 已有的 UI 树；原生终端的第一帧即可显示 PI 动画。
- 只在 `session_start` 的事件快照中将 pi-ui 提到首位，先安装欢迎屏、编辑器和状态栏，再初始化其他扩展。其余扩展保留相对顺序，其他事件的处理顺序保持原样。
- PI 标志周围每 80 ms 更新一帧动画；右侧在各扩展开始初始化时逐项出现，显示运行状态和实时耗时。
- 计时累计该扩展全部 `session_start` 处理器的实际执行时间。没有处理器的扩展标为无初始化处理器，耗时为 0；不将已经完成的源码导入或注册计入初始化耗时。
- 完成后停止动画，恢复欢迎屏，在匹配到的扩展名称或版本后保留 `(init 640 ms)`。扩展错误保留原生报告方式，列表也显示失败项。
- `/reload` 和会话切换会重新计时；关闭会话时清理计时器。窄终端使用上下布局，非交互模式跳过动画。

**源码导入阶段的边界：** Pi 先导入扩展并执行注册工厂，再创建终端界面和派发 `session_start`。当前加载器没有提供让插件接管剩余导入队列的事件，因此这部分耗时不能由此初始化进度追溯得到。本项目不改写 Pi 安装文件或全局配置，不提供其他启动方式。同步代码占用主线程时，动画会在事件循环恢复后继续更新。

开发验证：`npm test` 使用真实 SDK 事件派发器检查顺序、计时、错误和布局；`python3 tests/startup-pty.py` 直接调用原生 `pi`，用项目内隔离 fixture 验证普通/全屏启动、`/reload` 和初始化失败，并核对安装文件与全局配置未改变。接入依赖 SDK 的 UI 和事件实现，升级 Pi 后应重新运行这些检查。

### 状态栏布局

两行状态栏显示在终端底部：

```
󰏿 | 󰚩 提供商/模型 󰧑 思考级别  目录  分支 󰨊 上下文% 󰡓 ↑输入 ↓输出 󰈁 费用
 | 󰲠 扩展状态-1 󰲢 扩展状态-2 ...
```

每个部分使用 Nerd Font 图标，配合主题自适应配色。状态栏会自动**收缩**以适应终端宽度——非关键部分优先隐藏，确保最重要的信息（当前目录、分支）始终可见。

### 编辑器

默认消息编辑器被替换为使用 Unicode 方框绘制字符的 **BoxedEditor**：

```
╭──────────────────────────────────────────╮
│  在此输入消息内容...                      │
╰──────────────────────────────────────────╯
```

### 消息卡片

用户消息限制在右半屏，模型回复限制在左半屏，采用圆角边框，继续预留滚动条所在的一列。用户消息的边框和标题使用主题中的紫色（`thinkingHigh`），模型回复使用绿色（`success`），工具卡片使用强调色（`borderAccent`），便于区分。长文本在各自的半屏内自动换行。

```text
                                        ╭─ You ───────────────────────────────╮
                                        │ Please check the build.             │
                                        ╰────────────────────────── 12:34:56 ─╯

╭─ Assistant ─────────────────────────╮
│ The build passed.                   │
╰─ 12:34:58 ──────────────────────────╯
```

用户消息的发送时间位于右下角，模型回复的输出时间位于左下角，格式为本地时区的 `HH:mm:ss`，取自原始消息时间戳，恢复会话或重新加载后保持一致。模型卡片随流式输出更新，保留原生 Markdown、代码高亮、链接、思考块交互和错误提示；仅包含工具调用的模型消息不显示空卡片。

本机安装 Pi 后，运行 `node tests/message-cards-runtime.mjs` 验证消息渲染、主题、缩放、流式输出、思考块点击和重载；运行 `python3 tests/tool-cards-pty.py` 验证普通和全屏终端里的历史消息卡片与工具交互。

### 工具调用卡片

工具调用与编辑器使用统一的圆角风格：

```text
╭─ ✓ $ npm test ──────────────────────── done · 100 ms ─╮
│ … 16+ lines hidden                                    │
│ test 17 passed                                        │
│ test 18 passed                                        │
│ test 19 passed                                        │
│ test 20 passed                                        │
╰─────────────────────────────────────── ctrl+o expand ─╯
```

- 标题嵌在单行圆角顶边中，区分参数准备、排队、执行、`done` 和 `fail`。状态／耗时区默认固定 13 个终端显示列（`done · 100 ms`），左右各一格，与下方的 `ctrl+o expand` 左右对齐；展开后使用较短的 `fold` 保持宽度。较长的自定义快捷键会同步加宽上下区域，窄终端优先保留快捷键。所有宽度按等宽字体的实际显示列数计算，缺失耗时显示 `—`，长耗时使用紧凑单位。
- 折叠结果最多显示四行可见内容，隐藏行数提示放在正文中：Shell 放在末尾日志预览的上方，其他工具放在开头预览的下方；成功的 `read` 调用折叠为隐藏提示。错误仍显示预览，输出截断和完整日志路径另行展示。
- 使用当前配置的工具展开快捷键（通常为 **Ctrl+O**），或点击卡片，通过 Pi 展开/收起。展开后的内置结果保留原生语法高亮，图片仍由 Pi 管理。
- 卡片左侧顶格，与输入框对齐；右侧预留一列，避免与滚动条重合。工具名用暖色加粗，命令用青绿／青色，路径参数用灰色，与边框和输出区分层。右下角仅保留唯一一处展开／收起提示，文字使用主题中对比度最低的 `dim` 色，不显示总行数。
- 原生编辑差异预览及 `skill_manage`、`todo` 等扩展工具使用统一卡片，同时保留专用内容和交互能力。折叠时不裁剪交互控件。
- 缓存已完成结果的解析内容，折叠时只排版预览行，卡片不额外启动轮询计时器。

卡片依赖 Pi 的 `registerToolRenderer` 接口，已在 **Pi 1.4.0** 验证；旧版本继续使用原有工具展示。改动仅影响显示，工具定义、执行、模型上下文和已保存结果保持原样。

开发验证：`npm test`、`npm run typecheck` 和 `npm run lint`。本机安装 Pi 后，可运行 `node tests/tool-cards-runtime.mjs`，通过真实加载器和工具组件检查主题、终端宽度、错误及展开/收起；ANSI 预览保存在 `.pi/` 下。

### 工作指示器

默认的 "Working..." 提示被替换为**旋转动画序列**（󰪞 󰪟 󰪠 󰪡 󰪢 󰪣 󰪤 󰪥），每 120ms 循环。指示器具有**三色调自适应着色**：

| 色调 | 条件 | 含义 |
|------|------|------|
| 🟢 绿色 | 最后收到 token < 10 秒 | 活跃流式输出 |
| 🟡 黄色 | 10–30 秒无新 token | 思考中 / 空闲 |
| 🔴 红色 | > 30 秒无新 token | 可能卡住 |

指示器在 `agent_start` 时启动，每个助手流式事件（`message_update`）重置颜色计时，`agent_end` 时停止。

参考 [pi-cc-extensions 的 Working 行](https://github.com/minuque/pi-cc-extensions)，在提示后显示当前任务累计输出 token 和耗时：

```text
Working... (↓ 1.2k tokens · 12s)
```

流式输出时根据正文、思考内容和工具调用参数估算 token，收到服务商报告的输出用量后校准，并计入隐藏思考用量；不包含输入或缓存 token。工具执行后的下一轮回复继续累计，下一次 agent 任务重新计数。耗时包含模型等待和工具执行时间，每 100ms 刷新，自动使用秒、分、小时；尚无输出时，等待满 3 秒才显示计时。关闭、重载或切换会话时清理状态和计时器。

## 🎨 主题

| 主题 | 描述 |
|-------|-------------|
| `catppuccin-dark` | 完整的 Catppuccin Mocha 深色主题 — 64+ 颜色映射，覆盖语法高亮、Markdown、UI 组件、思考级别和导出背景 |

### 颜色调色板

Catppuccin Dark 主题将 24 种不同的调色板变量映射到各个视觉层面：

| 分类 | 颜色 |
|----------|--------|
| **UI** | `primary` `secondary` `accent` `surface` `overlay` `text` `subtext0` `subtext1` |
| **语义** | `green` `red` `yellow` `blue` `mauve` `teal` `sky` `pink` `peach` `maroon` `lavender` `flamingo` |
| **思考级别** | 每个级别有独立的颜色：`off`→subtext0, `minimal`→accent, `low`→blue, `medium`→teal, `high`→mauve, `xhigh`→red |
| **导出** | 页面/卡片/信息导出背景，用于分享对话（`#11111b`, `#1e1e2e`, `#313244`） |

### 使用主题

pi-ui 安装后主题自动注册。你可以在 pi 中切换主题：

```
/theme catppuccin-dark
```

更多详情请参阅 [pi 主题文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md)。

## 🏗️ 项目结构

```
pi-ui/
├── src/
│   ├── index.ts              # 扩展入口 — 注册事件
│   ├── ui.ts                 # UI 设置 — 状态栏、BoxedEditor、消息渲染器
│   ├── tool-cards.ts         # 工具卡片 — 紧凑边框、结果预览和渲染器兼容
│   ├── working.ts            # Working 行 — 输出 token、耗时和自适应旋转动画
│   ├── footer.ts             # 状态栏渲染 — 模型、用量、上下文、Git 分支
│   ├── editor.ts             # BoxedEditor 组件 — Unicode 边框装饰
│   ├── welcome.ts            # 启动欢迎屏 — 资源数量与自适应列表
│   ├── resource-versions.ts  # 从本机元数据读取已安装包版本
│   ├── update-notices.ts     # Pi 与扩展行内更新提示，新版本绿色高亮
│   └── startup/              # 原生 UI 生命周期接入、初始化计时和 PI 动画
├── tests/                    # 启动计时/布局测试及真实终端验证
├── themes/
│   └── catppuccin-dark.json  # Catppuccin Mocha 深色主题（64+ 颜色映射）
├── .github/
│   └── workflows/
│       └── release.yml       # CI/CD — 推送版本标签时自动发布到 npm
├── LICENSE                   # MIT 许可证
├── README.md                 # 英文文档
├── README.zh-CN.md           # 中文文档
└── package.json              # Node.js 和 pi 包清单
```

## 🧠 工作原理

```
┌──────────────────────────────────────────────────────────────┐
│  pi Coding Agent                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  │  ╭────────────────────────────────────────────╮        │  │
│  │  │  [带 BoxedEditor 的聊天界面]               │        │  │
│  │  ╰────────────────────────────────────────────╯        │  │
│  │                                                        │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  󰏿 | 󰚩 deepseek/deepseek-chat 󰧑 medium  my-project  │  │
│  │   main 󰨊 45% 󰡓 ↑1.2k ↓3.4k 󰈁 0.0012               │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌── Extension: pi-ui ───────────────────────────────────┐  │
│  │  session_start      ──►  setupCustomUI()  ──►  状态栏    │  │
│  │                               编辑器                    │  │
│  │                               工作指示器                │  │
│  │                               消息渲染器                │  │
│  │  agent_start        ──►  重置 token，启动计时          │  │
│  │  message_update     ──►  累计 token，更新颜色          │  │
│  │  agent_end          ──►  停止计时，恢复默认提示        │  │
│  │                     ──►  rerenderFooter()              │  │
│  │  thinking_level_select ──►  rerenderFooter()           │  │
│  │  session_shutdown   ──►  清理工作状态和计时器          │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 监听事件

| 事件 | 处理函数 | 说明 |
|------|----------|------|
| `session_start` | `setupCustomUI()` / 工作状态生命周期 | 注册状态栏、BoxedEditor、消息渲染器和工作指示器上下文 |
| `session_shutdown` | 清理工作状态 | 会话结束时清理计时器和 UI 上下文 |
| `agent_start` | 重置工作状态 | 重置任务 token，启动自适应旋转动画和计时；刷新状态栏 |
| `message_start` | 重置消息估算 | 为每条助手回复开始新的输出 token 估算 |
| `message_update` | 累计输出 token | 统计正文、思考和工具参数增量，合并服务商用量，更新颜色与提示 |
| `message_end` | 校准输出用量 / 追加用量统计 | 将助手输出用量计入任务累计值；同时保留现有的逐条 token/费用/耗时展示 |
| `agent_end` | 停止工作计时 | 停止刷新，恢复默认工作提示，刷新状态栏 |
| `thinking_level_select` | `rerenderFooter()` | 更新状态栏中的思考级别标签 |
| `context` | 剥离用量统计 | 在消息发送给 LLM 前过滤掉用量统计文本块，保持上下文干净 |

## 🛠️ 开发者指南

### 开发

由于 pi-ui **零依赖**，且 TypeScript 源码通过 pi 内置的 jiti 加载器直接运行，无需构建。只需克隆并安装：

```bash
git clone https://github.com/DragonYH/pi-ui.git
cd pi-ui
pi install ./
```

### 发布清单

本项目通过 GitHub Actions 自动发布，推送版本标签时触发。

发布前，先验证包内容：

```bash
npm pack --dry-run
```

然后创建并推送与 `package.json` 匹配的标签：

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

推送标签前，需在 npm 上为此包配置 Trusted Publishing：

- 发布方：GitHub Actions
- 拥有者：`DragonYH`
- 仓库：`pi-ui`
- 工作流：`release.yml`
- 环境：留空

### 添加新主题

在 `themes/` 目录下创建 JSON 主题文件，遵循 [pi 主题 schema](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json)。pi 启动时会自动发现该文件。

### 兼容性

- Node.js >= 20
- pi 运行时通过 jiti 直接加载 TypeScript，无需编译步骤
- 兼容 pi 支持的所有模型提供商

## 📄 许可证

[MIT](./LICENSE)

---

<p align="center">
  <sub>为 <a href="https://github.com/earendil-works/pi-coding-agent">pi coding agent</a> 生态构建</sub>
  <br>
  <a href="./README.md"><img src="https://img.shields.io/badge/🇬🇧_Read_in_English-6C5CE7?style=for-the-badge"></a>
</p>
