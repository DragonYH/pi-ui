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
- 🎨 **Catppuccin 深色主题** — 基于 [Catppuccin Mocha](https://github.com/catppuccin/catppuccin) 精心调制的深色主题，包含 64+ 颜色映射，覆盖语法高亮、Markdown 渲染、思考级别、UI 组件和导出背景
- ✨ **边框编辑器（Boxed Editor）** — 使用 Unicode 边框字符（`╭─╮` 风格）替代默认编辑器，呈现优雅圆角效果
- ⏳ **自定义加载动画** — 8 帧旋转动画（󰪞→󰪥）替代默认加载指示器，每 120ms 循环，交替强调色/柔和色
- 💬 **增强消息渲染** — 自定义助手消息渲染器，支持展开查看 JSON 详细信息
- 🔄 **事件驱动更新** — UI 在 `session_start`、`model_select`、`thinking_level_select`、`turn_end` 事件触发时自动刷新
- 🔌 **零依赖** — 纯对等依赖包，无需额外安装 npm 依赖
- ⚡ **原生 TypeScript** — 源码通过 [jiti](https://github.com/unjs/jiti) 直接加载运行，无需编译步骤

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

1. **会话启动** — 自定义 UI 自动初始化：状态栏、编辑器、加载动画、主题全部就绪
2. **切换模型** — 状态栏自动更新显示新模型名称
3. **切换思考级别** — 状态栏中的思考级别指示器同步更新
4. **对话结束后**（`turn_end`）— Token 用量和费用统计自动刷新

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

### 加载动画

默认的 "Working..." 提示被替换为 **旋转动画序列**（󰪞 󰪟 󰪠 󰪡 󰪢 󰪣 󰪤 󰪥），每 120ms 循环，交替显示强调色和柔和色。

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
│   └── index.ts              # 扩展入口 — 状态栏、BoxedEditor、加载动画、消息渲染器
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
│                                                              │
│  ┌── 扩展: pi-ui ───────────────────────────────────────┐  │
│  │  session_start  ──►  setupCustomUI()  ──►  状态栏    │  │
│  │                              编辑器                    │  │
│  │                              加载动画                  │  │
│  │                              消息渲染器                │  │
│  │  model_select  ──►  rerenderFooter()                  │  │
│  │  thinking_level_select ──►  rerenderFooter()          │  │
│  │  turn_end      ──►  rerenderFooter()                  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 监听事件

- **`session_start`** — 初始化自定义 UI 组件（状态栏、编辑器、加载动画、消息渲染器）
- **`model_select`** — 切换模型时重新渲染状态栏
- **`thinking_level_select`** — 更新状态栏中的思考级别标签
- **`turn_end`** — 每次对话结束后刷新 Token 用量和费用统计

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
