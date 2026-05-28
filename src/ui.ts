import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { BoxedEditor } from "./editor.ts";
import { collectUsage, buildCoreFooterSections, renderCoreFooterLine, renderExtensionStatusLine } from "./footer.ts";

export const WORKING_INDICATOR_FRAMES = ["󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"] as const;

let workingIndicatorTimer: ReturnType<typeof setInterval> | undefined;
let lastTokenTime = 0;
let currentWorkingTone: 'green' | 'yellow' | 'red' | undefined;

export function clearWorkingIndicatorTimer(): void {
  clearInterval(workingIndicatorTimer);
  workingIndicatorTimer = undefined;
  lastTokenTime = 0;
  currentWorkingTone = undefined;
}

export function registerMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer('assistant', (message, options, theme) => {
    const { expanded } = options;
    let text = '';

    text += (message as { content: string }).content;

    if (expanded && message.details) {
      text += '\n' + theme.fg('dim', JSON.stringify(message.details, null, 2));
    }

    return new Text(text, 0, 0);
  });
}

export function setupCustomUI(pi: ExtensionAPI, ctx: ExtensionContext): void {
  // 清理前一个 session 可能遗留的定时器（定时器是 module 级共享的）
  clearInterval(workingIndicatorTimer);
  workingIndicatorTimer = undefined;
  lastTokenTime = 0;
  currentWorkingTone = undefined;

  let rerenderFooter: (() => void) | undefined;

  const applyWorkingIndicator = (tone: 'green' | 'yellow' | 'red') => {
    const activeThemeTone = tone === 'green' ? 'success' : tone === 'yellow' ? 'warning' : 'error';
    try {
      ctx.ui.setWorkingIndicator({
        frames: WORKING_INDICATOR_FRAMES.map((frame) => ctx.ui.theme.fg(activeThemeTone, frame)),
        intervalMs: 120,
      });
    } catch {
      // ctx may be stale after session replacement or reload — silently ignore
    }
  };

  const updateWorkingIndicatorTone = () => {
    // 定时器已停止（session 结束时由 agent_end 清理）→ 跳过
    if (!workingIndicatorTimer) return;
    const elapsed = Date.now() - lastTokenTime;
    const nextTone = elapsed < 10_000 ? 'green' : elapsed < 30_000 ? 'yellow' : 'red';
    if (nextTone === currentWorkingTone) return;
    currentWorkingTone = nextTone;
    applyWorkingIndicator(nextTone);
  };

  const startWorkingTimer = () => {
    stopWorkingTimer();
    lastTokenTime = Date.now();
    currentWorkingTone = undefined;
    applyWorkingIndicator('green');
    workingIndicatorTimer = setInterval(updateWorkingIndicatorTone, 500);
  };

  const stopWorkingTimer = () => {
    clearInterval(workingIndicatorTimer);
    workingIndicatorTimer = undefined;
  };

  ctx.ui.setEditorComponent((tui, theme, keybindings) => new BoxedEditor(tui, theme, keybindings));

  ctx.ui.setFooter((tui, theme, footerData) => ({
    dispose: footerData.onBranchChange(() => tui.requestRender()),
    render(width: number) {
      rerenderFooter = () => tui.requestRender();
      const usage = collectUsage(ctx);
      const coreSections = buildCoreFooterSections(theme, footerData, ctx, pi, usage);
      const lines = [renderCoreFooterLine(width, theme, coreSections)];
      const extensionLine = renderExtensionStatusLine(width, theme, footerData);

      if (extensionLine) {
        lines.push(extensionLine);
      }

      return lines;
    },
    invalidate() {},
  }));

  // Defer initial indicator so SDK's resetExtensionUI() (which calls
  // setWorkingIndicator() with no args) has already run before we override.
  setTimeout(() => applyWorkingIndicator('green'), 0);

  // agent_start = 用户发消息、agent 开始处理 → 启动计时
  pi.on('agent_start', async () => {
    startWorkingTimer();
    rerenderFooter?.();
  });

  // message_update = token 到达 → 更新时间戳（定时器每 500ms 驱动颜色更新）
  pi.on('message_update', async () => {
    lastTokenTime = Date.now();
  });

  // agent_end = agent 处理完毕（streaming 结束）→ 停止计时
  pi.on('agent_end', async () => {
    stopWorkingTimer();
    rerenderFooter?.();
  });

  pi.on('thinking_level_select', async () => {
    rerenderFooter?.();
  });
}