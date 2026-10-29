import assert from "node:assert/strict";
import { homedir } from "node:os";
import { test } from "node:test";
import { createExtensionRuntime, ExtensionRunner } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { StartupController, type StartupExtension, type StartupHandler } from "../src/startup/controller.ts";
import { installNativeStartup } from "../src/startup/native.ts";
import { getStartupProgress, startupDurationForLabel, startupEntryDuration } from "../src/startup/progress.ts";
import { renderStartupProgress } from "../src/startup/view.ts";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const startupEvent = { type: "session_start", reason: "startup" } as const;
function extension(path: string, handlers: StartupHandler[] = []): StartupExtension {
  return { path, handlers: new Map([["session_start", handlers]]), messageRenderers: new Map() };
}

function fixture(extensions: StartupExtension[], owner: StartupExtension, hasUI = true, mode = hasUI ? "tui" : "print") {
  const renderer = () => {};
  owner.messageRenderers!.set("assistant", renderer);
  const manager = {};
  // Exercise the real SDK emitter, including its handler snapshot and error dispatch.
  const runner = Reflect.construct(ExtensionRunner, [extensions, createExtensionRuntime(), "/work", manager, {}]) as ExtensionRunner;
  const ctx = { hasUI, mode };
  Object.defineProperty(runner, "createContext", { value: () => ctx });
  const headerContainer = { children: [] as { render(width: number): string[] }[] };
  let firstFrame = "";
  const prototype = {
    async init() {
      firstFrame = headerContainer.children.flatMap((component) => component.render(120)).join("\n");
      await this.rebindCurrentSession();
    },
    async rebindCurrentSession() { await runner.emit(startupEvent); },
  };
  const host = Object.assign(Object.create(prototype), {
    session: { extensionRunner: runner, sessionManager: manager },
    headerContainer,
    ui: { requestRender() {}, terminal: { rows: 40 } },
    shouldShowStartupHeader: () => true,
  }) as typeof prototype & { shouldShowStartupHeader(): boolean };
  installNativeStartup(ExtensionRunner.prototype, prototype, renderer);
  return { runner, host, ctx, firstFrame: () => firstFrame, headerContainer };
}

test("native Pi's first frame shows progress and pi-ui initializes before an earlier slow extension", async () => {
  const order: string[] = [];
  const owner = extension("/work/pi-ui.ts", [async () => { order.push("ui"); }]);
  const slowHandlers = [async (_event: unknown, ctx: unknown) => {
    assert.equal(ctx, setup.ctx);
    order.push("slow-1");
    await pause(100);
  }, async () => { order.push("slow-2"); await pause(15); }];
  const slow = extension("/work/slow.ts", slowHandlers);
  const empty = extension("/work/empty.ts");
  const setup = fixture([slow, owner, empty], owner);
  const snapshots: ReturnType<StartupController["snapshot"]>[] = [];
  owner.handlers.get("session_start")!.unshift(() => {
    getStartupProgress()!.subscribe(() => snapshots.push(getStartupProgress()!.snapshot()));
  });
  try {
    await setup.host.init();
    assert(setup.firstFrame().includes("━"), "native ui.start must already have the animated logo");
    assert(!setup.firstFrame().includes("Pi can explain"));
    assert.deepEqual(order, ["ui", "slow-1", "slow-2"]);
    assert.equal(slow.handlers.get("session_start"), slowHandlers, "registered handlers remain untouched");
    assert.equal(Reflect.get(setup.runner, "extensions")[0], slow, "other event ordering remains untouched");
    assert(snapshots.some((snapshot) => snapshot.entries.length === 1 && snapshot.entries[0].name === "pi-ui"));
    assert(snapshots.some((snapshot) => snapshot.entries.some((entry) => entry.name === "slow" && entry.state === "initializing")));
    const final = getStartupProgress()!.snapshot();
    assert.equal(final.phase, "ready");
    assert.equal(final.entries.find((entry) => entry.name === "empty")?.initializeMs, 0);
    assert(final.entries.find((entry) => entry.name === "slow")!.initializeMs! >= 100);
    assert(final.frame > 0);
    await pause(90);
    assert.equal(getStartupProgress()!.snapshot().frame, final.frame);
    assert.equal(setup.headerContainer.children.length, 0, "temporary component is released");
    assert.equal(setup.host.shouldShowStartupHeader(), true);
  } finally { await setup.runner.emit({ type: "session_shutdown", reason: "quit" }); }
  assert.equal(getStartupProgress(), undefined);
});

