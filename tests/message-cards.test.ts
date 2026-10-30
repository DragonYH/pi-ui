import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageComponent, UserMessageComponent, initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";
import { decorateMessage } from "../src/message-cards.ts";

initTheme("dark");
const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
const timestamp = new Date(2026, 7, 4, 12, 34, 56).getTime();
const wrap = (component: unknown, role: string, time = timestamp) => decorateMessage(component as Parameters<typeof decorateMessage>[0], { role, timestamp: time }, () => theme);
const assistant = (text: string) => ({
  role: "assistant", content: [{ type: "text", text }], timestamp,
  api: "openai-completions", provider: "openai", model: "fixture", stopReason: "stop",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
}) as AssistantMessage;

function assertCard(lines: string[], width: number, user: boolean, expectedWidth?: number) {
  const available = width - 1;
  const frame = lines.map(stripVTControlCharacters).filter((line) => line.trim());
  assert(frame.length >= 3);
  const cardWidth = visibleWidth(frame[0].trimStart());
  const x = user ? available - cardWidth : 0;
  assert(cardWidth <= Math.floor(available * 2 / 3), "card width must not exceed two thirds of the available columns");
  if (expectedWidth !== undefined) assert.equal(cardWidth, expectedWidth);
  assert(frame.every((line) => line.indexOf(line.trimStart()) === x), "cards must keep their role's alignment");
  assert(frame.every((line) => visibleWidth(line) === x + cardWidth), "all frame edges must align and reserve the scrollbar column");
  assert.match(frame[0].slice(x), user ? /^╭─+ You ─╮$/ : /^╭─ Assistant ─+╮$/);
  assert(frame.at(-1)!.endsWith("─╯"));
  return frame;
}

test("user messages adapt to content and keep their recorded time after resizing", () => {
  const component = new UserMessageComponent("你好 🧪 é — " + "message ".repeat(40));
  wrap(component, "user");
  for (const width of [40, 52, 80, 100, 101, 160]) {
    const frame = assertCard(component.render(width), width, true);
    assert.match(frame.at(-1)!, / 12:34:56 ─╯$/);
    assert(frame.join("\n").includes("你好"));
    assert(!component.render(width).join("\n").includes("\x1b[48;"), "native user background must not spill across the card");
  }
  for (const width of [0, 1, 2, 3, 5, 8, 12, 20]) {
    assert(component.render(width).every((line) => visibleWidth(line) <= width));
  }
});

test("cards size to their longest displayed line, including wide and styled text", () => {
  const longest = "界".repeat(8) + " 🧪 é";
  for (const user of [true, false]) {
    const short = user ? new UserMessageComponent("OK") : new AssistantMessageComponent(assistant("OK"));
    wrap(short, user ? "user" : "assistant");
    assertCard(short.render(100), 100, user, user ? 14 : 15);
    const component = user ? new UserMessageComponent(`**${longest}**\nshort`) : new AssistantMessageComponent(assistant(`**${longest}**\nshort`));
    wrap(component, user ? "user" : "assistant");
    for (const width of [80, 100, 160]) {
      const frame = assertCard(component.render(width), width, user, visibleWidth(longest) + 4);
      assert(frame.join("\n").includes(longest));
      assert(!frame.join("\n").includes("..."), "discarding native padding must not truncate visible content");
    }
  }
});

test("long lines wrap at the two-thirds cap without losing content", () => {
  const text = "长文本🧪".repeat(80);
  for (const user of [true, false]) {
    const component = user ? new UserMessageComponent(text) : new AssistantMessageComponent(assistant(text));
    wrap(component, user ? "user" : "assistant");
    for (const width of [40, 52, 80, 100, 101, 160]) {
      const cap = Math.floor((width - 1) * 2 / 3);
      const frame = assertCard(component.render(width), width, user, cap - (cap % 2));
      const body = frame.slice(1, -1).map((line) => line.trimStart().slice(2, -2).trim()).join("");
      assert.equal(body, text);
    }
  }
});

test("assistant cards grow and shrink while streaming and rebuilding native content", () => {
  const first = assistant("First reply 中文 🧪");
  const component = new AssistantMessageComponent(first);
  wrap(component, "assistant");
  const frame = assertCard(component.render(100), 100, false);
  assert.match(frame.at(-1)!, /^╰─ 12:34:56 ─+╯$/);
  const next = { ...first, content: [{ type: "text" as const, text: "Updated reply\n\n```ts\nconst value = 42; // streamed update\n```" }], timestamp: timestamp + 1000 };
  component.updateContent(next);
  (component as unknown as { setOutputPad?(padding: number): void }).setOutputPad?.(4);
  component.invalidate();
  const updated = assertCard(component.render(100), 100, false);
  assert(visibleWidth(updated[0]) > visibleWidth(frame[0]));
  assert(updated.join("\n").includes("Updated reply"));
  assert(updated.join("\n").includes("const value = 42;"));
  assert(updated.at(-1)!.includes("12:34:57"), "time must follow the persisted message timestamp");
  wrap(component, "assistant");
  assert.equal(component.render(100).filter((line) => line.includes("╭")).length, 1, "decorating twice must not nest frames");
  component.updateContent({ ...next, content: [{ type: "text", text: "OK" }] });
  assertCard(component.render(100), 100, false, 15);
  component.updateContent({ ...next, content: [{ type: "toolCall", id: "call", name: "bash", arguments: {} }], stopReason: "toolUse" });
  assert.deepEqual(component.render(100), [], "tool-call-only messages must not leave empty cards");
});

