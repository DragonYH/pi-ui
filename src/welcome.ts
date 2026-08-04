import { existsSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component, OverlayHandle } from "@earendil-works/pi-tui";

type WelcomeTheme = ExtensionContext["ui"]["theme"];
type WelcomeTone = "accent" | "muted" | "dim";

export type WelcomeVariant = "wide" | "narrow" | "compact";

export interface WelcomeLine {
  text: string;
  tone: WelcomeTone;
}

export const WIDE_WELCOME_BREAKPOINT = 60;
export const NARROW_WELCOME_BREAKPOINT = 32;
export const WELCOME_BOTTOM_RESERVE = 5;

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

export class WelcomeOverlay implements Component {
  constructor(private readonly theme: WelcomeTheme) {}

  render(width: number): string[] {
    return renderWelcomeLines(width, this.theme);
  }

  invalidate(): void {
    // This static overlay has no internal state to invalidate.
  }
}

export interface WelcomeOverlayController {
  mount(): void;
  dismiss(): void;
  dispose(): void;
}

function isTerminalSizeReport(data: string): boolean {
  const prefix = `${String.fromCharCode(27)}[6;`;
  if (!data.startsWith(prefix) || !data.endsWith("t")) return false;
  return /^\d+;\d+$/.test(data.slice(prefix.length, -1));
}

export function createWelcomeOverlay(ctx: ExtensionContext): WelcomeOverlayController {
  let mounted = false;
  let dismissed = false;
  let disposed = false;
  let handle: OverlayHandle | undefined;
  let removeTerminalInput: (() => void) | undefined;
  const hiddenHandles = new Set<OverlayHandle>();

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

  const hideWelcomeOverlay = (overlayHandle: OverlayHandle | undefined) => {
    if (!overlayHandle || hiddenHandles.has(overlayHandle)) return;
    hiddenHandles.add(overlayHandle);

    try {
      overlayHandle.hide();
    } catch {
      // A stale context must not affect the editor or footer.
    }
  };

  const dismiss = () => {
    if (dismissed) return;

    dismissed = true;
    removeInputListener();

    const overlayHandle = handle;
    handle = undefined;
    hideWelcomeOverlay(overlayHandle);
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
        // agent_start still dismisses the overlay if raw input hooks are unavailable.
      }

      try {
        const overlay = ctx.ui.custom<void>(
          (_tui, theme) => new WelcomeOverlay(theme),
          {
            overlay: true,
            overlayOptions: {
              width: "100%",
              anchor: "center",
              margin: { bottom: WELCOME_BOTTOM_RESERVE },
              nonCapturing: true,
              visible: isWelcomeVisible,
            },
            onHandle(nextHandle) {
              if (dismissed || disposed) {
                hideWelcomeOverlay(nextHandle);
                return;
              }

              const previousHandle = handle;
              handle = nextHandle;
              if (previousHandle && previousHandle !== nextHandle) {
                hideWelcomeOverlay(previousHandle);
              }
            },
          },
        );

        void overlay.catch(() => {
          try {
            dismiss();
          } catch {
            // Cleanup must not leak through a stale session context.
          }
        });
      } catch {
        try {
          dismiss();
        } catch {
          // Cleanup must not leak through a stale session context.
        }
      }
    },

    dismiss,

    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        dismiss();
      } catch {
        // Cleanup must not leak through a stale session context.
      }
    },
  };
}
