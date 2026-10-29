// Validate transcript hooks through the installed Pi loader and native components.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import console from "node:console";
import process from "node:process";

process.env.FORCE_COLOR = "3";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let dist = dirname(realpathSync(execFileSync("which", ["pi"], { encoding: "utf8" }).trim()));
while (!existsSync(resolve(dist, "core/extensions/loader.js"))) {
  const parent = dirname(dist);
  assert.notEqual(parent, dist, "Cannot locate installed Pi");
  dist = parent;
}
const hostImport = (path) => import(pathToFileURL(resolve(dist, path)).href);
const { loadExtensions } = await hostImport("core/extensions/loader.js");
const { InteractiveMode, AssistantMessageComponent, UserMessageComponent, ExtensionRunner, initTheme, getMarkdownTheme } = await hostImport("index.js");
const { Container, visibleWidth } = await import(pathToFileURL(resolve(dist, "../node_modules/@earendil-works/pi-tui/dist/index.js")).href);
const { dispatchMouseEvent } = await import(pathToFileURL(resolve(dist, "../node_modules/@earendil-works/pi-tui/dist/tui.js")).href);
const themes = await hostImport("modes/interactive/theme/theme.js");
initTheme("dark");
const loaded = await loadExtensions([resolve(repo, "src/index.ts")], repo);
assert.deepEqual(loaded.errors, []);
const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, repo, {}, {});
const ctx = { hasUI: true, mode: "tui", ui: { get theme() { return themes.theme; } } };
// Only initialize the display bridge; no model calls, tool execution or custom UI startup.
await loaded.extensions[0].handlers.get("session_start")[0]({ type: "session_start", reason: "startup" }, ctx);
const timestamp = new Date(2026, 7, 4, 12, 34, 56).getTime();
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (content) => ({ role: "assistant", content, timestamp, api: "openai-completions", provider: "openai", model: "fixture", usage, stopReason: "stop" });
function host(extensions = loaded.extensions) {
  const mode = Object.create(InteractiveMode.prototype);
  Object.defineProperty(mode, "session", { value: { extensionRunner: extensions === loaded.extensions ? runner : { extensions }, retryAttempt: 0 } });
  return Object.assign(mode, {
    isInitialized: true,
    chatContainer: new Container(), outputPad: 3, pendingTools: new Map(),
    ui: { requestRender() {} }, footer: { invalidate() {} }, programStatus: { handleEvent() {} },
    getMarkdownThemeWithSettings: () => getMarkdownTheme(), getMarkdownTransformers: () => [],
    maybeShowThinkingDropNotice() {}, maybeShowCacheMissNotice() {},
    updatePendingMessagesDisplay() {}, hideThinkingBlock: false,
  });
}
function check(component, width, user, time = "12:34:56") {
  const rendered = component.render(width);
  const plain = rendered.map(stripVTControlCharacters).filter((line) => line.trim());
  const lane = Math.floor((width - 1) / 2);
  const offset = user ? width - 1 - lane : 0;
  assert(plain[0].trimStart().startsWith("╭─ "));
  assert(plain.every((line) => visibleWidth(line) === offset + lane));
  assert(plain.every((line) => line.length - line.trimStart().length === offset));
  assert(plain.at(-1).includes(time));
  if (user) assert(plain.at(-1).endsWith(` ${time} ─╯`));
  else assert(plain.at(-1).startsWith(`╰─ ${time} `));
  assert(rendered.at(-1).includes(themes.theme.fg("dim", time)));
  return rendered;
}
const capture = [];
for (const name of ["dark", "light", "catppuccin-dark"]) {
  if (name === "catppuccin-dark") themes.setThemeInstance(themes.loadThemeFromPath(resolve(repo, "themes/catppuccin-dark.json")));
  else initTheme(name);
  const mode = host();
  mode.addMessageToChat({ role: "user", content: "Message 中文 🧪 é\n\n" + "long content ".repeat(15), timestamp });
  const user = mode.chatContainer.children.at(-1);
  mode.addMessageToChat(assistant([{ type: "thinking", thinking: "Native thinking control" }, { type: "text", text: "**Reply** 中文 🧪 é\n\n```ts\nconst value = 42;\n```\n\n[Link](https://example.com)" }]));
  const reply = mode.chatContainer.children.at(-1);
  assert(reply instanceof AssistantMessageComponent, "native identity must survive framing");
  for (const width of [32, 40, 52, 80, 100, 101, 160]) {
    check(user, width, true);
    check(reply, width, false);
  }
  capture.push(name, ...user.render(100), ...reply.render(100), "");
  // Click the native thinking MouseRegion after translating the frame's padding and spacer.
  const before = stripVTControlCharacters(reply.render(100).join("\n"));
  const click = dispatchMouseEvent(reply, { type: "click", button: "left", x: 2, y: 2, screenX: 2, screenY: 2, width: 100, height: reply.render(100).length, shift: false, alt: false, ctrl: false });
  assert(click?.handled, "native thinking click must reach its control through the frame");
  const after = stripVTControlCharacters(reply.render(100).join("\n"));
  assert.notEqual(before, after);
  assert(after.includes("Thinking..."));
  reply.setHideThinkingBlock(false);
  check(reply, 100, false);
  user.setOutputPad(5);
  reply.setOutputPad(5);
  user.invalidate(); reply.invalidate();
  check(user, 80, true); check(reply, 80, false);
  const live = host();
  live.isInitialized = false;
  live.init = async () => { await Promise.resolve(); live.isInitialized = true; };
  await live.handleEvent({ type: "message_start", message: assistant([]) });
  assert.deepEqual(live.streamingComponent.render(100), []);
  await live.handleEvent({ type: "message_update", message: assistant([{ type: "text", text: "streaming reply" }]) });
  const streaming = live.streamingComponent;
  check(streaming, 100, false);
  await live.handleEvent({ type: "message_end", message: { ...assistant([{ type: "text", text: "completed reply" }]), timestamp: timestamp + 1000 } });
  assert.equal(live.streamingComponent, undefined);
  check(streaming, 100, false, "12:34:57");
  assert(stripVTControlCharacters(streaming.render(100).join("\n")).includes("completed reply"));
  const foreign = host([]);
  foreign.addMessageToChat({ role: "user", content: "unmodified session", timestamp });
  assert(!foreign.chatContainer.render(100).join("\n").includes("╭"), "sessions without pi-ui must retain native rendering");
}
// Native /reload replaces the runner and rebuilds history before session_start.
const beforeHook = InteractiveMode.prototype.addMessageToChat;
const resumed = host();
runner.setUIContext(resumed.createExtensionUIContext(), "tui");
let activeRunner = runner;
let activeContext = runner.createContext();
await loaded.extensions[0].handlers.get("session_start")[0]({ type: "session_start", reason: "startup" }, activeContext);
const history = [
  { role: "user", content: "Reloaded user", timestamp },
  assistant([{ type: "text", text: "Reloaded reply" }]),
];
for (const message of history) resumed.addMessageToChat(message);
for (let reload = 0; reload < 2; reload++) {
  // TUI repaints can still render the old transcript after its runner is invalidated.
  activeRunner.invalidate();
  assert.throws(() => activeContext.ui, /ctx is stale/);
  const retained = resumed.chatContainer.children.filter((component) => component instanceof AssistantMessageComponent || component instanceof UserMessageComponent);
  for (const width of [52, 100, 160]) {
    check(retained[0], width, true);
    check(retained[1], width, false);
  }
  const reloaded = await loadExtensions([resolve(repo, "src/index.ts")], repo);
  assert.deepEqual(reloaded.errors, []);
  activeRunner = new ExtensionRunner(reloaded.extensions, reloaded.runtime, repo, {}, {});
  activeRunner.setUIContext(resumed.createExtensionUIContext(), "tui");
  activeContext = activeRunner.createContext();
  resumed.session.extensionRunner = activeRunner;
  resumed.chatContainer.clear();
  for (const message of history) resumed.addMessageToChat(message);
  await reloaded.extensions[0].handlers.get("session_start")[0]({ type: "session_start", reason: "reload" }, activeContext);
  assert.equal(InteractiveMode.prototype.addMessageToChat, beforeHook);
  const [user, reply] = resumed.chatContainer.children.filter((component) => component.render(100).some((line) => stripVTControlCharacters(line).trim()));
  assert.equal(check(user, 100, true).filter((line) => line.includes("╭")).length, 1);
  assert.equal(check(reply, 100, false).filter((line) => line.includes("╭")).length, 1);
  resumed.addMessageToChat({ role: "user", content: "New message after reload", timestamp });
  check(resumed.chatContainer.children.at(-1), 100, true);
}
mkdirSync(resolve(repo, ".pi"), { recursive: true });
writeFileSync(resolve(repo, ".pi/message-cards-preview.ansi"), capture.join("\n"));
console.log("Installed Pi: left/right half-width cards, recorded corner timestamps, three themes, seven widths, native thinking clicks, streaming/final updates, output padding, unowned sessions, stale-context redraws and reload passed.");
console.log("Preview: .pi/message-cards-preview.ansi");
