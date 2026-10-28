import { PI_LOGO, formatStartupDuration, startupEntryDuration, type StartupSnapshot } from "./progress.ts";

export type StartupTone = "accent" | "dim" | "success" | "error" | "warning";
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

function renderLogo(frame: number, active: boolean, style: StartupStyle): string[] {
  const width = 18;
  const height = 10;
  const grid = Array.from({ length: height }, () => Array<string>(width).fill(" "));
  const perimeter: [number, number][] = [];
  for (let x = 0; x < width; x++) perimeter.push([x, 0]);
  for (let y = 1; y < height; y++) perimeter.push([width - 1, y]);
  for (let x = width - 2; x >= 0; x--) perimeter.push([x, height - 1]);
  for (let y = height - 2; y > 0; y--) perimeter.push([0, y]);
  for (const [x, y] of perimeter) grid[y][x] = y === 0 || y === height - 1 ? "─" : "│";
  grid[0][0] = "╭";
  grid[0][width - 1] = "╮";
  grid[height - 1][0] = "╰";
  grid[height - 1][width - 1] = "╯";
  for (const [row, line] of PI_LOGO.entries()) {
    for (const [column, char] of Array.from(line).entries()) grid[row + 2][column + 3] = char;
  }
  if (active) {
    for (let trail = 3; trail >= 0; trail--) {
      const [x, y] = perimeter[(frame - trail + perimeter.length) % perimeter.length];
      grid[y][x] = trail === 0 ? "●" : "·";
    }
  }
  return grid.map((row) => style("accent", row.join("")));
}

/** Shared by Pi's initial component tree and the regular welcome header. */
export function renderStartupProgress(
  snapshot: StartupSnapshot,
  width: number,
  style: StartupStyle = plainStyle,
  maxRows = 30,
): string[] {
  if (width <= 0 || maxRows <= 0) return [];
  const wide = width >= 76;
  const brandWidth = wide ? 23 : Math.min(width, 18);
  const gap = wide ? 3 : 0;
  const contentWidth = wide ? width - brandWidth - gap : width;
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
  const availableRows = Math.max(1, maxRows - (wide ? 4 : 15));
  const showDetails = contentWidth >= 56;
  const capacity = Math.max(1, Math.floor(availableRows / (showDetails ? 3 : 2)));
  const entries = snapshot.entries.slice(-capacity);
  if (entries.length < snapshot.entries.length) {
    content.push(...wrap(`… ${snapshot.entries.length - entries.length} earlier extensions`, contentWidth).map((line) => style("dim", line)));
  }
  for (const entry of entries) {
    const running = entry.state === "initializing";
    const icon = entry.error ? "✗" : running ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][snapshot.frame % 10] : "✓";
    const tone = entry.error ? "error" : running ? "accent" : "success";
    const duration = formatStartupDuration(startupEntryDuration(entry));
    const prefixWidth = contentWidth >= 3 ? 2 : 0;
    const nameLines = wrap(entry.name, Math.max(1, contentWidth - prefixWidth));
    for (const [index, name] of nameLines.entries()) {
      const prefix = prefixWidth === 0 ? "" : index === 0 ? `${icon} ` : "  ";
      const room = contentWidth - prefixWidth - startupTextWidth(name) - duration.length - 2;
      content.push(style(tone, `${prefix}${name}`) +
        (index === nameLines.length - 1 && room >= 0 ? style("dim", `${" ".repeat(room + 2)}${duration}`) : ""));
      if (index === nameLines.length - 1 && room < 0) content.push(...wrap(`  ${duration}`, contentWidth).map((line) => style("dim", line)));
    }
    if (entry.error) {
      content.push(...wrap(`  ${entry.error}`, contentWidth).map((line) => style("error", line)));
    } else if (showDetails) {
      const detail = entry.hasHandler === false ? "No session_start handler" : "session_start initialization";
      content.push(...wrap(`  ${detail}`, contentWidth).map((line) => style("dim", line)));
    }
  }
  if (entries.length === 0) content.push(...wrap("Preparing extension initialization…", contentWidth).map((line) => style("dim", line)));
  const logo = renderLogo(snapshot.frame, snapshot.active, style);
  if (!wide) {
    if (width < 18) return content.slice(0, maxRows);
    return [...logo, "", ...content].slice(0, maxRows);
  }
  const rows = Math.min(maxRows, Math.max(logo.length, content.length));
  return Array.from({ length: rows }, (_, row) => {
    // Logo lines have fixed visible width; ANSI styling does not affect padding.
    const left = logo[row] ?? "";
    return `${left}${" ".repeat(brandWidth - (left ? 18 : 0) + gap)}${content[row] ?? ""}`.trimEnd();
  });
}
