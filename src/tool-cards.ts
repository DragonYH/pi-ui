import { stripVTControlCharacters } from "node:util";
import { keyText, type ExtensionAPI, type Theme, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Box, Container, Text, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { cardEdge as edge, cardRail as rail } from "./card-frame.ts";

// Structural types keep loading safe on older Pi versions without the resolver API.
type Renderers = Pick<ToolDefinition, "renderShell" | "renderCall" | "renderResult">;
export type ToolCardResolver = (name: string, next: () => Renderers | undefined) => Renderers | undefined;
export type ToolCardContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2] & { outputPad?: number; durationMs?: number };
type Context = ToolCardContext;
const CARD = Symbol("pi-ui:tool-card");
const BUILT_INS = new Set(["read", "write", "bash", "powershell", "grep", "find", "ls"]);
const PREVIEW_LINES = 4;
const FRAME_COLOR = "borderAccent";
interface CardState { hasResult: boolean; hiddenCallRows: number }

function clean(text: string): string {
  // Tool-controlled text must not inject terminal commands, cursor moves, or fake rows.
  // eslint-disable-next-line no-control-regex
  return stripVTControlCharacters(text).replace(/\r\n?/g, "\n").replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

function state(context: Context): CardState {
  const shared = context.state as Record<symbol, CardState>;
  return shared[CARD] ??= { hasResult: false, hiddenCallRows: 0 };
}

function innerContext(context: Context, component: Component | undefined): Context {
  return { ...context, expanded: true, outputPad: 0, lastComponent: component };
}

function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m${Math.floor(ms % 60_000 / 1000)}s`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h${Math.floor(ms % 3_600_000 / 60_000)}m`;
  const days = Math.floor(ms / 86_400_000);
  return days < 100 ? `${days}d${Math.floor(ms % 86_400_000 / 3_600_000)}h` : `${days}d`;
}

function status(context: Context): { icon: string; label: string; color: "error" | "success" | "warning" | "muted" } {
  if (context.isError) return { icon: "✕", label: "fail", color: "error" };
  if (!context.isPartial) return { icon: "✓", label: "done", color: "success" };
  if (context.executionStarted) return { icon: "◌", label: "running", color: "warning" };
  return { icon: "·", label: context.argsComplete ? "queued" : "preparing", color: "muted" };
}

function argumentText(name: string, args: unknown, expanded: boolean): string {
  const entries = args && typeof args === "object" ? Object.entries(args) : [];
  const ordered = [...entries].sort(([a], [b]) => {
    const keys = ["command", "path", "file_path", "pattern", "query", "url", "action"];
    const rank = (key: string) => keys.includes(key) ? keys.indexOf(key) : keys.length;
    return rank(a) - rank(b);
  });
  const values = ordered.filter(([, value]) => value !== undefined && value !== null);
  const format = (value: unknown) => clean(typeof value === "string" ? value : (JSON.stringify(value, null, expanded ? 2 : undefined) ?? String(value)));
  if (expanded) return [clean(name), ...values.map(([key, value]) => `${clean(key)}: ${format(value)}`)].join("\n");
  const preview = values.slice(0, 2).map(([key, value]) => `${clean(key)}=${format(value).slice(0, 180).replace(/\n/g, " ↵ ")}`).join("  ");
  return `${clean(name)}${preview ? ` ${preview}` : ""}`;
}

function expansionKey(): string {
  return keyText("app.tools.expand");
}

function rightColumnWidth(width: number): number {
  // Default: 13 display columns, matching "done · 100 ms" and "ctrl+o expand".
  const columns = Math.max(13, visibleWidth(expansionKey()) + 7);
  return width >= columns + 12 ? columns : 0;
}

function alignedFields(label: string, value: string, width: number): string {
  const labelWidth = Math.max(4, Math.min(width - 4, visibleWidth(label)));
  const valueWidth = width - labelWidth - 3;
  const left = truncateToWidth(label, labelWidth, "…");
  const right = truncateToWidth(value, valueWidth, "…");
  return left + " ".repeat(Math.max(0, labelWidth - visibleWidth(left))) + " · "
    + " ".repeat(Math.max(0, valueWidth - visibleWidth(right))) + right;
}

function expansionHint(expanded: boolean, width = 0): string {
  const keys = expansionKey();
  const label = keys || "click to";
  const action = expanded ? "fold" : keys ? "expand" : "open";
  return label + " ".repeat(Math.max(1, width - visibleWidth(label) - visibleWidth(action))) + action;
}

