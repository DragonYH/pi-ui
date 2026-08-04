import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { BoxedEditor } from "./editor.ts";
import { collectUsage, buildCoreFooterSections, renderCoreFooterLine, renderExtensionStatusLine, formatTokens } from "./footer.ts";
import { installWelcomeHeader } from "./welcome.ts";

export const WORKING_INDICATOR_FRAMES = ["󰄰", "󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"] as const;

let workingIndicatorTimer: ReturnType<typeof setInterval> | undefined;
let lastTokenTime = 0;
let currentWorkingTone: 'green' | 'yellow' | 'red' | undefined;

const STATUS_ICONS = {
  clock: "󰅐",
  input: "↑",
  output: "↓",
  cost: "󰈁",
} as const;

let agentStartTime = 0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function buildUsageLine(input: number, output: number, costTotal: number | undefined, durationMs: number): string {
  const inputStr = formatTokens(input);
  const outputStr = formatTokens(output);
  const costStr = costTotal != null ? `$${Number(costTotal).toFixed(4)}` : '-';
  const durationStr = formatDuration(durationMs);
  const statsLine = `${STATUS_ICONS.input}${inputStr}  ${STATUS_ICONS.output}${outputStr}  ·  ${costStr}  ·  ${STATUS_ICONS.clock} ${durationStr}`;
  const separator = "\u2500".repeat(visibleWidth(statsLine));

  return `\n${separator}\n${statsLine}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function clearWorkingIndicatorTimer(): void {
  clearInterval(workingIndicatorTimer);
  workingIndicatorTimer = undefined;
  lastTokenTime = 0;
  currentWorkingTone = undefined;
  agentStartTime = 0;
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

export function setupCustomUI(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  sessionStartReason: SessionStartEvent["reason"],
): void {
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

  const updateWorkingMessage = () => {
    if (!agentStartTime) return;
    const elapsed = Date.now() - agentStartTime;
    const elapsedStr = formatDuration(elapsed);
    try {
      ctx.ui.setWorkingMessage(`Working...   ${STATUS_ICONS.clock} ${elapsedStr}`);
    } catch {
      // ctx may be stale after session replacement or reload — safely ignore.
    }
  };

  const startWorkingTimer = () => {
    stopWorkingTimer();
    lastTokenTime = Date.now();
    currentWorkingTone = undefined;
    applyWorkingIndicator('green');
    workingIndicatorTimer = setInterval(() => { updateWorkingIndicatorTone(); updateWorkingMessage(); }, 100);
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
    invalidate() { },
  }));

  // 自定义欢迎屏：替换核心 header 为左右双列布局（左侧 logo + 右侧原有欢迎内容）
  installWelcomeHeader(ctx, sessionStartReason);

  // Defer initial indicator so SDK's resetExtensionUI() (which calls
  // setWorkingIndicator() with no args) has already run before we override.
  setTimeout(() => applyWorkingIndicator('green'), 0);

  // agent_start = 用户发消息、agent 开始处理 → 启动计时
  pi.on('agent_start', async () => {
    agentStartTime = Date.now();
    startWorkingTimer();
    rerenderFooter?.();
  });

  // message_update = token 到达 → 更新时间戳
  pi.on('message_update', async () => {
    lastTokenTime = Date.now();
  });

  // agent_end = agent 处理完毕（streaming 结束）→ 停止计时
  pi.on('agent_end', async () => {
    stopWorkingTimer();
    agentStartTime = 0;
    // Clear working message back to default after a short delay
    setTimeout(() => { try { ctx.ui.setWorkingMessage(); } catch { /* ignore */ } }, 2000);
    rerenderFooter?.();
  });

  // message_end = 单条消息完成 → 追加消耗统计到 assistant 消息末尾
  pi.on('message_end', async (event) => {
    const msg = event?.message;
    if (!msg || msg.role !== 'assistant') return;
    const usage = msg?.usage;
    if (!usage || (usage.input === 0 && usage.output === 0)) return;

    const elapsed = agentStartTime ? Date.now() - agentStartTime : 0;
    const usageLine = buildUsageLine(usage.input, usage.output, usage.cost?.total, elapsed);

    // Append as a new text content block so the AssistantMessageComponent renders it
    if (Array.isArray(msg.content)) {
      msg.content.push({ type: 'text', text: usageLine });
      // Return the mutated message so the core replaces it in-place (triggers re-render)
      return { message: msg };
    }

    return {};
  });

  // context = LLM 调用前过滤上下文 → 剥离 usage stats，避免污染 LLM 上下文
  pi.on('context', async (event) => {
    const messages = event?.messages;
    if (!Array.isArray(messages)) return {};

    // Stats block format: \n───\n↑...
    const STATS_RE = /^\n\u2500+\n↑/;

    const filtered = messages.map((msg) => {
      if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return msg;
      return {
        ...msg,
        content: msg.content.filter((block) => {
          if (block.type !== 'text') return true;
          return !STATS_RE.test(block.text || '');
        }),
      };
    });

    return { messages: filtered };
  });

  pi.on('thinking_level_select', async () => {
    rerenderFooter?.();
  });
}
