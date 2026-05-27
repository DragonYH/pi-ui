# @rokiy/pi-ui

自定义 pi 终端 UI，包含主题、布局和消息渲染。

## 安装

```bash
pi install /root/dev/pi-themes
```

## 功能

- **自定义主题**：基于 Catppuccin 的深色主题
- **自定义页脚**：显示 pi 品牌和快捷键提示
- **自定义工作指示器**：动画加载效果
- **消息渲染**：可扩展的消息显示方式

## 主题列表

| 主题 | 描述 |
|-----|------|
| `catppuccin-dark` | 基于 Catppuccin 的深色主题 |

## 自定义

### 修改主题

编辑 `themes/catppuccin-dark.json` 文件，修改颜色值。

### 修改布局

编辑 `src/index.ts` 文件：

- `setupCustomUI()` - 修改页脚和指示器
- `pi.registerMessageRenderer()` - 修改消息渲染

## 参考

- [pi 扩展文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [pi 主题文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/themes.md)
- [TUI 组件文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)

## 安装

### 从 npm 安装

```bash
pi install @rokiy/pi-ui
```

### 本地开发安装

```bash
pi install /root/dev/pi-themes
```

## 包含内容

- **扩展入口** `src/index.ts`：自定义页脚、工作指示器、编辑器边框、assistant 消息渲染
- **主题目录** `themes/`：包含 `catppuccin-dark` Catppuccin 风格深色主题

## 发布前检查

```bash
npm pack --dry-run
```

## 兼容性

- Node.js >= 20
- pi 运行时通过 jiti 直接加载 TypeScript，无需编译
