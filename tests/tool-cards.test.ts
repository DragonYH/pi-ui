import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { ExtensionAPI, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Text, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { registerToolCards, resolveToolCard, type ToolCardContext, type ToolCardResolver } from "../src/tool-cards.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
function context(overrides: Partial<ToolCardContext> = {}): ToolCardContext {
  return {
    args: { path: "src/中文-🧪.ts" }, toolCallId: "fixture", invalidate() {}, lastComponent: undefined,
    state: {}, cwd: "/work", executionStarted: true, argsComplete: true, isPartial: false,
    expanded: false, showImages: true, isError: false, ...overrides,
  };
}
function fixture(name: string, text: string, overrides: Parameters<typeof context>[0] = {}) {
  const renderer = resolveToolCard(name, () => undefined)!;
  let ctx = context(overrides);
  let call = renderer.renderCall!(ctx.args, theme, ctx);
  let result: Component | undefined;
  const content = [{ type: "text" as const, text }];
  function update(changes: Parameters<typeof context>[0] = {}) {
    ctx = { ...ctx, ...changes, lastComponent: call };
    call = renderer.renderCall!(ctx.args, theme, ctx);
    result = renderer.renderResult!({ content, details: {} }, { expanded: ctx.expanded, isPartial: ctx.isPartial }, theme, { ...ctx, lastComponent: result });
  }
  update();
  return { update, render: (width = 100) => [...call.render(width), ...result!.render(width)], call: () => call, result: () => result! };
}

test("tool cards keep the left edge flush and reserve a column for the scrollbar", () => {
  const item = fixture("hypa_read", "中文测试🧪 é " + "x".repeat(300), { args: { path: "文件夹/中文🧪.ts", offset: 10, limit: 20 }, durationMs: 1234 });
  for (const outputPad of [0, 1, 3]) {
    for (const width of [0, 1, 2, 5, 8, 12, 20, 40, 80, 120]) {
      for (const expanded of [false, true]) {
        item.update({ expanded, outputPad });
        const lines = item.render(width);
        assert(lines.every((line) => visibleWidth(line) <= width), `overflow at ${width}, expanded=${expanded}`);
        if (width >= 6) {
          assert(lines.every((line) => visibleWidth(line) === width - 1 && /^[╭│╰]/.test(line) && /[╮│╯]$/.test(line)), "the frame stays flush left and leaves the scrollbar column clear");
        }
      }
    }
  }
  assert(item.render().join("\n").includes("1.2 s"));
  assert(item.render().join("\n").includes("文件夹/中文🧪.ts"));
  const colored = { ...theme, fg: (_color: string, text: string) => `\x1b[36m${text}\x1b[39m` } as Theme;
  const renderer = resolveToolCard("search", () => undefined)!;
  const ctx = context();
  const call = renderer.renderCall!(ctx.args, colored, ctx);
  assert(call.render(40).every((line) => visibleWidth(line) <= 40));
});

test("collapsed output is bounded by visual rows and expanding reveals the full result", () => {
  const output = Array.from({ length: 2000 }, (_, index) => `row-${index}: ${"x".repeat(1000)}`).join("\n");
  const item = fixture("search", output);
  assert(item.result().render(80).length <= 6);
  assert(item.render(80).join("\n").includes("lines hidden"));
  assert(!item.render(80).join("\n").includes("2000 lines"));
  assert(!item.render(80).join("\n").includes("row-1999"));
  const original = item.call();
  item.update({ expanded: true });
  assert.equal(item.call(), original, "the component is reused");
  assert(item.render(80).join("\n").includes("row-1999"));
  item.update({ expanded: false });
  assert(item.result().render(80).length <= 6);
});

test("shell previews mark hidden earlier output and successful reads retain a body hint", () => {
  const output = Array.from({ length: 20 }, (_, index) => `row-${index}`).join("\n");
  const shell = fixture("bash", output, { args: { command: "npm test" } });
  assert(shell.render().join("\n").includes("row-19"));
  assert(!shell.render().join("\n").includes("row-0"));
  assert(shell.result().render(100)[0].includes("16+ lines hidden"), "the hidden prefix appears above a shell tail preview");
  shell.update({ isError: true });
  assert(shell.render().join("\n").includes("row-0"), "shell errors show the start of the failure");
  assert(shell.result().render(100).at(-2)!.includes("16+ lines hidden"), "hidden error rows follow the head preview");
  const read = fixture("read", output);
  assert.equal(read.result().render(100).length, 2);
  assert(read.result().render(100)[0].includes("20+ lines hidden"));
  assert(!read.render().join("\n").includes("20 lines"));
  read.update({ isError: true });
  assert(read.render().join("\n").includes("row-0"));
  assert(read.render().join("\n").includes("fail"));
});

test("cards distinguish preparing, queued, running, success and failure without timers", () => {
  const renderer = resolveToolCard("unknown", () => undefined)!;
  for (const [overrides, expected] of [
    [{ isPartial: true, executionStarted: false, argsComplete: false }, "preparing"],
    [{ isPartial: true, executionStarted: false }, "queued"],
    [{ isPartial: true }, "running"],
    [{ isPartial: false }, "done"],
    [{ isPartial: false, isError: true }, "fail"],
  ] as const) {
    const ctx = context(overrides);
    const component = renderer.renderCall!(ctx.args, theme, ctx);
    for (const width of [42, 80, 100]) {
      const lines = component.render(width);
      assert.match(lines[0], new RegExp(` ─+ ${expected} `));
      assert(stripVTControlCharacters(lines[0]).startsWith("╭─ "), "the title stays in the original top border without an extra outer frame");
      assert(stripVTControlCharacters(lines[0]).endsWith(" ─╮"), "the top-right corner connects to a horizontal stroke");
      assert(lines.every((line) => visibleWidth(line) <= width));
      assert(lines.at(-1)!.includes("╰"), "pending cards close before a result arrives");
    }
  }
});

test("tool labels, commands, arguments, output and frames have distinct colors", () => {
  const palette: Record<string, number> = { text: 37, success: 32, borderAccent: 35, accent: 35, mdHeading: 33, mdCode: 36, syntaxVariable: 34, muted: 90 };
  const colored = {
    ...theme,
    fg: (color: string, text: string) => `\x1b[${palette[color] ?? 37}m${text}\x1b[39m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
  } as Theme;
  const link = "\x1b]8;;file:///work/file.ts\x1b\\file.ts\x1b]8;;\x1b\\";
  for (const expanded of [false, true]) {
    for (const sample of [
      { name: "read", native: `\x1b[35m\x1b[1mread\x1b[22m ${link}\x1b[39m`, expected: `\x1b[33m\x1b[1mread\x1b[22m\x1b[39m\x1b[90m ${link}\x1b[39m` },
      { name: "bash", native: "\x1b[35m\x1b[1m$ pwd\nnext command\x1b[22m\x1b[39m", expected: "\x1b[36m$ pwd\x1b[39m" },
      { name: "write", native: "\x1b[35mwrite file.ts\x1b[39m\n\n\x1b[32mconst value = 1;\x1b[39m", expected: "\x1b[33m\x1b[1mwrite\x1b[22m\x1b[39m\x1b[90m file.ts\x1b[39m" },
      { name: "hypa_read", native: undefined, expected: "\x1b[33m\x1b[1mhypa_read\x1b[22m\x1b[39m" },
    ]) {
      const renderer = resolveToolCard(sample.name, () => sample.native === undefined ? undefined : {
        renderCall: () => new Text(sample.native!, 0, 0),
      })!;
      const ctx = context({ expanded });
      const lines = renderer.renderCall!(ctx.args, colored, ctx).render(100);
      assert(lines[0].includes(sample.expected), `${sample.name} title should use its own color hierarchy`);
      assert(lines[0].includes("\x1b[35m╭"), "the frame keeps its accent color");
      assert(lines[0].includes("\x1b[32mdone"), "the status keeps its semantic color");
      if (sample.name === "bash") assert(lines.some((line) => line.includes("\x1b[36mnext command\x1b[39m")), "command continuation rows keep the command color");
      if (sample.name === "write") assert(lines.some((line) => line.includes("\x1b[32mconst value = 1;\x1b[39m")), "write previews keep their syntax colors");
    }
  }
});

test("header dividers fill the gap after padded titles without leaking native styles", () => {
  for (const background of [false, true]) {
    const renderer = resolveToolCard("bash", () => ({
      renderCall(args) {
        const command = (args as { command: string }).command;
        return new Text(`\x1b[32m$ ${command}\x1b[39m`, 0, 0,
          background ? (line) => `\x1b[44m${line}\x1b[49m` : undefined);
      },
    }))!;
    for (const width of [52, 80, 120]) {
      const headers = ["pwd", "printf 中文 🧪", "echo ".repeat(40)].map((command) => {
        const ctx = context({ args: { command }, durationMs: 1234 });
        const line = renderer.renderCall!(ctx.args, theme, ctx).render(width)[0];
        assert(!line.includes("\x1b[44m") && !line.includes("\x1b[32m"), "native title colors do not leak into the card header");
        const plain = stripVTControlCharacters(line);
        assert.equal(visibleWidth(plain), width - 1);
        return plain;
      });
      assert.match(headers[0], /\$ pwd ─{10,} done +· +1\.2 s/);
      const dividers = headers.map((line) => line.match(/ (─+) done/)![1].length);
      assert(dividers[0] > dividers[1], "shorter commands leave a longer divider");
      assert(dividers[1] >= dividers[2], "word wrapping can leave medium and long titles at the same visible width");
      const statusColumns = headers.map((line) => visibleWidth(line.slice(0, line.indexOf("done"))));
      assert.equal(new Set(statusColumns).size, 1, "status stays in the same column");
    }
  }
});

test("status and shortcut fields share fixed display columns across states and durations", () => {
  const cases: { overrides: Partial<ToolCardContext>; label: string; time: string }[] = [
    { overrides: { isPartial: true, executionStarted: false, argsComplete: false }, label: "preparing", time: "—" },
    { overrides: { isPartial: true, executionStarted: false }, label: "queued", time: "—" },
    { overrides: { isPartial: true }, label: "running", time: "—" },
    { overrides: { durationMs: 0 }, label: "done", time: "0 ms" },
    { overrides: { durationMs: 100 }, label: "done", time: "100 ms" },
    { overrides: { durationMs: 999 }, label: "done", time: "999 ms" },
    { overrides: { durationMs: 999.9 }, label: "done", time: "1.0 s" },
    { overrides: { durationMs: 1234 }, label: "done", time: "1.2 s" },
    { overrides: { isError: true, durationMs: 65_000 }, label: "fail", time: "1m5s" },
    { overrides: { durationMs: 3_599_999 }, label: "done", time: "59m59s" },
    { overrides: { durationMs: 3_600_000 }, label: "done", time: "1h0m" },
    { overrides: { durationMs: 86_400_000 }, label: "done", time: "1d0h" },
    ...[-1, NaN, Infinity].map((durationMs) => ({ overrides: { durationMs }, label: "done", time: "—" })),
  ];
  for (const { overrides, label, time } of cases) {
    for (const command of ["pwd", "printf 中文 🧪 é ".repeat(8)]) {
      const item = fixture("external", "first\nlast", { args: { command }, ...overrides });
      for (const expanded of [false, true, false]) {
        item.update({ expanded });
        for (const width of [26, 33, 40, 52, 80, 120]) {
          const lines = item.render(width).map(stripVTControlCharacters);
          const header = lines[0];
          const footer = lines.at(-1)!;
          const badge = header.slice(-16, -3);
          const hint = footer.slice(-16, -3);
          assert.equal(visibleWidth(badge), 13);
          assert.equal(visibleWidth(hint), 13);
          assert.deepEqual(badge.split(" · ").map((field) => field.trim()), [label, time]);
          const action = expanded ? "fold" : hint.startsWith("click to") ? "open" : "expand";
          assert.match(hint, new RegExp(`^(?:ctrl\\+o|click to) +${action}$`));
          assert.equal(visibleWidth(header.slice(0, -16)), visibleWidth(footer.slice(0, -16)), "status and shortcut start in the same display column");
          assert.equal(visibleWidth(header.slice(0, -3)), visibleWidth(footer.slice(0, -3)), "duration and action end in the same display column");
          assert.equal(header.at(-17), " ", "the status has one outer space on the left");
          assert.equal(footer.at(-17), " ", "the shortcut has one outer space on the left");
          assert(lines.every((line) => visibleWidth(line) === width - 1));
        }
      }
      const pendingRenderer = resolveToolCard("external", () => undefined)!;
      const pendingContext = context({ args: { command }, ...overrides });
      const pending = pendingRenderer.renderCall!(pendingContext.args, theme, pendingContext).render(80).map(stripVTControlCharacters);
      assert.equal(visibleWidth(pending[0].slice(0, -16)), visibleWidth(pending.at(-1)!.slice(0, -16)), "pending cards use the same shortcut column");
    }
  }
});

test("edit previews use transparent backgrounds and underline changed words", () => {
  const nativeCall = new Box(0, 1, (line) => `\x1b[44m${line}\x1b[49m`);
  nativeCall.addChild(new Text("edit file.ts\n\x1b[31m-1 const value = \x1b[7mbefore\x1b[27m;\x1b[39m\n\x1b[32m+1 const value = \x1b[7mafter\x1b[27m;\x1b[39m", 0, 0));
  const renderer = resolveToolCard("edit", () => ({
    renderCall: () => nativeCall,
    renderResult() {
      // Native completion rebuilds the call component and restores its background.
      nativeCall.setBgFn((line) => `\x1b[42m${line}\x1b[49m`);
      return new Text("\x1b[32m+2 \x1b[7mextra\x1b[27m\x1b[39m", 0, 0);
    },
  }))!;
  for (const expanded of [false, true, false]) {
    const ctx = context({ expanded });
    const call = renderer.renderCall!({}, theme, ctx);
    const result = renderer.renderResult!({ content: [], details: {} }, { expanded, isPartial: false }, theme, ctx);
    for (const width of [40, 80, 120]) {
      const lines = [...call.render(width), ...result.render(width)];
      const text = lines.join("\n");
      assert(!text.includes("\x1b[44m") && !text.includes("\x1b[42m"), "native backgrounds do not form blocks inside the frame");
      assert(!text.includes("\x1b[7m") && !text.includes("\x1b[27m"), "changed words do not use inverse video");
      assert(text.includes("\x1b[4mbefore\x1b[24m") && text.includes("\x1b[4mafter\x1b[24m"));
      assert(text.includes("\x1b[4mextra\x1b[24m"), "result components use the same change styling");
      assert(text.includes("\x1b[31m") && text.includes("\x1b[32m"), "added and removed line colors survive");
      assert(lines.every((line) => visibleWidth(line) <= width));
    }
  }
});

test("all tool renderers share a frame while native state and components survive toggles", () => {
  const specialized = { renderShell: "self" as const, renderCall: () => new Text("diff", 0, 0) };
  const edit = resolveToolCard("edit", () => specialized)!;
  assert.notEqual(edit, specialized);
  assert(edit.renderCall!({}, theme, context()).render(80).join("\n").includes("╭─ ✓ diff"));
  const args = { command: "run" };
  const shared = {};
  const nativeCall = new Text("$ run", 0, 0);
  const nativeResult = new Text("highlighted result", 0, 0);
  let previousResult: Component | undefined;
  let calls = 0;
  const renderer = resolveToolCard("bash", () => ({
    renderCall(received, _theme, ctx) {
      assert.equal(received, args);
      assert.equal(ctx.state, shared);
      assert.equal(ctx.expanded, true, "only the outer card owns expansion hints");
      assert.equal(ctx.lastComponent, calls++ ? nativeCall : undefined);
      return nativeCall;
    },
    renderResult(_result, options, _theme, ctx) {
      assert.equal(options.expanded, true);
      assert.equal(ctx.expanded, true);
      assert.equal(ctx.state, shared);
      assert.equal(ctx.lastComponent, previousResult);
      previousResult = nativeResult;
      return nativeResult;
    },
  }))!;
  const ctx = context({ args, state: shared });
  const call = renderer.renderCall!(args, theme, ctx);
  renderer.renderCall!(args, theme, { ...ctx, lastComponent: call });
  const data = { content: [{ type: "text" as const, text: "raw result" }], details: {} };
  let result: Component | undefined;
  result = renderer.renderResult!(data, { expanded: true, isPartial: true }, theme, { ...ctx, isPartial: true });
  assert.equal(previousResult, undefined, "live cards do not start native polling timers");
  assert(result.render(80).join("\n").includes("raw result"));
  for (const expanded of [true, false, true]) {
    result = renderer.renderResult!(data, { expanded, isPartial: false }, theme, { ...ctx, expanded, lastComponent: result });
    assert(result.render(80).join("\n").includes(expanded ? "highlighted result" : "raw result"));
  }
});

test("borders use the brighter accent and expansion hints only appear once at the bottom", () => {
  const colors: string[] = [];
  const colored = { ...theme, fg(color: string, text: string) { colors.push(color); return text; } } as Theme;
  for (const name of ["edit", "todo", "skill_manage", "other_extension"]) {
    const renderer = resolveToolCard(name, () => ({
      renderShell: "self",
      renderCall(_args, _theme, ctx) {
        return new Text(ctx.expanded ? `${name}\nargument one\nargument two\nargument three` : `${name}\nctrl+o expand`, 0, 0);
      },
      renderResult(_result, options) {
        return new Text(options.expanded ? "native summary\n+ added line\n- removed line\nthird\nfourth" : "ctrl+o expand", 0, 0);
      },
    }))!;
    for (const expanded of [false, true]) {
      const ctx = context({ expanded });
      const call = renderer.renderCall!({}, colored, ctx);
      const pending = call.render(80).join("\n");
      assert.equal(pending.match(/ctrl\+o|click to/g)?.length, 1);
      const result = renderer.renderResult!({ content: [{ type: "text", text: "raw output" }], details: {} }, { expanded, isPartial: false }, colored, ctx);
      const lines = [...call.render(80), ...result.render(80)];
      const text = lines.join("\n");
      assert(text.includes("native summary"));
      assert(text.includes("+ added line"), "native diffs are retained");
      assert(!text.includes("raw output"));
      assert.equal(text.match(/ctrl\+o|click to/g)?.length, 1);
      assert(lines.at(-1)!.includes(expanded ? "fold" : "open"));
      assert(result.render(80).length <= 6);
    }
  }
  assert(colors.includes("borderAccent"));
  assert(!colors.includes("border"));
  assert(colors.includes("dim"), "the shortcut uses the theme's lowest-contrast text color");
});

test("only the shortcut stays in the footer and hidden output counts stay in the body", () => {
  const item = fixture("external", Array.from({ length: 20 }, (_, index) => `row-${index}`).join("\n"), { args: { command: "input argument\n".repeat(50) } });
  for (const expanded of [false, true]) {
    item.update({ expanded });
    for (const width of [40, 80, 120]) {
      const lines = item.render(width);
      const footer = stripVTControlCharacters(lines.at(-1)!);
      assert.equal(visibleWidth(footer), width - 1);
      assert.match(footer, new RegExp(`^╰─+ (?:ctrl\\+o|click to) +${expanded ? "fold" : "(?:expand|open)"} ─╯$`));
      assert(!footer.includes("lines") && !footer.includes("hidden"));
      assert.equal(lines.slice(0, -1).join("\n").match(/ctrl\+o|click to/g), null);
      const hidden = lines.filter((line) => line.includes("lines hidden"));
      assert.equal(hidden.length, expanded ? 0 : 1);
      if (!expanded) assert(hidden[0].startsWith("│ ") && hidden[0].includes("16+ lines hidden"), "input argument rows do not count as hidden output");
      assert(!lines.join("\n").includes("20 lines"));
    }
  }
  const renderer = resolveToolCard("edit", () => ({ renderCall: () => new Text("edit file.ts\n" + "+ changed\n".repeat(10), 0, 0) }))!;
  const ctx = context();
  const call = renderer.renderCall!({}, theme, ctx);
  assert(call.render(80).join("\n").includes("6+ lines hidden"), "pending edit previews retain their omission hint");
  const result = renderer.renderResult!({ content: [], details: {} }, { expanded: false, isPartial: false }, theme, ctx);
  assert.equal([...call.render(80), ...result.render(80)].filter((line) => line.includes("6+ lines hidden")).length, 1, "completed edit cards show only one omission hint");
});

test("framed interactive renderers retain controls, keyboard focus, and mouse coordinates", () => {
  let clicked: unknown;
  let input = "";
  const native = {
    focused: false, wantsKeyRelease: true,
    render: () => ["", "choose an option", "one", "two", "three", "four", "five", ""],
    invalidate() {}, handleInput(data: string) { input = data; },
    handleMouse(event: unknown) { clicked = event; return { handled: true, focus: true }; },
  };
  const renderer = resolveToolCard("question", () => ({ renderCall: () => native, renderResult: () => native }))!;
  const ctx = context();
  const call = renderer.renderCall!({}, theme, ctx);
  const result = renderer.renderResult!({ content: [], details: {} }, { expanded: false, isPartial: false }, theme, ctx);
  type Interactive = Component & { focused: boolean; handleMouse(event: { x: number; y: number; width: number; height: number }): unknown };
  for (const [component, row] of [[call, 1], [result, 0]] as const) {
    const card = component as Interactive;
    assert(card.render(80).join("\n").includes("five"), "controls are never clipped by the preview");
    assert.deepEqual(card.handleMouse({ x: 5, y: row, width: 80, height: 20 }), { handled: true, focus: true });
    assert.deepEqual(clicked, { x: 3, y: 1, width: 75, height: 8 });
    card.handleInput!("enter");
    assert.equal(input, "enter");
    card.focused = true;
    assert.equal(native.focused, true);
    assert.equal(card.wantsKeyRelease, true);
    assert.equal(card.handleMouse({ x: 0, y: row, width: 80, height: 20 }), undefined, "frame clicks remain available for expansion");
  }
});

test("truncation, image fallback and errors remain visible; raw controls are removed", () => {
  const renderer = resolveToolCard("external", () => undefined)!;
  const ctx = context({ showImages: false, isError: true });
  const component = renderer.renderResult!({
    content: [
      { type: "text", text: "first\n\x1b[2J\x1b]0;injected\x07ERROR\x00\nlast" },
      { type: "image", data: "", mimeType: "image/png" },
    ], details: { truncation: { truncated: true }, matchLimitReached: 100, linesTruncated: true, fullOutputPath: "/tmp/full.log" },
  }, { expanded: false, isPartial: false }, theme, ctx);
  const text = component.render(100).join("\n");
  assert(!text.includes("\x1b"));
  assert(!text.includes("\x00"));
  assert(text.includes("ERROR"));
  assert(text.includes("1 image"));
  assert(text.includes("output truncated"));
  assert(text.includes("/tmp/full.log"));
  assert(text.includes("100 matches limit"));
  assert(text.includes("some lines truncated"));
  assert.equal(stripVTControlCharacters(text), text);
});

test("partial content mutations update previews, and registration safely skips older SDKs", () => {
  const renderer = resolveToolCard("external", () => undefined)!;
  const ctx = context({ isPartial: true });
  const content = [{ type: "text" as const, text: "progress 1" }];
  const details = {};
  const first = renderer.renderResult!({ content, details }, { expanded: false, isPartial: true }, theme, ctx);
  content[0].text = "progress 2";
  const second = renderer.renderResult!({ content, details }, { expanded: false, isPartial: true }, theme, { ...ctx, lastComponent: first });
  assert.equal(first, second);
  assert(second.render(80).join("\n").includes("progress 2"));
  content[0].text = "final progress 3";
  const final = renderer.renderResult!({ content, details }, { expanded: false, isPartial: false }, theme, { ...ctx, isPartial: false, lastComponent: second });
  assert(final.render(80).join("\n").includes("final progress 3"), "final content may reuse the partial content array");
  assert.equal(registerToolCards({} as ExtensionAPI), false);
  let registered: ToolCardResolver | undefined;
  assert.equal(registerToolCards({ registerToolRenderer(resolver: ToolCardResolver) { registered = resolver; } } as unknown as ExtensionAPI), true);
  assert.equal(registered, resolveToolCard);
});