test("message frames preserve terminal zones, links and local mouse coordinates", () => {
  let clicked: unknown;
  const component = {
    render: (_width: number) => ["\x1b]133;A\x07", "\x1b]8;;https://example.com\x07link\x1b]8;;\x07" + " ".repeat(58), "\x1b]133;B\x07\x1b]133;C\x07"],
    handleMouse: (event: unknown) => { clicked = event; return { handled: true }; },
    invalidate() {},
  };
  wrap(component, "user");
  const rendered = component.render(100);
  assert.equal(component.render(100), rendered, "cached message frames preserve their mouse layout and shell zones");
  assert(rendered[0].startsWith("\x1b]133;A\x07"));
  assert(rendered.at(-1)!.startsWith("\x1b]133;B\x07\x1b]133;C\x07"));
  assert(rendered[1].includes("\x1b]8;;https://example.com\x07"));
  assert.equal(rendered.join("\n").match(/133;A/g)?.length, 1);
  const mouse = component as unknown as { handleMouse(event: { x: number; y: number; width: number; height: number }): unknown };
  assertCard(rendered, 100, true, 14);
  assert(!rendered.join("\n").includes("..."));
  const event = { x: 87, y: 1, width: 100, height: 3, screenX: 87, screenY: 10 };
  assert.deepEqual(mouse.handleMouse(event), { handled: true });
  assert.deepEqual(clicked, { ...event, x: 0, y: 1, width: 62, height: 3 });
  clicked = undefined;
  assert.equal(mouse.handleMouse({ x: 1, y: 1, width: 100, height: 3 }), undefined);
  assert.equal(mouse.handleMouse({ x: 87, y: 0, width: 100, height: 3 }), undefined);
  assert.equal(mouse.handleMouse({ x: 97, y: 1, width: 100, height: 3 }), undefined);
  assert.equal(clicked, undefined);
});

test("missing timestamps stay unknown and native error content is retained", () => {
  const component = new Text("Error: fixture failure", 0, 0);
  decorateMessage(component, { role: "assistant" }, () => theme);
  const rendered = component.render(80).join("\n");
  assert(rendered.includes("Error: fixture failure"));
  assert(rendered.includes("╰─ — "));
});

test("history message redraws reuse framing without restyling native Markdown", () => {
  let styling = 0;
  const counted = { ...theme, fg: (_color: string, text: string) => { styling++; return text; } } as Theme;
  for (const user of [true, false]) {
    const component = user ? new UserMessageComponent("**History** 中文 🧪\n" + "body ".repeat(80))
      : new AssistantMessageComponent(assistant("**History** 中文 🧪\n\n```ts\nconst value = 42;\n```"));
    decorateMessage(component as unknown as Parameters<typeof decorateMessage>[0], { role: user ? "user" : "assistant", timestamp }, () => counted);
    const first = component.render(100);
    const initialStyling = styling;
    for (let frame = 0; frame < 20; frame++) assert.equal(component.render(100), first);
    assert.equal(styling, initialStyling, "unchanged native rows skip message measurement, truncation, and frame styling");
    component.invalidate();
    const refreshed = component.render(100);
    assert.notEqual(refreshed, first);
    assert.deepEqual(refreshed, first);
    assert(styling > initialStyling);
    const narrow = component.render(52);
    assert.notEqual(narrow, refreshed);
    assert.equal(component.render(52), narrow);
    assertCard(narrow, 52, user);
  }
});

test("message frame cache observes mutable rows, timestamp and theme changes", () => {
  let color = 31;
  let currentTheme = { ...theme, fg: (_color: string, text: string) => `\x1b[${color}m${text}\x1b[39m` } as Theme;
  let childRenders = 0;
  let invalidations = 0;
  const rows = ["first"];
  const component = {
    lastMessage: { role: "assistant", timestamp },
    render(_width: number) { childRenders++; return rows; },
    invalidate() { invalidations++; },
  };
  decorateMessage(component, component.lastMessage, () => currentTheme);
  const first = component.render(100);
  assert.equal(component.render(100), first);
  assert.equal(childRenders, 2, "native children remain live under the frame cache");
  rows[0] = "second";
  const changed = component.render(100);
  assert(changed.join("\n").includes("second"));
  assert.notEqual(changed, first, "a native component may mutate the same returned row array");
  component.lastMessage.timestamp += 1000;
  assert(component.render(100).at(-1)!.includes("12:34:57"));
  const beforeTheme = component.render(100);
  currentTheme = { ...theme, fg: (_color: string, text: string) => `\x1b[32m${text}\x1b[39m` } as Theme;
  const newTheme = component.render(100);
  assert.notEqual(newTheme, beforeTheme);
  assert(newTheme.join("\n").includes("\x1b[32m"));
  currentTheme = { ...theme, fg: (_color: string, text: string) => `\x1b[${color}m${text}\x1b[39m` } as Theme;
  component.render(100);
  color = 34;
  component.invalidate();
  const recolored = component.render(100);
  assert.equal(invalidations, 1);
  assert(recolored.join("\n").includes("\x1b[34m") && !recolored.join("\n").includes("\x1b[31m"));
  rows.length = 0;
  const empty = component.render(100);
  assert.deepEqual(empty, []);
  assert.equal(component.render(100), empty);
  rows.push("visible again");
  assert(component.render(100).join("\n").includes("visible again"));
});
