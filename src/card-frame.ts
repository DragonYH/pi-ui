import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FrameColor = "borderAccent" | "error";

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

export function cardRail(line: string, width: number, theme: Theme, isError = false): string {
  if (width < 6) return truncateToWidth(line, width, "");
  const text = truncateToWidth(line, width - 4);
  const border = (value: string) => theme.fg(isError ? "error" : "borderAccent", value);
  return border("│ ") + text + " ".repeat(Math.max(0, width - 4 - visibleWidth(text))) + border(" │");
}
