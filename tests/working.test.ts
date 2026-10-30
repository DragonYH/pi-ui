import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createExtensionRuntime, ExtensionRunner, type Extension, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerWorkingIndicator } from "../src/working.ts";

function assistant(output = 0, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
  return {
    role: "assistant", content: [], api: "anthropic-messages", provider: "anthropic", model: "fixture",
    timestamp: Date.now(), stopReason,
    usage: { input: 100, output, cacheRead: 200, cacheWrite: 0, totalTokens: 300 + output,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
}

async function fixture(t: TestContext, hasUI = true, mode = "tui") {
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now: 1_000 });
  const handlers: Extension["handlers"] = new Map();
  registerWorkingIndicator({ on(name, handler) {
    handlers.set(name, [async (...args: unknown[]) => Reflect.apply(handler, undefined, args)]);
  } } as ExtensionAPI);
  const messages: (string | undefined)[] = [];
  const tones: string[] = [];
  let stale = false;
  let probes = 0;
  const ctx = {
    get hasUI() { probes++; if (stale) throw new Error("stale context"); return hasUI; },
    mode,
    ui: {
      setWorkingMessage(message?: string) { messages.push(message); },
      setWorkingIndicator(options: { frames: string[] }) { tones.push(options.frames[0].split(":")[0]); },
      theme: { fg: (tone: string, text: string) => `${tone}:${text}` },
    },
  } as unknown as ExtensionContext;
  // Use Pi's actual event dispatcher so handler order and swallowed errors are covered.
  const runner = Reflect.construct(ExtensionRunner, [
    [{ path: "/work/working.ts", handlers }], createExtensionRuntime(), "/work", {}, {},
  ]) as ExtensionRunner;
  Object.defineProperty(runner, "createContext", { value: () => ctx });
  const errors: string[] = [];
  runner.onError((error) => errors.push(error.error));
  t.after(async () => {
    await runner.emit({ type: "session_shutdown", reason: "quit" });
    assert.deepEqual(errors, []);
  });
  await runner.emit({ type: "session_start", reason: "startup" });
  t.mock.timers.tick(1);
  return {
    runner, messages, tones,
    setStale() { stale = true; },
    probes: () => probes,
    async start() { await runner.emit({ type: "agent_start" }); },
    async begin(output = 0) { await runner.emit({ type: "message_start", message: assistant(output) }); },
    async delta(type: "text_delta" | "thinking_delta" | "toolcall_delta", delta: string, output = 0) {
      const message = assistant(output);
      await runner.emit({ type: "message_update", message,
        assistantMessageEvent: { type, delta, contentIndex: 0, partial: message } });
    },
    async end(output: number, reason: AssistantMessage["stopReason"] = "stop") {
      const message = assistant(output, reason);
      await runner.emitMessageEnd({ type: "message_end", message });
      return message;
    },
  };
}

test("working row counts text, thinking and tool arguments across tool turns, then resets", async (t) => {
  const f = await fixture(t);
  await f.start();
  assert.equal(f.messages.at(-1), undefined, "brief waits retain Pi's default message");
  t.mock.timers.tick(3_000);
  assert.equal(f.messages.at(-1), "Working... (3s)");
  await f.begin();
  for (const char of "abcd") await f.delta("text_delta", char);
  assert.equal(f.messages.at(-1), "Working... (↓ 1 tokens · 3s)", "chunk size must not inflate estimates");
  await f.delta("thinking_delta", "思考");
  await f.delta("toolcall_delta", "abcdefgh");
  assert.equal(f.messages.at(-1), "Working... (↓ 5 tokens · 3s)");
  const message = assistant();
  await f.runner.emit({ type: "message_update", message,
    assistantMessageEvent: { type: "text_end", contentIndex: 0, content: "abcd", partial: message } });
  assert.equal(f.messages.at(-1), "Working... (↓ 5 tokens · 3s)", "full block ends do not recount deltas");
  const completed = await f.end(37, "toolUse");
  await f.runner.emitBoundary({
    type: "turn_end", turnIndex: 0, message: completed, toolResults: [],
    messageEntryId: "fixture-assistant-0", toolResultEntryIds: [], outcome: "completed",
  }, () => ({
    contextEntries: [], contextMessages: [completed], llmMessages: [completed], pendingMessages: [], canContinue: true,
  }));
  t.mock.timers.tick(2_000);
  await f.runner.emit({ type: "turn_start", turnIndex: 1, timestamp: Date.now() });
  await f.begin();
  await f.delta("text_delta", "abcdefgh");
  assert.equal(f.messages.at(-1), "Working... (↓ 39 tokens · 5s)");
  await f.end(16);
  assert.equal(f.messages.at(-1), "Working... (↓ 53 tokens · 5s)");
  await f.runner.emit({ type: "agent_end", messages: [] });
  assert.equal(f.messages.at(-1), undefined);
  await f.start();
  await f.begin();
  await f.delta("text_delta", "abcdefgh");
  t.mock.timers.tick(2_100);
  assert.equal(f.messages.at(-1), "Working... (↓ 2 tokens · 2s)", "a previous run cannot clear a new run's display");
});