test("native error reporting, later handlers, ordinary event order, and reload are preserved", async () => {
  const failure = new Error("initialization failed");
  const order: string[] = [];
  const owner = extension("/work/pi-ui.ts", [async () => { order.push("ui"); }]);
  const broken = extension("/work/broken.ts", [async () => { throw failure; }, async () => { order.push("after-error"); }]);
  broken.handlers.set("agent_start", [() => { order.push("ordinary-broken"); }]);
  owner.handlers.set("agent_start", [() => { order.push("ordinary-ui"); }]);
  const setup = fixture([broken, owner], owner);
  const errors: string[] = [];
  setup.runner.onError((error) => errors.push(error.error));
  try {
    await setup.host.init();
    assert.deepEqual(errors, [failure.message]);
    assert.deepEqual(order, ["ui", "after-error"]);
    assert.equal(getStartupProgress()!.snapshot().entries.find((entry) => entry.name === "broken")?.state, "error");
    await setup.runner.emit({ type: "agent_start" });
    assert.deepEqual(order.slice(-2), ["ordinary-broken", "ordinary-ui"]);
    const first = getStartupProgress()!.snapshot().startedAt;
    await setup.runner.emit({ type: "session_shutdown", reason: "reload" });
    await setup.host.rebindCurrentSession();
    assert.notEqual(getStartupProgress()!.snapshot().startedAt, first);
    assert.equal(getStartupProgress()!.snapshot().entries.length, 2);
  } finally { await setup.runner.emit({ type: "session_shutdown", reason: "quit" }); }
});

test("print/RPC contexts bypass progress and preserve original initialization order", async () => {
  for (const hasUI of [false, true]) {
    const order: string[] = [];
    const before = extension("/work/before.ts", [() => { order.push("before"); }]);
    const owner = extension("/work/pi-ui.ts", [() => { order.push("ui"); }]);
    const setup = fixture([before, owner], owner, hasUI, hasUI ? "rpc" : "print");
    await setup.runner.emit(startupEvent);
    assert.deepEqual(order, ["before", "ui"]);
    assert.equal(getStartupProgress(), undefined);
  }
});

test("startup layout fits narrow and wide terminals and preserves full extension names", () => {
  const longName = "@scope/一个很长的扩展名字-with-combining-é-and-emoji-🧪";
  const snapshot = {
    active: true, phase: "initializing" as const, startedAt: 0, elapsedMs: 222, total: 2, frame: 2,
    entries: [{ path: "/extension.ts", name: longName, state: "ready" as const, startedAt: 0, initializeMs: 12 }],
  };
  for (const width of [1, 8, 11, 17, 18, 40, 75, 76, 100, 160, 240]) {
    for (const height of [1, 6, 10, 12, 16, 30, 100]) {
      const lines = renderStartupProgress(snapshot, width, undefined, height);
      assert(lines.every((line) => visibleWidth(line) <= width), `layout exceeded ${width} columns`);
      assert(lines.length <= height, `layout exceeded ${height} rows at width ${width}`);
    }
  }
  const wide = renderStartupProgress(snapshot, 160);
  assert(wide.join("\n").includes("━"));
  assert(wide.join("\n").includes(longName));
  assert.deepEqual(wide.slice(0, 2), ["", ""], "the header has breathing room above it");
  assert(wide.filter((line) => line.trim()).every((line) => line.startsWith(" ".repeat(20))), "the panel stays centered at its maximum width");
  assert(!wide.join("\n").includes("╭"), "the wordmark has no surrounding box");
  assert.notDeepEqual(wide, renderStartupProgress({ ...snapshot, frame: 10 }, 160), "the sweep advances between frames");
  assert(!renderStartupProgress({ ...snapshot, active: false }, 100).join("\n").includes("━"));
  const poisoned = { ...snapshot, entries: [{ ...snapshot.entries[0], name: "bad\x1b[2Jname\n" }] };
  assert(!renderStartupProgress(poisoned, 100).join("\n").includes("\x1b"));
});

test("completed labels resolve exact packages and paths without ambiguous basename attribution", () => {
  const controller = new StartupController();
  try {
    const snapshot = controller.snapshot();
    snapshot.entries = [{ path: "/work/index.ts", name: "@scope/example", state: "ready", startedAt: 0, initializeMs: 20 }];
    assert.equal(startupDurationForLabel("@scope/example  v1.0.0", snapshot), 20);
    assert.equal(startupDurationForLabel("/work", snapshot), 20);
    assert.equal(startupDurationForLabel("example", snapshot), undefined);
    snapshot.entries = [{ ...snapshot.entries[0], path: `${homedir()}/work/index.ts` }];
    assert.equal(startupDurationForLabel("~/work", snapshot), 20);
    snapshot.entries = ["/one/plugin.ts", "/two/plugin.ts"].map((path) => ({ ...snapshot.entries[0], path }));
    assert.equal(startupDurationForLabel("plugin", snapshot), undefined);
    assert.equal(startupEntryDuration({ ...snapshot.entries[0], state: "initializing", startedAt: 100 }, 150), 70);
  } finally { controller.dispose(); }
});
