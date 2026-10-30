import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FrameColor = "borderAccent" | "error" | "thinkingHigh" | "success";

export function sameValues(left: readonly unknown[] | undefined, right: readonly unknown[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

/** Cache the frame while still letting native children render and maintain their controls.
 * Snapshot child rows: custom components can reuse and mutate their returned array.
 * Retain only the latest layout so resizing cannot accumulate historical copies.
 */
export class CardFrameCache {
  private entry?: { keys: readonly unknown[]; content: readonly string[]; lines: string[] };

  get(keys: readonly unknown[], content: readonly string[]): string[] | undefined {
    const entry = this.entry;
    return entry && sameValues(entry.keys, keys) && sameValues(entry.content, content) ? entry.lines : undefined;
  }

  set(keys: readonly unknown[], content: readonly string[], lines: string[]): string[] {
    this.entry = { keys: keys.slice(), content: content.slice(), lines };
    return lines;
  }

  invalidate(): void { this.entry = undefined; }
}

export function cardEdge(width: number, left: string, right: string, title: string, theme: Theme, color: FrameColor = "borderAccent", align: "left" | "right" = "left"): string {
  if (!title) return theme.fg(color, width < 2 ? truncateToWidth(left, width, "") : `${left}${"─".repeat(width - 2)}${right}`);
  if (width < 6) return truncateToWidth(title, width, "");
  if (align === "right") {
    const label = truncateToWidth(title, width - 6);
    const fill = "─".repeat(Math.max(0, width - 6 - visibleWidth(label)));
    return theme.fg(color, `${left}─${fill} `) + label + theme.fg(color, ` ─${right}`);
  }
  const label = `${truncateToWidth(title, width - 6)} `;
  return theme.fg(color, `${left}─ `) + label + theme.fg(color, `${"─".repeat(Math.max(0, width - 5 - visibleWidth(label)))}─${right}`);
}

export function cardRail(line: string, width: number, theme: Theme, color: FrameColor = "borderAccent"): string {
  if (width < 6) return truncateToWidth(line, width, "");
  const text = truncateToWidth(line, width - 4);
  const border = (value: string) => theme.fg(color, value);
  return border("│ ") + text + " ".repeat(Math.max(0, width - 4 - visibleWidth(text))) + border(" │");
}
