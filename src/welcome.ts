import { existsSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component, TUI } from "@earendil-works/pi-tui";

type WelcomeTheme = ExtensionContext["ui"]["theme"];
type WelcomeTone = "accent" | "muted" | "dim";

export type WelcomeVariant = "wide" | "narrow" | "compact";

export interface WelcomeLine {
  text: string;
  tone: WelcomeTone;
}

export const WIDE_WELCOME_BREAKPOINT = 60;
export const NARROW_WELCOME_BREAKPOINT = 32;
// This is only a height gate; widgets do not render a matching spacer.
export const WELCOME_BOTTOM_RESERVE = 5;
export const WELCOME_WIDGET_KEY = "@rokiy/pi-ui:welcome";

const MINIMUM_WELCOME_WIDTH = 8;
const WIDE_LOGO = [
  "██████╗  ██╗",
  "██╔══██╗ ██║",
  "██████╔╝ ██║",
  "██╔═══╝  ██║",
  "██║      ██║",
  "╚═╝      ╚═╝",
] as const;

function centerLine(line: string, width: number): string {
  const truncated = truncateToWidth(line, width);
  const padding = Math.max(0, Math.floor((width - visibleWidth(truncated)) / 2));
  return `${" ".repeat(padding)}${truncated}`;
}

export function getWelcomeVariant(width: number): WelcomeVariant {
  if (width >= WIDE_WELCOME_BREAKPOINT) return "wide";
  if (width >= NARROW_WELCOME_BREAKPOINT) return "narrow";
  return "compact";
}

export function buildWelcomeLines(width: number): WelcomeLine[] {
  switch (getWelcomeVariant(width)) {
    case "wide":
      return [
        ...WIDE_LOGO.map<WelcomeLine>((text) => ({ text, tone: "accent" })),
        { text: "", tone: "dim" },
        { text: "A quiet place to make things.", tone: "muted" },
        { text: "Type a message to begin", tone: "dim" },
      ];
    case "narrow":
      return [
        { text: "pi", tone: "accent" },
        { text: "Type a message to begin", tone: "muted" },
      ];
    case "compact":
      return [
        { text: "pi", tone: "accent" },
        { text: "Type to begin", tone: "dim" },
      ];
  }
}

export function renderWelcomeLines(width: number, theme: WelcomeTheme): string[] {
  if (!Number.isFinite(width)) return [];

  const safeWidth = Math.max(0, Math.floor(width));
  if (safeWidth === 0) return [];

  return buildWelcomeLines(safeWidth).map(({ text, tone }) => {
    const styled = text ? theme.fg(tone, text) : "";
    return centerLine(styled, safeWidth);
  });
}

export function isWelcomeVisible(termWidth: number, termHeight: number): boolean {
  if (!Number.isFinite(termWidth) || !Number.isFinite(termHeight)) return false;

  const width = Math.floor(termWidth);
  const height = Math.floor(termHeight);
  const contentHeight = buildWelcomeLines(width).length;
  return width >= MINIMUM_WELCOME_WIDTH && height >= contentHeight + WELCOME_BOTTOM_RESERVE + 1;
}

type WelcomeSessionManager = {
  getEntries?: () => readonly unknown[];
  getSessionFile?: () => string | null | undefined;
  getHeader?: () => { parentSession?: unknown } | null | undefined;
};

function isBootstrapEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const type = (entry as { type?: unknown }).type;
  return type === "model_change" || type === "thinking_level_change";
}

function isFreshStartupSession(ctx: ExtensionContext): boolean {
  const sessionManager = ctx.sessionManager as unknown as WelcomeSessionManager | undefined;
  if (!sessionManager
    || typeof sessionManager.getEntries !== "function"
    || typeof sessionManager.getSessionFile !== "function"
    || typeof sessionManager.getHeader !== "function") {
    return false;
  }

  const sessionFile = sessionManager.getSessionFile();
  if (sessionFile !== undefined && sessionFile !== null) {
    if (typeof sessionFile !== "string") return false;
    if (sessionFile.length > 0 && existsSync(sessionFile)) return false;
  }

  const header = sessionManager.getHeader();
  if (header === null || typeof header !== "object" || header.parentSession !== undefined) {
    return false;
  }

  const entries = sessionManager.getEntries();
  return Array.isArray(entries) && entries.every(isBootstrapEntry);
}

export function shouldShowWelcome(
  ctx: ExtensionContext,
  sessionStartReason: "startup" | "reload" | "new" | "resume" | "fork",
): boolean {
  if (sessionStartReason !== "startup" || !ctx.hasUI) return false;

  try {
    return ctx.isIdle() && !ctx.hasPendingMessages() && isFreshStartupSession(ctx);
  } catch {
    return false;
  }
}

export class WelcomeWidget implements Component {
  constructor(
    private readonly tui: TUI,
    private readonly theme: WelcomeTheme,
  ) {}

  render(width: number): string[] {
    if (!isWelcomeVisible(width, this.tui.terminal.rows)) return [];
    return renderWelcomeLines(width, this.theme);
  }

  invalidate(): void {
    // Render reads the current terminal dimensions on every pass.
  }

  dispose(): void {
    // The controller owns widget removal; never call setWidget from here.
  }
}

export interface WelcomeWidgetController {
  mount(): void;
  dismiss(): void;
  dispose(): void;
}

function isTerminalSizeReport(data: unknown): boolean {
  if (typeof data !== "string") return false;

  const prefix = `${String.fromCharCode(27)}[6;`;
  if (!data.startsWith(prefix) || !data.endsWith("t")) return false;
  return /^\d+;\d+$/.test(data.slice(prefix.length, -1));
}

export function createWelcomeWidget(ctx: ExtensionContext): WelcomeWidgetController {
  let mounted = false;
  let dismissed = false;
  let disposed = false;
  let widgetRegistered = false;
  let removeTerminalInput: (() => void) | undefined;

  const removeInputListener = () => {
    const unsubscribe = removeTerminalInput;
    removeTerminalInput = undefined;
    if (!unsubscribe) return;

    try {
      unsubscribe();
    } catch {
      // A replaced session may already have cleared extension input listeners.
    }
  };

  const clearWelcomeWidget = () => {
    if (!widgetRegistered) return;

    try {
      ctx.ui.setWidget(WELCOME_WIDGET_KEY, undefined);
      widgetRegistered = false;
    } catch {
      // A stale context must not affect the editor or footer.
    }
  };

  const dismiss = () => {
    if (dismissed && !widgetRegistered && !removeTerminalInput) return;

    dismissed = true;
    removeInputListener();
    clearWelcomeWidget();
  };

  return {
    mount() {
      if (mounted || dismissed || disposed) return;
      mounted = true;

      try {
        removeTerminalInput = ctx.ui.onTerminalInput((data) => {
          if (!isTerminalSizeReport(data)) dismiss();
          return undefined;
        });
      } catch {
        // agent_start still dismisses the widget if raw input hooks are unavailable.
      }

      try {
        widgetRegistered = true;
        ctx.ui.setWidget(
          WELCOME_WIDGET_KEY,
          (tui, theme) => new WelcomeWidget(tui, theme),
          { placement: "aboveEditor" },
        );
      } catch {
        dismiss();
      }
    },

    dismiss,

    dispose() {
      if (disposed) return;
      disposed = true;
      dismiss();
    },
  };
}
