import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatTokens } from "./footer.ts";

export const WORKING_INDICATOR_FRAMES = ["󰄰", "󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"] as const;

const SHOW_TIMER_AFTER_MS = 3_000;
const CJK_CHARS = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/g;
type WorkingTone = "success" | "warning" | "error";

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Own the working row once per extension runtime, including session replacement. */
export function registerWorkingIndicator(pi: ExtensionAPI): void {
  let activeCtx: ExtensionContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let initialIndicator: ReturnType<typeof setTimeout> | undefined;
  let startedAt: number | undefined;
  let lastTokenAt = 0;
  let tone: WorkingTone | undefined;
  let lastMessage: string | undefined;
  let completedTokens = 0;
  let messageTokens = 0;
  let reportedOutput = 0;

  function resetRun(): void {
    clearInterval(timer);
    timer = undefined;
    startedAt = undefined;
    completedTokens = 0;
    messageTokens = 0;
    reportedOutput = 0;
    lastTokenAt = 0;
    tone = undefined;
    lastMessage = undefined;
  }

  function dispose(): void {
    clearTimeout(initialIndicator);
    initialIndicator = undefined;
    resetRun();
    activeCtx = undefined;
  }

  function withUI(update: (ui: ExtensionContext["ui"]) => void): void {
    try {
      if (activeCtx?.hasUI) update(activeCtx.ui);
    } catch {
      // Session replacement/reload invalidates captured contexts. Stop all callbacks.
      dispose();
    }
  }

  function applyTone(next: WorkingTone): void {
    if (tone === next) return;
    tone = next;
    withUI((ui) => ui.setWorkingIndicator({
      frames: WORKING_INDICATOR_FRAMES.map((frame) => ui.theme.fg(next, frame)),
      intervalMs: 120,
    }));
  }

  function updateWorkingMessage(force = false): void {
    if (startedAt === undefined) return;
    const elapsed = Date.now() - startedAt;
    const tokens = Math.ceil(completedTokens + messageTokens);
    const parts: string[] = [];
    if (tokens > 0) parts.push(`↓ ${formatTokens(tokens)} tokens`);
    if (elapsed >= SHOW_TIMER_AFTER_MS || tokens > 0) parts.push(formatDuration(elapsed));
    const message = parts.length ? `Working... (${parts.join(" · ")})` : undefined;
    if (!force && message === lastMessage) return;
    lastMessage = message;
    withUI((ui) => ui.setWorkingMessage(message));
  }

  function refresh(): void {
    if (startedAt === undefined) return;
    const idleMs = Date.now() - lastTokenAt;
    applyTone(idleMs < 10_000 ? "success" : idleMs < 30_000 ? "warning" : "error");
    updateWorkingMessage();
  }

  function recordUsage(message: AssistantMessage, final = false): void {
    const output = message.usage?.output;
    if (!Number.isFinite(output) || output <= 0) return;
    if (final) {
      // A successful response's usage includes hidden reasoning and corrects estimates both ways.
      messageTokens = output;
      reportedOutput = output;
    } else if (output > reportedOutput) {
      // Repeated placeholders (e.g. Anthropic's initial output=1) must not erase deltas.
      messageTokens = message.stopReason === "error" || message.stopReason === "aborted"
        ? Math.max(messageTokens, output)
        : output;
      reportedOutput = output;
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    dispose();
    if (!ctx.hasUI || ("mode" in ctx && ctx.mode !== "tui")) return;
    activeCtx = ctx;
    // Pi resets extension UI after session_start; apply our frames on the next tick.
    initialIndicator = setTimeout(() => {
      initialIndicator = undefined;
      applyTone("success");
    }, 0);
    initialIndicator.unref?.();
  });

  pi.on("agent_start", async () => {
    if (!activeCtx) return;
    resetRun();
    startedAt = Date.now();
    lastTokenAt = startedAt;
    applyTone("success");
    updateWorkingMessage(true);
    // applyTone may have discovered a stale context.
    if (startedAt === undefined) return;
    timer = setInterval(refresh, 100);
    timer.unref?.();
  });

  pi.on("message_start", async (event) => {
    if (startedAt === undefined || event.message.role !== "assistant") return;
    messageTokens = 0;
    reportedOutput = 0;
    recordUsage(event.message);
  });

  pi.on("message_update", async (event) => {
    if (startedAt === undefined || event.message.role !== "assistant") return;
    lastTokenAt = Date.now();
    const stream = event.assistantMessageEvent;
    if (stream.type === "text_delta" || stream.type === "thinking_delta" || stream.type === "toolcall_delta") {
      const cjk = stream.delta.match(CJK_CHARS)?.length ?? 0;
      // Keep fractions until display so single-character chunks do not each count as a token.
      messageTokens += cjk + (stream.delta.length - cjk) / 4;
    }
    recordUsage(event.message, stream.type === "done");
    refresh();
  });

  pi.on("message_end", async (event) => {
    if (startedAt === undefined || event.message.role !== "assistant") return;
    const failed = event.message.stopReason === "error" || event.message.stopReason === "aborted";
    recordUsage(event.message, !failed);
    completedTokens += messageTokens;
    messageTokens = 0;
    reportedOutput = 0;
    updateWorkingMessage();
  });

  pi.on("agent_end", async () => {
    resetRun();
    withUI((ui) => ui.setWorkingMessage());
  });

  pi.on("session_shutdown", async () => {
    withUI((ui) => ui.setWorkingMessage());
    dispose();
  });
}
