import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { STARTUP_BRIDGE_KEY, type StartupEntry, type StartupProgress, type StartupSnapshot } from "./progress.ts";
import { cleanStartupText, renderStartupProgress } from "./view.ts";

export interface StartupHost {
  headerContainer: { children: unknown[] };
  documentContainer?: { children: unknown[] };
  loadedResourcesContainer?: unknown;
  ui: { requestRender(): void; terminal?: { rows: number } };
  shouldShowStartupHeader?: () => boolean;
}

export interface StartupExtension {
  path: string;
  resolvedPath?: string;
  hidden?: boolean;
  handlers: Map<string, StartupHandler[]>;
  messageRenderers?: Map<string, unknown>;
}
export type StartupHandler = (...args: unknown[]) => unknown;

function extensionName(path: string): string {
  if (!isAbsolute(path)) return path.replace(/^builtin:/, "");
  let directory = dirname(path);
  for (let depth = 0; depth < 5; depth++) {
    if (basename(directory) === ".pi" || basename(directory) === "extensions") break;
    const metadata = join(directory, "package.json");
    if (existsSync(metadata)) {
      try {
        const name: unknown = JSON.parse(readFileSync(metadata, "utf8")).name;
        if (typeof name === "string" && name) return name;
      } catch { /* Broken metadata must not prevent startup. */ }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return basename(path).replace(/\.[cm]?[jt]s$/, "");
}

/** Tracks session_start only. Module imports have already finished at this point. */
export class StartupController implements StartupProgress {
  private readonly entries = new Map<string, StartupEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly startedAt = performance.now();
  private finishedAt: number | undefined;
  private total = 0;
  private frame = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private disposed = false;
  private failed = false;
  private host: StartupHost | undefined;
  private preview: unknown;
  private restoreHeaderVisibility: (() => void) | undefined;
  private uninstall: (() => void) | undefined;

  constructor(total = 0) {
    this.total = total;
  }

  install(): void {
    const globals = globalThis as Record<string, unknown>;
    const previous = globals[STARTUP_BRIDGE_KEY];
    globals[STARTUP_BRIDGE_KEY] = this;
    this.uninstall = () => {
      if (globals[STARTUP_BRIDGE_KEY] !== this) return;
      if (previous === undefined) delete globals[STARTUP_BRIDGE_KEY];
      else globals[STARTUP_BRIDGE_KEY] = previous;
    };
    this.timer = setInterval(() => { this.frame++; this.publish(); }, 80);
    this.timer.unref();
  }

  /** Mount into Pi's existing component tree before its first ui.start(). */
  attach(host: StartupHost, showPreview: boolean): void {
    this.host = host;
    if (!showPreview) return;
    const original = host.shouldShowStartupHeader;
    if (typeof original === "function") {
      host.shouldShowStartupHeader = () => false;
      this.restoreHeaderVisibility = () => { host.shouldShowStartupHeader = original; };
    }
    this.preview = {
      render: (width: number) => renderStartupProgress(this.snapshot(), width, undefined, Math.max(1, (host.ui.terminal?.rows ?? 30) - 8)),
      invalidate() {},
    };
    host.headerContainer.children.unshift(this.preview);
  }

  releasePreview(): void {
    if (!this.host || !this.preview) return;
    const index = this.host.headerContainer.children.indexOf(this.preview);
    if (index !== -1) this.host.headerContainer.children.splice(index, 1);
    this.preview = undefined;
  }

  resourcePanel(): { parent: unknown; panel: unknown } | undefined {
    const parent = this.host?.documentContainer;
    const panel = this.host?.loadedResourcesContainer;
    return parent && panel && parent.children.includes(panel) ? { parent, panel } : undefined;
  }

  snapshot(): StartupSnapshot {
    return {
      active: this.finishedAt === undefined && !this.disposed,
      phase: this.failed ? "failed" : this.finishedAt === undefined ? "initializing" : "ready",
      startedAt: this.startedAt,
      elapsedMs: (this.finishedAt ?? performance.now()) - this.startedAt,
      total: this.total,
      frame: this.frame,
      entries: [...this.entries.values()].map((entry) => ({ ...entry })),
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Clone the emission snapshot; leave registered handlers and their order intact. */
  plan(extensions: readonly StartupExtension[], owner: StartupExtension): StartupExtension[] {
    this.total = extensions.filter((extension) => !extension.hidden).length;
    const ordered = [owner, ...extensions.filter((extension) => extension !== owner)];
    return ordered.map((extension) => {
      if (extension.hidden) return extension;
      const handlers = extension.handlers.get("session_start") ?? [];
      const path = extension.resolvedPath ?? extension.path;
      let remaining = Math.max(1, handlers.length);
      const timed = (handler?: StartupHandler): StartupHandler => async (...args) => {
        this.releasePreview();
        let entry = this.entries.get(path);
        if (!entry) {
          entry = { path, name: extensionName(path), state: "initializing", startedAt: performance.now(), hasHandler: handlers.length > 0 };
          this.entries.set(path, entry);
        }
        entry.state = "initializing";
        entry.startedAt = performance.now();
        this.publish();
        try {
          return await handler?.(...args);
        } catch (error) {
          entry.error = cleanStartupText(error instanceof Error ? error.message : String(error));
          throw error;
        } finally {
          entry.initializeMs = (entry.initializeMs ?? 0) + (handler ? performance.now() - entry.startedAt : 0);
          if (--remaining === 0) entry.state = entry.error ? "error" : "ready";
          this.publish();
        }
      };
      const snapshot = new Map(extension.handlers);
      snapshot.set("session_start", handlers.length ? handlers.map(timed) : [timed()]);
      return { ...extension, handlers: snapshot };
    });
  }

  finish(): void {
    this.finishedAt = performance.now();
    clearInterval(this.timer);
    this.timer = undefined;
    this.releasePreview();
    this.restoreHeaderVisibility?.();
    this.restoreHeaderVisibility = undefined;
    this.publish();
  }

  private publish(): void {
    if (this.disposed) return;
    this.host?.ui.requestRender();
    for (const listener of this.listeners) listener();
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.finishedAt === undefined) {
      this.failed = true;
      this.finish();
    }
    clearInterval(this.timer);
    this.releasePreview();
    this.restoreHeaderVisibility?.();
    this.uninstall?.();
    this.listeners.clear();
    this.disposed = true;
  }
}
