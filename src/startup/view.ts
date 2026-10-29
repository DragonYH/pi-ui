import { PI_LOGO, formatStartupDuration, startupEntryDuration, type StartupEntry, type StartupSnapshot } from "./progress.ts";
import { getWelcomeLayout, GRID_COLUMN_GAP, WELCOME_BOTTOM_PADDING, WELCOME_TOP_PADDING } from "../welcome-layout.ts";

export type StartupTone = "accent" | "muted" | "dim" | "success" | "error" | "warning";
export type StartupStyle = (tone: StartupTone, text: string) => string;
const plainStyle: StartupStyle = (_tone, text) => text;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const controlCharacters = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`, "g");

export function cleanStartupText(text: string): string {
  return text.replace(controlCharacters, " ");
}

function characterWidth(text: string): number {
  const point = text.codePointAt(0) ?? 0;
  if (/^\p{Mark}+$/u.test(text)) return 0;
  if (/\p{Extended_Pictographic}/u.test(text) ||
    point >= 0x1100 && (point <= 0x115f || point >= 0x2e80 && point <= 0xa4cf ||
      point >= 0xac00 && point <= 0xd7a3 || point >= 0xf900 && point <= 0xfaff ||
      point >= 0xfe10 && point <= 0xfe6f || point >= 0xff01 && point <= 0xff60 ||
      point >= 0xffe0 && point <= 0xffe6 || point >= 0x20000)) return 2;
  return 1;
}

export function startupTextWidth(text: string): number {
  return Array.from(graphemes.segment(text), ({ segment }) => characterWidth(segment)).reduce((a, b) => a + b, 0);
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  let size = 0;
  for (const { segment } of graphemes.segment(cleanStartupText(text))) {
    const next = characterWidth(segment);
    if (next > width) continue;
    if (size + next > width) {
      lines.push(line);
      line = "";
      size = 0;
    }
    line += segment;
    size += next;
  }
  lines.push(line);
  return lines;
}

const LOGO_WIDTH = PI_LOGO[0].length;

function renderLogo(frame: number, active: boolean, style: StartupStyle): string[] {
  // A slow, eased sweep stays below the wordmark, keeping its silhouette still.
  const position = (1 - Math.cos((frame % 40) / 40 * Math.PI * 2)) / 2 * (LOGO_WIDTH - 1);
  const track = Array.from({ length: LOGO_WIDTH }, (_, column) => {
    const distance = Math.abs(column - position);
    return active && distance < 1.5
      ? style("accent", "━")
      : style(active && distance < 3 ? "muted" : "dim", "─");
  }).join("");
  return [...PI_LOGO.map((line) => style("accent", line)), "", track];
}

function renderEntry(entry: StartupEntry, frame: number, width: number, style: StartupStyle): string[] {
  const running = entry.state === "initializing";
  const icon = entry.error ? "✗" : running ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][frame % 10] : "✓";
  const tone = entry.error ? "error" : running ? "accent" : "success";
  const duration = formatStartupDuration(startupEntryDuration(entry));
  const prefixWidth = width >= 3 ? 2 : 0;
  const nameLines = wrap(entry.name, Math.max(1, width - prefixWidth));
  const lines: string[] = [];
  for (const [index, name] of nameLines.entries()) {
    const prefix = prefixWidth === 0 ? "" : index === 0 ? `${icon} ` : "  ";
    const room = width - prefixWidth - startupTextWidth(name) - duration.length - 2;
    lines.push(style(tone, `${prefix}${name}`) +
      (index === nameLines.length - 1 && room >= 0 ? style("dim", `${" ".repeat(room + 2)}${duration}`) : ""));
    if (index === nameLines.length - 1 && room < 0) lines.push(...wrap(`  ${duration}`, width).map((line) => style("dim", line)));
  }
  if (entry.error) lines.push(...wrap(`  ${entry.error}`, width).map((line) => style("error", line)));
  return lines;
}

/** Shared by Pi's initial component tree and the regular welcome header. */
export function renderStartupProgress(
  snapshot: StartupSnapshot,
  width: number,
  style: StartupStyle = plainStyle,
  maxRows = 30,
): string[] {
  if (width <= 0 || maxRows <= 0) return [];
  const layout = getWelcomeLayout(width);
  const topPadding = maxRows >= 10 ? WELCOME_TOP_PADDING : 0;
  const bottomPadding = maxRows >= 10 ? WELCOME_BOTTOM_PADDING : 0;
  const bodyBudget = maxRows - topPadding - bottomPadding;
  const logo = renderLogo(snapshot.frame, snapshot.active, style);
  const showLogo = layout.width >= LOGO_WIDTH && bodyBudget >= (layout.wide ? logo.length : logo.length + 6);
  const wide = layout.wide && showLogo;
  const contentWidth = wide ? layout.width - layout.brandWidth - GRID_COLUMN_GAP : layout.width;
  const contentBudget = Math.min(18, bodyBudget - (showLogo && !wide ? logo.length + 2 : 0));
  const completed = snapshot.entries.filter((entry) =>
    entry.state === "error" || entry.state === "ready",
  ).length;
  const heading = `Extensions · ${completed}/${snapshot.total}`;
  const phase = snapshot.phase === "initializing" ? "Initializing" : snapshot.phase === "failed" ? "Stopped" : "Ready";
  const content = [
    ...wrap(heading, contentWidth).map((line) => style("accent", line)),
    ...wrap(`${phase} · ${formatStartupDuration(snapshot.elapsedMs)}`, contentWidth).map((line) => style("dim", line)),
    "",
  ];
  const groups = snapshot.entries.map((entry) => renderEntry(entry, snapshot.frame, contentWidth, style));
  const entryBudget = Math.max(0, contentBudget - content.length);
  let start = groups.length;
  let usedRows = 0;
  while (start > 0) {
    const nextRows = usedRows + groups[start - 1].length;
    if (nextRows + (start > 1 ? 1 : 0) > entryBudget && start < groups.length) break;
    start--;
    usedRows = nextRows;
  }
  if (start > 0) content.push(...wrap(`… ${start} earlier extensions`, contentWidth).map((line) => style("dim", line)));
  content.push(...groups.slice(start).flat());
  if (groups.length === 0) content.push(...wrap("Preparing extensions…", contentWidth).map((line) => style("dim", line)));
  const visibleContent = content.slice(0, contentBudget);
  let body: string[];
  if (wide) {
    const rows = Math.min(bodyBudget, Math.max(12, visibleContent.length));
    const brandTop = Math.floor((rows - logo.length) / 2);
    const contentTop = Math.floor((rows - visibleContent.length) / 2);
    const logoInset = Math.floor((layout.brandWidth - LOGO_WIDTH) / 2);
    body = Array.from({ length: rows }, (_, row) => {
      const brand = logo[row - brandTop];
      const left = brand
        ? `${" ".repeat(logoInset)}${brand}${" ".repeat(layout.brandWidth - logoInset - LOGO_WIDTH)}`
        : " ".repeat(layout.brandWidth);
      return `${left}${" ".repeat(GRID_COLUMN_GAP)}${visibleContent[row - contentTop] ?? ""}`.trimEnd();
    });
  } else {
    const centeredLogo = showLogo ? logo.map((line) => line ? `${" ".repeat(Math.floor((layout.width - LOGO_WIDTH) / 2))}${line}` : "") : [];
    body = [...centeredLogo, ...(showLogo ? ["", ""] : []), ...visibleContent];
  }
  const inset = " ".repeat(layout.leftPadding);
  return [
    ...Array<string>(topPadding).fill(""),
    ...body.map((line) => line ? `${inset}${line}` : ""),
    ...Array<string>(bottomPadding).fill(""),
  ];
}
