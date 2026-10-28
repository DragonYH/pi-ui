// Run against the installed Pi so the real extension loader maps host modules.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import console from "node:console";
import process from "node:process";

// Enable the host's Chalk styles even when this test runs outside a terminal.
process.env.FORCE_COLOR = "3";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let dist = dirname(realpathSync(execFileSync("which", ["pi"], { encoding: "utf8" }).trim()));
while (!existsSync(resolve(dist, "core/extensions/loader.js"))) {
  const parent = dirname(dist);
  assert.notEqual(parent, dist, "Cannot locate the installed Pi SDK");
  dist = parent;
}
const hostImport = (path) => import(pathToFileURL(resolve(dist, path)).href);
const { loadExtensions } = await hostImport("core/extensions/loader.js");
const { ExtensionRunner, ToolExecutionComponent, initTheme, keyText } = await hostImport("index.js");
const { withBuiltInRenderers } = await hostImport("core/tools/renderers/index.js");
const { visibleWidth, setKeybindings } = await import(pathToFileURL(resolve(dist, "../node_modules/@earendil-works/pi-tui/dist/index.js")).href);
const { KeybindingsManager } = await hostImport("core/keybindings.js");
setKeybindings(new KeybindingsManager());
const themeModule = await hostImport("modes/interactive/theme/theme.js");
const { setThemeInstance, loadThemeFromPath } = themeModule;
initTheme("dark");