function callText(line: string, theme: Theme, name = "", command = false): string {
  // Retain path links while replacing native title styles with the card's color hierarchy.
  // eslint-disable-next-line no-control-regex
  const text = line.replace(/\x1b\[[0-9;:]*m/g, "").trimEnd();
  const label = clean(name);
  // Some themes use their frame accent for inline code; use their cyan syntax color there.
  const color = command
    ? theme.fg("mdCode", "$") === theme.fg("accent", "$") ? "syntaxVariable" : "mdCode"
    : "muted";
  if (label && (text === label || text.startsWith(`${label} `))) {
    return theme.fg("mdHeading", theme.bold(label)) + theme.fg(color, text.slice(label.length));
  }
  return theme.fg(command ? color : name ? "mdHeading" : "muted", text);
}

function contentLines(name: string, component: Component | undefined, width: number): string[] {
  if (name !== "edit") return component?.render(width) ?? [];
  // Native edit rebuilds its colored Box on completion; the card owns the background.
  if (component instanceof Box) component.setBgFn(undefined);
  // Inverse diff words become solid blocks against a transparent card. Underline them.
  return (component?.render(width) ?? []).map((line) => line.replaceAll("\x1b[7m", "\x1b[4m").replaceAll("\x1b[27m", "\x1b[24m"));
}

function trimmedRows(lines: string[]): number[] {
  let start = 0;
  let end = lines.length;
  const blank = (line: string) => !stripVTControlCharacters(line).trim();
  while (start < end && blank(lines[start])) start++;
  while (end > start && blank(lines[end - 1])) end--;
  return Array.from({ length: end - start }, (_, index) => start + index);
}

// Mouse APIs are newer than the minimum development SDK. Keep the adapter structural.
interface MouseEvent { x: number; y: number; width: number; height: number }
interface MouseResult { handled?: boolean; capture?: boolean; focus?: boolean; render?: boolean }
type NativeComponent = Component & { focused?: boolean; handleMouse?(event: MouseEvent): MouseResult | undefined };

function hasControls(component: NativeComponent | undefined): boolean {
  if (!component) return false;
  if (component.handleInput) return true;
  const mouseHandler = component.handleMouse;
  if (component instanceof Container || component instanceof Box) {
    const prototype = component instanceof Container ? Container.prototype : Box.prototype;
    if (mouseHandler === (prototype as NativeComponent).handleMouse) return component.children.some(hasControls);
  }
  return Boolean(mouseHandler);
}

abstract class CardContent implements Component {
  inner?: NativeComponent;
  protected mouseRows = new Map<number, { x: number; y: number; width: number; height: number }>();

  protected get interactive(): boolean { return hasControls(this.inner); }
  get focused(): boolean { return this.inner?.focused ?? false; }
  set focused(value: boolean) { if (this.inner && "focused" in this.inner) this.inner.focused = value; }
  get wantsKeyRelease(): boolean | undefined { return this.inner?.wantsKeyRelease; }
  handleInput(data: string): void { this.inner?.handleInput?.(data); }
  handleMouse(event: MouseEvent): MouseResult | undefined {
    const row = this.mouseRows.get(event.y);
    if (!row || event.x < row.x || event.x >= row.x + row.width) return undefined;
    return this.inner?.handleMouse?.({ ...event, x: event.x - row.x, y: row.y, width: row.width, height: row.height });
  }
  abstract render(width: number): string[];
  invalidate(): void { this.inner?.invalidate(); }
}

class CallCard extends CardContent {
  context!: Context;
  theme!: Theme;
  private name = "";
  private fallback = new Text("", 0, 0);

  update(name: string, args: unknown, theme: Theme, context: Context, render?: Renderers["renderCall"]): this {
    this.context = context;
    this.theme = theme;
    this.name = name;
    if (render) {
      // The outer card owns collapsing and its single footer hint.
      this.inner = render(args, theme, innerContext(context, this.inner === this.fallback ? undefined : this.inner));
    } else {
      this.fallback.setText(argumentText(name, args, context.expanded));
      this.inner = this.fallback;
    }
    return this;
  }

  render(width: number): string[] {
    this.mouseRows.clear();
    // Reserve the last terminal column for the scrollbar.
    width = Math.max(0, width - 1);
    if (width <= 0) return [];
    const { context, theme } = this;
    const current = status(context);
    const rightWidth = rightColumnWidth(width);
    const badge = rightWidth ? alignedFields(current.label, duration(context.durationMs) || "—", rightWidth) : "";
    const titleWidth = Math.max(1, width - 8 - (rightWidth ? rightWidth + 3 : 0));
    const command = this.name === "bash" || this.name === "powershell" || /(?:^|_)shell$/.test(this.name);
    const argumentBody = !this.interactive && (this.inner === this.fallback || command);
    const nativeWidth = argumentBody ? titleWidth : Math.max(1, width - 4);
    const lines = contentLines(this.name, this.inner, nativeWidth);
    const rows = trimmedRows(lines);
    const title = theme.fg(current.color, current.icon) + " " + truncateToWidth(callText(this.interactive ? clean(this.name) : lines[rows[0]] ?? "", theme, this.name, command), titleWidth);
    const gap = width - 6 - visibleWidth(title) - visibleWidth(badge);
    const header = rightWidth && gap >= 3
      ? title + theme.fg(context.isError ? "error" : FRAME_COLOR, ` ${"─".repeat(gap - 2)} `) + theme.fg(current.color, badge)
      : title;
    const output = [edge(width, "╭", "╮", header, theme, context.isError ? "error" : FRAME_COLOR)];
    const body = this.interactive ? rows : rows.slice(1).filter((row) => stripVTControlCharacters(lines[row]).trim());
    const extra = context.expanded || this.interactive ? body : body.slice(0, this.name === "edit" ? PREVIEW_LINES : 1);
    const shared = state(context);
    // Native edit puts its output diff in renderCall; other call bodies are arguments.
    shared.hiddenCallRows = this.name === "edit" ? body.length - extra.length : 0;
    for (const row of extra) {
      this.mouseRows.set(output.length, { x: 2, y: row, width: nativeWidth, height: lines.length });
      const line = argumentBody ? callText(lines[row], theme, "", command) : lines[row];
      output.push(rail(line, width, theme, context.isError));
    }
    if (!shared.hasResult) {
      if (shared.hiddenCallRows) output.push(rail(theme.fg("muted", `… ${shared.hiddenCallRows}+ lines hidden`), width, theme, context.isError));
      output.push(edge(width, "╰", "╯", theme.fg("dim", expansionHint(context.expanded, rightWidth)), theme, context.isError ? "error" : FRAME_COLOR, "right"));
    }
    return output;
  }
}

type Result = Parameters<NonNullable<Renderers["renderResult"]>>[0];
type Options = Parameters<NonNullable<Renderers["renderResult"]>>[1];

class ResultCard extends CardContent {
  private text = new Text("", 0, 0);
  private useNative = false;
  private context!: Context;
  private theme!: Theme;
  private options!: Options;
  private name = "";
  private lineCount = 0;
  private images = 0;
  private warning = "";
  private parsedContent?: Result["content"];
  private parsedDetails?: unknown;
  private output = "";
  private previewHead = "";
  private previewTail = "";
  private wasPartial = true;

  update(name: string, result: Result, options: Options, theme: Theme, context: Context, render?: Renderers["renderResult"]): this {
    state(context).hasResult = true;
    this.name = name;
    this.context = context;
    this.theme = theme;
    this.options = options;
    // Completed results are reused when expanding, resizing, or redrawing the footer.
    // Partial content can be mutated in place, so it always gets parsed again.
    if (options.isPartial || this.wasPartial || this.parsedContent !== result.content || this.parsedDetails !== result.details) {
      this.output = result.content.filter((block) => block.type === "text").map((block) => clean(block.text)).join("\n").trimEnd();
      const logicalLines = this.output ? this.output.split("\n") : [];
      this.lineCount = logicalLines.length;
      this.previewHead = logicalLines.slice(0, PREVIEW_LINES).join("\n");
      this.previewTail = logicalLines.slice(-PREVIEW_LINES).join("\n");
      this.images = result.content.filter((block) => block.type === "image").length;
      const details = result.details as {
        truncation?: { truncated?: boolean }; fullOutputPath?: string;
        matchLimitReached?: number; entryLimitReached?: number; resultLimitReached?: number; linesTruncated?: boolean;
      } | undefined;
      this.warning = [
        details?.truncation?.truncated ? "output truncated" : "",
        details?.matchLimitReached ? `${details.matchLimitReached} matches limit` : "",
        details?.entryLimitReached ? `${details.entryLimitReached} entries limit` : "",
        details?.resultLimitReached ? `${details.resultLimitReached} results limit` : "",
        details?.linesTruncated ? "some lines truncated" : "",
        typeof details?.fullOutputPath === "string" ? `full output: ${clean(details.fullOutputPath)}` : "",
      ].filter(Boolean).join(" · ");
      this.parsedContent = result.content;
      this.parsedDetails = result.details;
    }
    this.wasPartial = options.isPartial;
    const previewText = options.expanded ? this.output : this.isTail() && !context.isError ? this.previewTail : this.previewHead;
    this.text.setText(theme.fg(context.isError ? "error" : "toolOutput", previewText));
    // Built-in shell renderers may own timers while streaming; use our fast text
    // preview until they settle. Specialized renderers keep their content and controls.
    this.useNative = Boolean(render && (!BUILT_INS.has(name) || options.expanded && !options.isPartial));
    if (this.useNative && render) {
      this.inner = render(result, { ...options, expanded: true }, theme, innerContext(context, this.inner));
    }
    return this;
  }

  render(width: number): string[] {
    this.mouseRows.clear();
    width = Math.max(0, width - 1);
    if (width <= 0) return [];
    const { context, theme, options } = this;
    const innerWidth = Math.max(1, width - 4);
    const native = this.useNative && this.inner;
    const hideRead = this.name === "read" && !context.isError && !options.expanded;
    const lines = hideRead ? [] : contentLines(this.name, native || this.text, innerWidth);
    const rows = trimmedRows(lines);
    const showAll = options.expanded || Boolean(native && this.interactive);
    const count = showAll ? rows.length : hideRead ? 0 : PREVIEW_LINES;
    const tail = this.isTail() && !context.isError;
    const preview = count === 0 ? [] : tail && !showAll ? rows.slice(-count) : rows.slice(0, count);
    const hidden = state(context).hiddenCallRows + (showAll ? 0 : hideRead ? this.lineCount : Math.max(0, rows.length - preview.length) + (native ? 0 : Math.max(0, this.lineCount - PREVIEW_LINES)));
    const hiddenHint = hidden ? rail(theme.fg("muted", `… ${hidden}+ lines hidden`), width, theme, context.isError) : "";
    const output = preview.map((row, index) => {
      if (native) this.mouseRows.set(index + (hiddenHint && tail ? 1 : 0), { x: 2, y: row, width: innerWidth, height: lines.length });
      return rail(lines[row], width, theme, context.isError);
    });
    if (hiddenHint) {
      if (tail) output.unshift(hiddenHint);
      else output.push(hiddenHint);
    }
    if (this.warning && !native) {
      output.push(...new Text(theme.fg("warning", this.warning), 0, 0).render(innerWidth).map((line) => rail(line, width, theme, context.isError)));
    }
    if (this.images && !native) {
      output.push(rail(theme.fg("muted", `${this.images} image${this.images === 1 ? "" : "s"}`), width, theme, context.isError));
    }
    const hint = expansionHint(options.expanded, rightColumnWidth(width));
    output.push(edge(width, "╰", "╯", theme.fg("dim", hint), theme, context.isError ? "error" : FRAME_COLOR, "right"));
    return output;
  }

  private isTail(): boolean {
    return this.name === "bash" || this.name === "powershell" || /(?:^|_)shell$/.test(this.name);
  }

  invalidate(): void {
    this.text.invalidate();
    this.inner?.invalidate();
  }
}

/** Frame all tools while retaining native diffs, extension summaries, and controls. */
export const resolveToolCard: ToolCardResolver = (name, next) => {
  const original = next();
  return {
    renderShell: "self",
    renderCall(args, theme, context) {
      const component = context.lastComponent instanceof CallCard ? context.lastComponent : new CallCard();
      return component.update(name, args, theme, context, original?.renderCall);
    },
    renderResult(result, options, theme, context) {
      const component = context.lastComponent instanceof ResultCard ? context.lastComponent : new ResultCard();
      return component.update(name, result, options, theme, context, original?.renderResult);
    },
  };
};

export function registerToolCards(pi: ExtensionAPI): boolean {
  const api = pi as ExtensionAPI & { registerToolRenderer?: (resolver: ToolCardResolver) => void };
  if (typeof api.registerToolRenderer !== "function") return false;
  api.registerToolRenderer(resolveToolCard);
  return true;
}
