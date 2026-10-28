import { StartupController, type StartupExtension, type StartupHost } from "./controller.ts";

const NATIVE_HOOKS_KEY = "@rokiy/pi-ui:native-startup-hooks";
interface NativeEvent { type: string }
interface NativeRunner {
  extensions: StartupExtension[];
  sessionManager: object;
  createContext(): { hasUI: boolean; mode?: string };
}
interface NativeHost extends StartupHost {
  isInitialized?: boolean;
  session: { sessionManager: object; extensionRunner: NativeRunner };
}
interface Binding { controller: StartupController; host?: NativeHost }
interface NativeState {
  owners: WeakSet<object>;
  patched: WeakSet<object>;
  bindings: WeakMap<object, Binding>;
}
type NativeMethod = (this: NativeHost, ...args: unknown[]) => Promise<unknown>;
type Emit = (this: NativeRunner, event: NativeEvent, ...args: unknown[]) => Promise<unknown>;

function findOwner(state: NativeState, extensions: readonly StartupExtension[]): StartupExtension | undefined {
  return extensions.find((extension) => extension.messageRenderers &&
    [...extension.messageRenderers.values()].some((renderer) =>
      typeof renderer === "function" && state.owners.has(renderer),
    ));
}

function prepareHost(state: NativeState, host: NativeHost, showPreview: boolean): Binding | undefined {
  const runner = host.session?.extensionRunner;
  if (!Array.isArray(runner?.extensions) || !findOwner(state, runner.extensions)) return undefined;
  const previous = state.bindings.get(host.session.sessionManager);
  if (previous?.controller.snapshot().active) return previous;
  previous?.controller.dispose();
  const controller = new StartupController(runner.extensions.filter((extension) => !extension.hidden).length);
  controller.install();
  controller.attach(host, showPreview);
  const binding = { controller, host };
  state.bindings.set(host.session.sessionManager, binding);
  return binding;
}

/** Adapt exported SDK classes in this process; no CLI, files, or settings are replaced. */
export function installNativeStartup(
  runnerPrototype: object,
  interactivePrototype: object,
  assistantRenderer: object,
): void {
  const globals = globalThis as Record<string, unknown>;
  let state = globals[NATIVE_HOOKS_KEY] as NativeState | undefined;
  if (!state) {
    state = { owners: new WeakSet(), patched: new WeakSet(), bindings: new WeakMap() };
    globals[NATIVE_HOOKS_KEY] = state;
  }
  const shared = state;
  shared.owners.add(assistantRenderer);

  if (!shared.patched.has(interactivePrototype)) {
    const methods = interactivePrototype as Record<string, unknown>;
    for (const name of ["init", "rebindCurrentSession"]) {
      const original = methods[name] as NativeMethod | undefined;
      if (typeof original !== "function") continue;
      methods[name] = async function(this: NativeHost, ...args: unknown[]) {
        const binding = prepareHost(shared, this, name === "init" && !this.isInitialized);
        try {
          return await original.apply(this, args);
        } catch (error) {
          binding?.controller.dispose();
          throw error;
        }
      };
    }
    shared.patched.add(interactivePrototype);
  }

  if (shared.patched.has(runnerPrototype)) return;
  const methods = runnerPrototype as Record<string, unknown>;
  const original = methods.emit as Emit | undefined;
  if (typeof original !== "function") return;
  methods.emit = async function(this: NativeRunner, event: NativeEvent, ...args: unknown[]) {
    if (event.type === "session_shutdown") {
      try { return await original.call(this, event, ...args); }
      finally { shared.bindings.get(this.sessionManager)?.controller.dispose(); }
    }
    if (event.type !== "session_start" || !Array.isArray(this.extensions)) {
      return original.call(this, event, ...args);
    }
    const owner = findOwner(shared, this.extensions);
    if (!owner) return original.call(this, event, ...args);
    const ctx = this.createContext();
    if (!ctx.hasUI || ctx.mode !== undefined && ctx.mode !== "tui") return original.call(this, event, ...args);
    let binding = shared.bindings.get(this.sessionManager);
    if (!binding?.controller.snapshot().active) {
      const host = binding?.host;
      binding?.controller.dispose();
      const controller = new StartupController();
      controller.install();
      if (host) controller.attach(host, false);
      binding = { controller, host };
      shared.bindings.set(this.sessionManager, binding);
    }
    const controller = binding.controller;
    const extensions = controller.plan(this.extensions, owner);
    // Original emit retains its error handling and shared context. Only this
    // session_start snapshot puts pi-ui first; other events keep their order.
    const emission = new Proxy(this, {
      get(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor && !descriptor.configurable && "value" in descriptor && !descriptor.writable) return descriptor.value;
        if (key === "extensions") return extensions;
        if (key === "createContext") return () => ctx;
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      return await original.call(emission, event, ...args);
    } catch (error) {
      controller.dispose();
      throw error;
    } finally {
      if (controller.snapshot().active) controller.finish();
    }
  };
  shared.patched.add(runnerPrototype);
}
