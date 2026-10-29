import { stripVTControlCharacters } from "node:util";
import { AssistantMessageComponent, UserMessageComponent, type ExtensionAPI, type Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { cardEdge, cardRail } from "./card-frame.ts";

// A new generation also installs the fix over hooks retained by a running Pi.
const HOOKS_KEY = "@rokiy/pi-ui:message-card-hooks:v2";
// Shell-integration zones belong around the complete card, including its timestamp.
// eslint-disable-next-line no-control-regex
const ZONE = /\x1b\]133;([ABC])(?:\x07|\x1b\\)/g;
interface Message { role: string; timestamp?: number }
interface MouseEvent { x: number; y: number; width: number; height: number }
interface NativeMessage extends Component {
  lastMessage?: Message;
  children?: Component[];
  setOutputPad?(padding: number): void;
  handleMouse?(event: MouseEvent): unknown;
}
interface Host {
  session: { extensionRunner: { extensions: { messageRenderers?: Map<string, unknown> }[] } };
  chatContainer: { children: Component[] };
  streamingComponent?: NativeMessage;
}
interface Binding { theme?: () => Theme; pending: Map<NativeMessage, Message> }
interface Hooks {
  owners: WeakMap<object, Binding>;
  patched: WeakSet<object>;
  decorate: typeof decorateMessage;
}
const decorated = new WeakSet<NativeMessage>();