test("provider usage corrects estimates and includes hidden tokens without counting input/cache", async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.begin(1);
  await f.delta("text_delta", "abcd", 1);
  await f.delta("text_delta", "abcd", 1);
  assert.match(f.messages.at(-1)!, /↓ 3 tokens/);
  await f.delta("text_delta", "abcd", 10);
  assert.match(f.messages.at(-1)!, /↓ 10 tokens/);
  await f.delta("text_delta", "abcd", 10);
  assert.match(f.messages.at(-1)!, /↓ 11 tokens/, "unchanged usage must not erase estimates");
  const message = await f.end(7);
  assert.match(f.messages.at(-1)!, /↓ 7 tokens/, "successful usage can revise an estimate downwards");
  assert.deepEqual(message.content, [], "display statistics do not alter messages");
  assert.equal(message.usage.output, 7);
  await f.begin();
  await f.end(99);
  assert.match(f.messages.at(-1)!, /↓ 106 tokens/, "final-only usage includes hidden reasoning");
  await f.begin();
  await f.end(1_100);
  assert.match(f.messages.at(-1)!, /↓ 1\.2k tokens/);
});

test("abort/error placeholders preserve streamed estimates and the next task starts fresh", async (t) => {
  const f = await fixture(t);
  for (const reason of ["error", "aborted"] as const) {
    await f.start();
    await f.begin();
    await f.delta("thinking_delta", "a".repeat(40));
    await f.end(1, reason);
    assert.match(f.messages.at(-1)!, /↓ 10 tokens/);
    await f.runner.emit({ type: "agent_end", messages: [] });
    assert.equal(f.messages.at(-1), undefined);
  }
  await f.start();
  await f.begin();
  await f.delta("text_delta", "abcd");
  assert.match(f.messages.at(-1)!, /↓ 1 tokens/);
});

test("stream terminal events and non-assistant messages do not double count", async (t) => {
  const f = await fixture(t);
  await f.start();
  await f.begin();
  const message = assistant(12);
  const done: AssistantMessageEvent = { type: "done", reason: "stop", message };
  await f.runner.emit({ type: "message_update", message, assistantMessageEvent: done });
  assert.match(f.messages.at(-1)!, /↓ 12 tokens/);
  await f.end(12);
  await f.runner.emitMessageEnd({ type: "message_end", message: { role: "toolResult", toolCallId: "fixture",
    toolName: "bash", content: [{ type: "text", text: "a".repeat(200) }], isError: false, timestamp: Date.now() } });
  await f.begin();
  await f.end(3);
  assert.match(f.messages.at(-1)!, /↓ 15 tokens/);
});

test("elapsed time advances during tool waits and adaptive colors recover with new tokens", async (t) => {
  const f = await fixture(t);
  await f.start();
  assert.equal(f.tones.at(-1), "success");
  t.mock.timers.tick(10_000);
  assert.equal(f.tones.at(-1), "warning");
  t.mock.timers.tick(20_000);
  assert.equal(f.tones.at(-1), "error");
  await f.begin();
  await f.delta("toolcall_delta", "abcd");
  assert.equal(f.tones.at(-1), "success");
  t.mock.timers.tick(32_000);
  assert.equal(f.messages.at(-1), "Working... (↓ 1 tokens · 1m 2s)");
  await f.runner.emit({ type: "session_shutdown", reason: "reload" });
  const writes = f.messages.length;
  t.mock.timers.tick(5_000);
  assert.equal(f.messages.length, writes, "shutdown releases all refresh callbacks");
  await f.runner.emit({ type: "session_start", reason: "reload" });
  await f.start();
  await f.begin();
  await f.delta("text_delta", "abcd");
  assert.equal(f.messages.at(-1), "Working... (↓ 1 tokens · 0s)");
});

test("stale contexts stop refreshes quietly", async (t) => {
  const f = await fixture(t);
  await f.start();
  f.setStale();
  assert.doesNotThrow(() => t.mock.timers.tick(3_000));
  const probes = f.probes();
  t.mock.timers.tick(60_000);
  assert.equal(f.probes(), probes);
  await f.start();
  await f.delta("text_delta", "abcd");
  assert.equal(f.probes(), probes, "late events cannot restart a stale UI");
});

test("non-interactive sessions do not start working UI timers", async (t) => {
  const f = await fixture(t, true, "rpc");
  await f.start();
  await f.begin();
  await f.delta("text_delta", "abcd");
  t.mock.timers.tick(30_000);
  assert.deepEqual(f.messages, []);
  assert.deepEqual(f.tones, []);
});
