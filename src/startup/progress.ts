import { homedir } from "node:os";
import { resolve } from "node:path";

export const STARTUP_BRIDGE_KEY = "@rokiy/pi-ui:startup";

export const PI_LOGO = [
  "██████╗  ██╗",
  "██╔══██╗ ██║",
  "██████╔╝ ██║",
  "██╔═══╝  ██║",
  "██║      ██║",
  "╚═╝      ╚═╝",
] as const;

export interface StartupEntry {
  path: string;
  name: string;
  state: "initializing" | "ready" | "error";
  startedAt: number;
  initializeMs?: number;
  hasHandler?: boolean;
  error?: string;
}

export interface StartupSnapshot {
  active: boolean;
  phase: "initializing" | "ready" | "failed";
  startedAt: number;
  elapsedMs: number;
  total: number;
  frame: number;
  entries: readonly StartupEntry[];
}

export interface StartupProgress {
  snapshot(): StartupSnapshot;
  subscribe(listener: () => void): () => void;
  resourcePanel?(): { parent: unknown; panel: unknown } | undefined;
}

export function getStartupProgress(): StartupProgress | undefined {
  return (globalThis as Record<string, unknown>)[STARTUP_BRIDGE_KEY] as StartupProgress | undefined;
}

export function formatStartupDuration(ms: number): string {
  return ms < 1000 ? `${Math.max(0, Math.round(ms))} ms` : `${(ms / 1000).toFixed(2)} s`;
}

export function startupEntryDuration(entry: StartupEntry, now = performance.now()): number {
  return (entry.initializeMs ?? 0) + (entry.state === "initializing" ? Math.max(0, now - entry.startedAt) : 0);
}

/** Prefer exact packages/paths; native source basenames must identify a single entry. */
export function startupDurationForLabel(label: string, snapshot: StartupSnapshot): number | undefined {
  let name = label.split(/ {2}v/)[0].replace(/^npm:/, "").replace(/\\/g, "/");
  if (name.startsWith("~/")) name = homedir().replace(/\\/g, "/") + name.slice(1);
  else if (/^\.{1,2}\//.test(name)) name = resolve(name).replace(/\\/g, "/");
  let entries = snapshot.entries.filter((entry) => {
    const path = entry.path.replace(/\\/g, "/");
    return entry.name === name || path === name || path.replace(/\/index\.[cm]?[jt]s$/, "") === name;
  });
  if (entries.length === 0) {
    entries = snapshot.entries.filter((entry) => {
      const segments = entry.path.replace(/\\/g, "/").split("/");
      const file = segments.pop() ?? "";
      const sourceLabel = /^index\.[cm]?[jt]s$/.test(file)
        ? segments.pop()
        : file.replace(/\.[cm]?[jt]s$/, "");
      return sourceLabel === name;
    });
    if (entries.length !== 1) return undefined;
  }
  return entries.reduce((sum, entry) => sum + startupEntryDuration(entry), 0);
}
