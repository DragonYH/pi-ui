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

function assertLane(lines: string[], width: number, user: boolean) {
  const available = width - 1;
  const lane = Math.floor(available / 2);
  const x = user ? available - lane : 0;
  const frame = lines.map(stripVTControlCharacters).filter((line) => line.trim());
  assert(frame.length >= 3);
  assert(frame.every((line) => line.indexOf(line.trimStart()) === x), "card must remain in its assigned half");
  assert(frame.every((line) => visibleWidth(line) === x + lane), "right edge reserves the scrollbar column");
  assert.match(frame[0].slice(x), user ? /^╭─+ You ─╮$/ : /^╭─ Assistant ─+╮$/);
  assert(frame.at(-1)!.endsWith("─╯"));
  return frame;
}

test("user messages occupy the right half and keep their recorded time after resizing", () => {
  const component = new UserMessageComponent("你好 🧪 é — " + "message ".repeat(40));
  wrap(component, "user");
  for (const width of [40, 52, 80, 100, 101, 160]) {
    const frame = assertLane(component.render(width), width, true);
    assert.match(frame.at(-1)!, / 12:34:56 ─╯$/);
    assert(frame.join("\n").includes("你好"));
    assert(!component.render(width).join("\n").includes("\x1b[48;"), "native user background must not spill across the card");
  }
  for (const width of [0, 1, 2, 3, 5, 8, 12, 20]) {
    assert(component.render(width).every((line) => visibleWidth(line) <= width));
  }
});

test("assistant messages occupy the left half while streaming and rebuilding native content", () => {
  const first = assistant("First reply 中文 🧪");
  const component = new AssistantMessageComponent(first);
  wrap(component, "assistant");
  const frame = assertLane(component.render(100), 100, false);
  assert.match(frame.at(-1)!, /^╰─ 12:34:56 ─+╯$/);
  const next = { ...first, content: [{ type: "text" as const, text: "Updated reply\n\n```ts\nconst value = 42;\n```" }], timestamp: timestamp + 1000 };
  component.updateContent(next);
  (component as unknown as { setOutputPad?(padding: number): void }).setOutputPad?.(4);
  component.invalidate();
  const updated = assertLane(component.render(100), 100, false);
  assert(updated.join("\n").includes("Updated reply"));
  assert(updated.join("\n").includes("const value = 42;"));
  assert(updated.at(-1)!.includes("12:34:57"), "time must follow the persisted message timestamp");
  wrap(component, "assistant");
  assert.equal(component.render(100).filter((line) => line.includes("╭")).length, 1, "decorating twice must not nest frames");
  component.updateContent({ ...next, content: [{ type: "toolCall", id: "call", name: "bash", arguments: {} }], stopReason: "toolUse" });
  assert.deepEqual(component.render(100), [], "tool-call-only messages must not leave empty cards");
});

test("message frames preserve terminal zones, links and local mouse coordinates", () => {
  let clicked: unknown;
  const component = {
    render: (_width: number) => ["\x1b]133;A\x07", "\x1b]8;;https://example.com\x07link\x1b]8;;\x07", "\x1b]133;B\x07\x1b]133;C\x07"],
    handleMouse: (event: unknown) => { clicked = event; return { handled: true }; },
    invalidate() {},
  };
  wrap(component, "user");
  const rendered = component.render(100);
  assert(rendered[0].startsWith("\x1b]133;A\x07"));
  assert(rendered.at(-1)!.startsWith("\x1b]133;B\x07\x1b]133;C\x07"));
  assert(rendered[1].includes("\x1b]8;;https://example.com\x07"));
  assert.equal(rendered.join("\n").match(/133;A/g)?.length, 1);
  const mouse = component as unknown as { handleMouse(event: { x: number; y: number; width: number; height: number }): unknown };
  assert.deepEqual(mouse.handleMouse({ x: 52, y: 1, width: 100, height: 3 }), { handled: true });
  assert.deepEqual(clicked, { x: 0, y: 1, width: 45, height: 3 });
  clicked = undefined;
  assert.equal(mouse.handleMouse({ x: 1, y: 1, width: 100, height: 3 }), undefined);
  assert.equal(mouse.handleMouse({ x: 52, y: 0, width: 100, height: 3 }), undefined);
  assert.equal(clicked, undefined);
});

test("missing timestamps stay unknown and native error content is retained", () => {
  const component = new Text("Error: fixture failure", 0, 0);
  decorateMessage(component, { role: "assistant" }, () => theme);
  const rendered = component.render(80).join("\n");
  assert(rendered.includes("Error: fixture failure"));
  assert(rendered.includes("╰─ — "));
});