function clock(timestamp: number | undefined): string {
  const date = new Date(timestamp ?? NaN);
  if (!Number.isFinite(date.getTime())) return "—";
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

function prepareUserContent(component: Component): void {
  const node = component as Component & {
    children?: Component[]; paddingX?: number; paddingY?: number;
    defaultTextStyle?: { bgColor?: unknown }; setBgFn?(fn: undefined): void;
  };
  let changed = false;
  for (const key of ["paddingX", "paddingY"] as const) {
    if (node[key]) { node[key] = 0; changed = true; }
  }
  if (node.defaultTextStyle?.bgColor) { node.defaultTextStyle.bgColor = undefined; changed = true; }
  node.setBgFn?.(undefined);
  if (changed) node.invalidate();
  for (const child of node.children ?? []) prepareUserContent(child);
}

/** Keep the native component identity, Markdown, thinking controls and update methods. */
export function decorateMessage(component: NativeMessage, message: Message, getTheme: () => Theme): void {
  if (decorated.has(component)) return;
  decorated.add(component);
  const user = message.role === "user";
  const nativeRender = component.render;
  const nativeMouse = component.handleMouse;
  const setOutputPad = component.setOutputPad;
  if (setOutputPad) {
    component.setOutputPad = function() { setOutputPad.call(this, 0); };
    component.setOutputPad(0);
  }
  let layout: { x: number; y: number; width: number; nativeWidth: number; height: number; start: number; count: number } | undefined;
  let lastTimestamp: number | undefined;
  let time = "—";
  component.render = function(width) {
    layout = undefined;
    const available = Math.max(0, Math.floor(width) - 1);
    const maxWidth = Math.floor(available * 2 / 3);
    if (!maxWidth) return [];
    // The outer frame owns padding and background. Native rebuilds can replace Markdown.
    if (user) for (const child of this.children ?? []) prepareUserContent(child);
    // Wrap once at the cap; every visible row will also fit the measured frame.
    const nativeWidth = Math.max(1, maxWidth - 4);
    const native = nativeRender.call(this, nativeWidth);
    let zoneStart = "";
    let zoneEnd = "";
    const rows = native.map((line) => line.replace(ZONE, (escape: string, kind: string) => {
      if (kind === "A") zoneStart += escape;
      else zoneEnd += escape;
      return "";
    }));
    let start = 0;
    let end = rows.length;
    while (start < end && !stripVTControlCharacters(rows[start]).trim()) start++;
    while (end > start && !stripVTControlCharacters(rows[end - 1]).trim()) end--;
    // Tool-call-only assistant messages have no visible message bubble.
    if (start === end) return [];
    const theme = getTheme();
    const timestamp = this.lastMessage?.timestamp ?? message.timestamp;
    if (timestamp !== lastTimestamp) {
      lastTimestamp = timestamp;
      time = clock(timestamp);
    }
    const title = user ? "You" : "Assistant";
    const content = rows.slice(start, end);
    const longest = content.reduce((length, line) => Math.max(length, visibleWidth(stripVTControlCharacters(line).trimEnd())), 0);
    const cardWidth = Math.min(maxWidth, Math.max(longest + 4, visibleWidth(title) + 6, visibleWidth(time) + 6));
    const innerWidth = Math.max(1, cardWidth - 4);
    const x = user ? available - cardWidth : 0;
    const gap = user ? 0 : 1;
    const prefix = " ".repeat(x);
    const color = user ? "thinkingHigh" : "success";
    const header = cardEdge(cardWidth, "╭", "╮", theme.fg(color, theme.bold(title)), theme, color, user ? "right" : "left");
    // Remove native line padding without introducing an ellipsis into short content.
    const body = content.map((line) => cardRail(truncateToWidth(line, innerWidth, ""), cardWidth, theme, color));
    const footer = cardEdge(cardWidth, "╰", "╯", theme.fg("dim", time), theme, color, user ? "right" : "left");
    layout = { x: x + 2, y: gap + 1, width: innerWidth, nativeWidth, height: native.length, start, count: end - start };
    return [...(gap ? [""] : []), zoneStart + prefix + header, ...body.map((line) => prefix + line), zoneEnd + prefix + footer];
  };
  if (nativeMouse) component.handleMouse = function(event) {
    if (!layout || event.x < layout.x || event.x >= layout.x + layout.width || event.y < layout.y || event.y >= layout.y + layout.count) return undefined;
    return nativeMouse.call(this, { ...event, x: event.x - layout.x, y: event.y - layout.y + layout.start, width: layout.nativeWidth, height: layout.height });
  };
}

function bindingFor(state: Hooks, host: Host): Binding | undefined {
  for (const extension of host.session?.extensionRunner?.extensions ?? []) {
    for (const renderer of extension.messageRenderers?.values() ?? []) {
      if (typeof renderer === "function") {
        const binding = state.owners.get(renderer);
        if (binding) return binding;
      }
    }
  }
  return undefined;
}

/** Scope native transcript hooks to sessions that actually loaded this extension. */
export function installMessageCards(pi: ExtensionAPI, interactivePrototype: object, owner: object): void {
  const globals = globalThis as Record<string, unknown>;
  const shared = (globals[HOOKS_KEY] ??= { owners: new WeakMap(), patched: new WeakSet(), decorate: decorateMessage }) as Hooks;
  shared.decorate = decorateMessage;
  const binding: Binding = { pending: new Map() };
  shared.owners.set(owner, binding);
  pi.on("session_start", (_event, ctx) => {
    // Old cards can repaint after their session ctx expires; retain only the UI theme source.
    const ui = ctx.hasUI && (!("mode" in ctx) || ctx.mode === "tui") ? ctx.ui : undefined;
    binding.theme = ui ? () => ui.theme : undefined;
    // /reload rebuilds the transcript before session_start supplies its UI context.
    if (binding.theme) {
      for (const [component, message] of binding.pending) shared.decorate(component, message, binding.theme);
    }
    binding.pending.clear();
  });
  if (shared.patched.has(interactivePrototype)) return;
  const methods = interactivePrototype as Record<string, unknown>;
  const originalAdd = methods.addMessageToChat;
  const originalEvent = methods.handleEvent;
  if (typeof originalAdd !== "function" || typeof originalEvent !== "function") return;
  methods.addMessageToChat = function(this: Host, message: Message, ...args: unknown[]) {
    const binding = bindingFor(shared, this);
    const first = this.chatContainer.children.length;
    const result = originalAdd.call(this, message, ...args);
    if (binding && (message.role === "user" || message.role === "assistant")) {
      for (const component of this.chatContainer.children.slice(first)) {
        if (component instanceof UserMessageComponent || component instanceof AssistantMessageComponent) {
          if (binding.theme) shared.decorate(component as unknown as NativeMessage, message, binding.theme);
          else binding.pending.set(component as unknown as NativeMessage, message);
        }
      }
    }
    return result;
  };
  methods.handleEvent = function(this: Host, event: { type: string; message?: Message }, ...args: unknown[]) {
    const result = originalEvent.call(this, event, ...args);
    if (event.type !== "message_start" || event.message?.role !== "assistant") return result;
    const message = event.message;
    const attach = () => {
      const binding = bindingFor(shared, this);
      if (binding?.theme && this.streamingComponent) shared.decorate(this.streamingComponent, message, binding.theme);
    };
    attach();
    // The first event may await native init before creating its streaming component.
    return Promise.resolve(result).then((value) => { attach(); return value; });
  };
  shared.patched.add(interactivePrototype);
}
