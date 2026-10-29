import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { renderWelcomeHeader, type WelcomeResources } from "../src/welcome.ts";

const theme = {
  fg: (color: string, text: string) => `\x1b[${color === "success" ? 32 : 36}m${text}\x1b[39m`,
  bold: (text: string) => text,
} as Theme;
const skills = [
  "anysearch",
  "debug-pi-status-refresh",
  "recover-github-git-transport",
  "verify-archive-interoperability-and-artifacts",
  "verify-canvas-pointer-input",
  "verify-native-rust-without-cargo",
  "verify-pi-working-token-usage",
  "verify-rust-module-with-existing-dependencies",
  "verify-subagent-output",
  "verify-pi-message-cards",
  "verify-pi-tool-card-renderers",
  "verify-pi-ui-startup-resources",
  "一个很长的技能名称-with-combining-é-and-emoji-🧪",
];
const packages = [
  "@juicesharp/rpiv-ask-user-question  v1.2.3->v1.2.4",
  "@juicesharp/rpiv-todo  v2.0.0",
  "@juicesharp/rpiv-btw  v1.0.0",
  "pi-hermes-memory  v3.0.0",
  "pi-balance  v0.1.0",
  "@hypabolic/pi-hypa  v1.2.0",
  "@kinarajv/pi-tps-extensions  v1.0.0",
  "pi-commandcode-provider  v0.1.0",
  "billion-context-pi  v0.1.83",
];
const resources: WelcomeResources = {
  context: [], prompts: [], themes: [], skills, extensions: packages, packageExtensions: packages,
};

function section(lines: string[], title: string): string[] {
  const start = lines.findIndex((line) => line.includes(`[${title}]`));
  assert(start >= 0, `${title} heading missing`);
  const end = lines.findIndex((line, index) => index > start && /\[(Skills|Extensions)\]/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

// Recover the labels a reader sees in each visual column, including wrapped lines.
function labels(lines: string[]): string[] {
  const offsets = Array.from(new Set(lines.flatMap((line) =>
    Array.from(line.matchAll(/• /g), (match) => visibleWidth(line.slice(0, match.index))),
  ))).sort((a, b) => a - b);
  return offsets.flatMap((offset, index) => {
    const items: string[] = [];
    for (const line of lines) {
      const start = stripVTControlCharacters(truncateToWidth(line, offset, "")).length;
      const end = stripVTControlCharacters(truncateToWidth(line, offsets[index + 1] ?? 1000, "")).length;
      const cell = line.slice(start, end).trimEnd();
      if (cell.startsWith("• ")) items.push(cell.slice(2));
      else if (cell.trim() && items.length) items[items.length - 1] += cell.trim();
    }
    return items;
  });
}
const compact = (items: string[]) => items.map((item) => item.replace(/\s+/g, ""));

test("long skill and package names keep multiple columns and all text on ordinary terminal widths", () => {
  for (const width of [80, 100, 150, 240, 320]) {
    const rendered = renderWelcomeHeader(resources, theme, width);
    assert(rendered.every((line) => visibleWidth(line) <= width), `overflow at width ${width}`);
    const plain = rendered.map(stripVTControlCharacters);
    for (const [title, expected] of [["Skills", skills], ["Extensions", packages]] as const) {
      const rows = section(plain, title);
      assert(rows.some((line) => (line.match(/• /g)?.length ?? 0) >= 2), `${title} collapsed to one column at width ${width}`);
      assert.deepEqual(compact(labels(rows)), compact(expected), `${title} lost or reordered text at width ${width}`);
      if (width >= 240) {
        assert(rows.some((line) => (line.match(/• /g)?.length ?? 0) === 3), `${title} did not gain a third column at width ${width}`);
        assert(Math.max(...rows.map(visibleWidth)) > width * 0.75, `${title} left the extra terminal width unused at width ${width}`);
      }
    }
    assert(rendered.join("\n").includes("\x1b[32mv1.2.4"), "the newer version remains green after wrapping");
  }
});

test("welcome lists fall back on narrow terminals and reflow after resizing", () => {
  for (const width of [18, 32, 40, 52, 150, 32, 150]) {
    const rendered = renderWelcomeHeader(resources, theme, width);
    assert(rendered.every((line) => visibleWidth(line) <= width), `overflow at width ${width}`);
    const plain = rendered.map(stripVTControlCharacters);
    for (const [title, expected] of [["Skills", skills], ["Extensions", packages]] as const) {
      const rows = section(plain, title);
      if (width <= 40) assert(rows.every((line) => (line.match(/• /g)?.length ?? 0) <= 1));
      assert.deepEqual(compact(labels(rows)), compact(expected), `${title} lost text at width ${width}`);
    }
  }
});

test("short lists stay compact and longer short-name lists use three columns", () => {
  const short = Array.from({ length: 18 }, (_, index) => `skill-${index}`);
  const rendered = renderWelcomeHeader({ ...resources, skills: short, extensions: [] }, theme, 150).map(stripVTControlCharacters);
  const rows = section(rendered, "Skills");
  assert(rows.some((line) => (line.match(/• /g)?.length ?? 0) === 3));
  assert.deepEqual(labels(rows), short);
  const few = renderWelcomeHeader({ ...resources, skills: short.slice(0, 3), extensions: [] }, theme, 150).map(stripVTControlCharacters);
  assert(section(few, "Skills").every((line) => (line.match(/• /g)?.length ?? 0) <= 1));
});