// Load only registrations from installed tools; never execute a tool or open its store.
mkdirSync(resolve(repo, ".pi"), { recursive: true });
const temporary = mkdtempSync(resolve(repo, ".pi/tool-card-renderers-"));
const optionalTools = [
  ["skill_manage", "pi-hermes-memory/src/tools/skill-tool.ts", "registerSkillTool", "pi, {}"],
  ["todo", "@juicesharp/rpiv-todo/todo.ts", "registerTodoTool", "pi"],
].filter(([, path]) => existsSync(resolve(homedir(), ".pi/agent/npm/node_modules", path)));
const fixture = resolve(temporary, "tools.ts");
writeFileSync(fixture, optionalTools.map(([, path, register], index) =>
  `import { ${register} as register${index} } from ${JSON.stringify(resolve(homedir(), ".pi/agent/npm/node_modules", path))};`,
).join("\n") + `\nexport default function(pi) { ${optionalTools.map(([, , , args], index) => `register${index}(${args});`).join(" ")} }\n`);
let loaded;
try {
  loaded = await loadExtensions([resolve(repo, "src/index.ts"), fixture], repo);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
const { extensions, errors, runtime } = loaded;
assert.deepEqual(errors, []);
assert.equal(extensions[0].toolRenderers.length, 1);
const tools = new Map(extensions.flatMap((extension) => [...extension.tools].map(([name, tool]) => [name, tool.definition])));
const runner = new ExtensionRunner(extensions, runtime, repo, {}, {});
const rendererFor = (name) => runner.resolveToolRenderers(name, () => tools.get(name) ?? withBuiltInRenderers(name));
assert.notEqual(rendererFor("edit"), withBuiltInRenderers("edit"), "native edit shares the card frame");
const ui = { requestRender() {} };
const capture = [];
const names = ["read", "write", "edit", "bash", "grep", "find", "ls", "hypa_read", ...optionalTools.map(([name]) => name)];
function assertAlignedColumns(rendered, width, label, time, expanded, keys = "ctrl+o") {
  const header = stripVTControlCharacters(rendered.find((line) => line.includes("╭")));
  const footer = stripVTControlCharacters(rendered.findLast((line) => line.includes("╯")));
  const columns = Math.max(13, visibleWidth(keys) + 7);
  assert(header.startsWith("╭─ ") && header.endsWith(" ─╮"), "the original title border must have no extra outer frame");
  assert.equal(visibleWidth(header), width - 1);
  assert.equal(visibleWidth(footer), width - 1);
  const badge = header.slice(-columns - 3, -3);
  const hint = footer.slice(-columns - 3, -3);
  assert.equal(visibleWidth(badge), columns);
  assert.equal(visibleWidth(hint), columns);
  assert.deepEqual(badge.split(" · ").map((field) => field.trim()), [label, time]);
  const action = hint.match(/^(.*?) +(expand|fold)$/);
  assert(action, "the footer contains only the configured shortcut and action");
  assert.equal(action[1], keys);
  assert.equal(action[2], expanded ? "fold" : "expand");
  assert.equal(header.at(-columns - 4), " ", "the status has one outer space on the left");
  assert.equal(footer.at(-columns - 4), " ", "the shortcut has one outer space on the left");
  assert.equal(visibleWidth(header.slice(0, -columns - 3)), visibleWidth(footer.slice(0, -columns - 3)), "status and shortcut must start in the same terminal column");
  assert.equal(visibleWidth(header.slice(0, -3)), visibleWidth(footer.slice(0, -3)), "duration and action must end in the same terminal column");
  assert(!footer.includes("lines") && !footer.includes("hidden"), "line counts must stay out of the footer");
}

for (const themeName of ["dark", "catppuccin-dark"]) {
  if (themeName === "catppuccin-dark") setThemeInstance(loadThemeFromPath(resolve(repo, "themes/catppuccin-dark.json")));
  for (const expanded of [false, true]) {
    for (const width of [52, 80, 120]) {
      const headers = ["pwd", "printf 中文 🧪", "echo ".repeat(40)].map((command, index) => {
        const tool = new ToolExecutionComponent("bash", `divider-${themeName}-${index}`, { command }, { showImages: false, outputPad: 1 }, rendererFor("bash"), ui, repo);
        tool.setArgsComplete();
        tool.markExecutionStarted();
        tool.updateResult({ content: [{ type: "text", text: "fixture output" }], details: {}, isError: false, durationMs: 1234 });
        tool.setExpanded(expanded);
        const rendered = tool.render(width);
        assert(rendered.every((line) => visibleWidth(line) <= width));
        assertAlignedColumns(rendered, width, "done", "1.2 s", expanded);
        const rawHeader = rendered.find((line) => line.includes("╭"));
        const header = stripVTControlCharacters(rawHeader);
        if (index === 0) {
          const commandColor = themeName === "dark" ? "syntaxVariable" : "mdCode";
          assert(rawHeader.includes(themeModule.theme.fg(commandColor, "$ pwd")), "native shell commands must use the cyan/teal command color");
          assert.notEqual(themeModule.theme.fg(commandColor, "$ pwd"), themeModule.theme.fg("text", "$ pwd"), "commands must remain distinct from output");
          assert.notEqual(themeModule.theme.fg(commandColor, "$ pwd"), themeModule.theme.fg("borderAccent", "$ pwd"), "commands must remain distinct from the frame");
        }
        if (width === 80 && !expanded) capture.push(...rendered, "");
        return header;
      });
      assert.match(headers[0], /\$ pwd ─{10,} done +· +1\.2 s/, "native short commands must leave a continuous divider");
      const dividers = headers.map((header) => header.match(/ (─+) done/)[1].length);
      assert(dividers[0] > dividers[1] && dividers[1] >= dividers[2], `${themeName}/${width}: native divider lengths do not follow visible command widths`);
      const statusColumns = headers.map((header) => visibleWidth(header.slice(0, header.indexOf("done"))));
      assert.equal(new Set(statusColumns).size, 1, "native status badges move with command length");
    }
  }
  for (const shortcut of ["ctrl+o", "ctrl+shift+o", "f8"]) {
    setKeybindings(new KeybindingsManager({ "app.tools.expand": shortcut }));
    const keys = keyText("app.tools.expand");
    const tool = new ToolExecutionComponent("bash", `aligned-${themeName}-${shortcut}`, { command: "printf 中文 🧪 é" }, { showImages: false, outputPad: 3 }, rendererFor("bash"), ui, repo);
    const finish = (durationMs, isError = false) => tool.updateResult({ content: [{ type: "text", text: "first\nlast" }], details: {}, isError, durationMs });
    const stages = [
      [() => {}, "preparing", "—"],
      [() => tool.setArgsComplete(), "queued", "—"],
      [() => tool.markExecutionStarted(), "running", "—"],
      [() => finish(0), "done", "0 ms"],
      [() => finish(100), "done", "100 ms"],
      [() => finish(999), "done", "999 ms"],
      [() => finish(999.9), "done", "1.0 s"],
      [() => finish(1234), "done", "1.2 s"],
      [() => finish(65_000), "done", "1m5s"],
      [() => finish(3_599_999), "done", "59m59s"],
      [() => finish(3_600_000), "done", "1h0m"],
      [() => finish(86_400_000), "done", "1d0h"],
      [() => finish(1300, true), "fail", "1.3 s"],
    ];
    for (const [update, label, time] of stages) {
      update();
      for (const expanded of [false, true, false]) {
        tool.setExpanded(expanded);
        for (const width of [40, 52, 100]) {
          assertAlignedColumns(tool.render(width), width, label, time, expanded, keys);
        }
      }
    }
    setKeybindings(new KeybindingsManager());
  }
  const edit = new ToolExecutionComponent("edit", `word-diff-${themeName}`, { path: "fixture.ts" }, { showImages: false, outputPad: 1 }, rendererFor("edit"), ui, repo);
  edit.setArgsComplete();
  edit.markExecutionStarted();
  edit.render(80);
  const diff = ' 1 const unchanged = 0;\n-2 const 中文 = "before";\n+2 const 中文 = "after";\n 3 console.log(中文);';
  edit.updateResult({ content: [{ type: "text", text: "Successfully replaced the fixture" }], details: { diff, firstChangedLine: 2 }, isError: false, durationMs: 1234 });
  for (const expanded of [false, true, false]) {
    edit.setExpanded(expanded);
    for (const width of [52, 80, 120]) {
      const rendered = edit.render(width);
      const text = rendered.join("\n");
      const plain = stripVTControlCharacters(text);
      assert(!text.includes("\x1b[48;") && !text.includes("\x1b[49m"), "native edit backgrounds must not form blocks");
      assert(!text.includes("\x1b[7m") && !text.includes("\x1b[27m"), "native changed words must not use inverse video");
      assert(text.includes("\x1b[4m") && text.includes("\x1b[24m"), "native changed words must remain underlined");
      assert(plain.includes('-2 const 中文 = "before";') && plain.includes('+2 const 中文 = "after";'), "word diff content was lost");
      assert(rendered.every((line) => visibleWidth(line) <= width));
      if (width === 80 && !expanded) capture.push(...rendered, "");
    }
  }
  for (const name of names) {
    const args = name === "bash" ? { command: "npm test\nprintf '中文测试 🧪'\nprintf 'third line'\nprintf 'fourth line'" }
      : name === "skill_manage" ? { action: "view", skill_id: "fixture:display" }
      : name === "todo" ? { action: "update", id: 1, status: "completed" }
      : { path: "src/tool-cards.ts", pattern: "render", content: Array.from({ length: 30 }, (_, i) => `const line${i} = ${i};`).join("\n") };
    const tool = new ToolExecutionComponent(name, `fixture-${themeName}-${name}`, args, { showImages: false, outputPad: 1 }, rendererFor(name), ui, repo);
    tool.setArgsComplete();
    tool.markExecutionStarted();
    const pending = stripVTControlCharacters(tool.render(100).join("\n"));
    assert(pending.includes("running"));
    assert.equal(pending.match(/ctrl\+o/g)?.length, 1, `${name} repeats its pending shortcut`);
    const content = Array.from({ length: 50 }, (_, i) => `${i}: const 中文${i} = "🧪";`).join("\n");
    const details = name === "edit" ? { diff: Array.from({ length: 50 }, (_, i) => `+${i + 1} const 中文${i} = "🧪";`).join("\n"), firstChangedLine: 1 }
      : name === "todo" ? { action: "update", params: args, tasks: [{ id: 1, subject: "fixture", status: "completed" }] } : {};
    tool.updateResult({ content: [{ type: "text", text: content }], details, isError: false, durationMs: 1234 });
    const compact = stripVTControlCharacters(tool.render(100).join("\n"));
    assert(compact.includes("╭"), `${name} lost its frame`);
    assert(compact.includes("done"), `${name} lost its final status`);
    assert(compact.includes("1.2 s"), `${name} lost its recorded duration`);
    assert.equal(compact.match(/ctrl\+o/g)?.length, 1, `${name} repeats its shortcut`);
    const summary = compact.match(/… (\d+)\+ lines hidden/);
    if (summary) {
      assert(Number(summary[1]) <= 50, `${name} counts input arguments as hidden output`);
      assert(compact.split("\n").some((line) => line.startsWith("│ ") && line.includes(summary[0])), `${name} omission hints must stay in the body`);
    }
    if (name === "bash") assert(compact.indexOf("lines hidden") < compact.indexOf('46: const'), "hidden shell output must be marked before the tail preview");
    if (name === "read") {
      const header = tool.render(100).find((line) => line.includes("╭"));
      assert(header.includes(themeModule.theme.fg("mdHeading", themeModule.theme.bold("read")) + themeModule.theme.fg("muted", " src/tool-cards.ts")), "native tool labels and paths must have separate heading and argument colors");
    }
    if (name === "edit") assert(compact.includes("中文0"), "collapsed edit retains a diff preview");
    if (name === "todo") assert(compact.includes("completed"), "todo retains its native status");
    assert(tool.render(100).length <= 11, `${name} has an oversized collapsed card`);
    capture.push(...tool.render(100), "");
    for (const expanded of [true, false, true]) {
      tool.setExpanded(expanded);
      for (const width of [1, 8, 20, 40, 100, 160]) {
        const rendered = tool.render(width);
        const plain = stripVTControlCharacters(rendered.join("\n"));
        assert(rendered.every((line) => visibleWidth(line) <= width), `${themeName}/${name} overflowed width ${width}`);
        if (width >= 6) {
          const frame = rendered.map(stripVTControlCharacters).filter((line) => /^ *[╭│╰]/.test(line));
          assert(frame.length > 0 && frame.every((line) => /^[╭│╰]/.test(line) && /[╮│╯]$/.test(line) && visibleWidth(line) === width - 1), `${themeName}/${name}: card borders must stay flush left and leave the scrollbar column clear`);
        }
        if (width >= 40) {
          assert.equal(plain.match(/ctrl\+o/g)?.length, 1, `${name} repeats its shortcut at ${width}`);
          const footer = stripVTControlCharacters(rendered.findLast((line) => line.includes("╯")));
          assert.match(footer, new RegExp(`^╰─+ ctrl\\+o +${expanded ? "fold" : "expand"} ─╯$`), `${name} footer contains extra content or is not aligned`);
          if (expanded) assert(!plain.includes("lines hidden"), `${name} retains an omission hint after expanding`);
        }
        if (expanded && !["write", "todo"].includes(name) && width >= 100) assert(plain.includes("中文49"), `${name} failed to expand`);
      }
    }
    tool.setExpanded(false);
    tool.render(100);
    assert.equal(tool.handleMouse({ type: "click", button: "left", x: 4, y: 1, width: 100, height: 50 })?.handled, true);
    assert.match(stripVTControlCharacters(tool.render(100).join("\n")), /ctrl\+o +fold/);
    tool.updateResult({ content: [{ type: "text", text: "Error: fixture execution failed\ncheck the supplied path" }], details: {}, isError: true, durationMs: 1300 });
    tool.setExpanded(false);
    const error = stripVTControlCharacters(tool.render(100).join("\n"));
    assert.match(error, / fail +· +1\.3 s ─╮/);
    assert(error.includes("Error: fixture execution failed"));
  }
}
writeFileSync(resolve(repo, ".pi/tool-cards-preview.ansi"), capture.join("\n"));
console.log(`Installed Pi: ${names.join(", ")}; two themes, streaming/final/error states, compact 13-column status/shortcut areas, body-only omission hints, fail/done labels, custom keybindings, adaptive header dividers, flush-left borders with scrollbar clearance, layered tool/command/argument colors, transparent underlined edit diffs, one right-aligned hint, expand/collapse, and six terminal widths passed.`);
console.log("Preview: .pi/tool-cards-preview.ansi");
process.exitCode = 0;
