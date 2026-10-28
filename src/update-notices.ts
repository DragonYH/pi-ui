import {
  DefaultPackageManager,
  InteractiveMode,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import { Text, type Container, type TUI } from "@earendil-works/pi-tui";
import { readPackageVersion } from "./resource-versions.ts";

export interface PackageUpdateNotice {
  name: string;
  currentVersion?: string;
  latestVersion?: string;
}

interface UpdateListener {
  cwd: string;
  theme: Theme;
  onPiUpdate(version: string): void;
  onPackageUpdates(updates: PackageUpdateNotice[]): Set<string>;
}

interface NotificationHost {
  ui: TUI;
  chatContainer: Container;
}

interface NpmVersionLookup {
  cwd: string;
  getLatestNpmVersion?: (name: string) => Promise<string>;
}

interface UpdateBridge {
  listeners: Map<TUI, UpdateListener>;
  packages: Map<string, Map<string, PackageUpdateNotice>>;
  piVersions: WeakMap<TUI, string>;
  restore?: () => void;
}

const UPDATE_BRIDGE_KEY = Symbol.for("@rokiy/pi-ui:update-bridge");
type NotificationPrototype = typeof InteractiveMode.prototype & {
  [UPDATE_BRIDGE_KEY]?: UpdateBridge;
};

function parseVersion(version: string): { core: number[]; prerelease: string[] } | undefined {
  const match = version.match(/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) return undefined;
  const core = match.slice(1, 4).map(Number);
  const prerelease = match[4]?.split(".") ?? [];
  if (core.some((part) => !Number.isSafeInteger(part)) || prerelease.some((part) => !part)) {
    return undefined;
  }
  return { core, prerelease };
}

/** Ignore equal versions, build metadata, and a registry release older than a local build. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const previous = parseVersion(current);
  if (!next || !previous) return false;
  for (let index = 0; index < 3; index += 1) {
    const difference = next.core[index] - previous.core[index];
    if (difference !== 0) return difference > 0;
  }
  if (next.prerelease.length === 0) return previous.prerelease.length > 0;
  if (previous.prerelease.length === 0) return false;
  for (let index = 0; index < Math.max(next.prerelease.length, previous.prerelease.length); index += 1) {
    const left = next.prerelease[index];
    const right = previous.prerelease[index];
    if (left === right) continue;
    if (left === undefined) return false;
    if (right === undefined) return true;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right);
    if (leftNumeric !== rightNumeric) return !leftNumeric;
    return left > right;
  }
  return false;
}

export function formatVersionChange(current: string, latest: string | undefined, theme: Theme): string {
  const version = theme.fg("dim", `v${current.replace(/^v/, "")}`);
  return latest && isNewerVersion(latest, current)
    ? `${version}${theme.fg("dim", "->")}${theme.fg("success", `v${latest.replace(/^v/, "")}`)}`
    : version;
}

function showCompactUpdates(host: NotificationHost, lines: string[]): void {
  if (lines.length === 0) return;
  host.chatContainer.addChild(new Text(lines.join("\n"), 1, 0));
  host.ui.requestRender();
}

/** Reuse Pi's checks and their npm results; no extra network requests or startup waits. */
function attachUpdateBridge(): UpdateBridge {
  const prototype = InteractiveMode.prototype as NotificationPrototype;
  const bridge: UpdateBridge = prototype[UPDATE_BRIDGE_KEY] ??= {
    listeners: new Map(), packages: new Map(), piVersions: new WeakMap(),
  };
  if (bridge.restore) return bridge;

  const originalPiNotification = prototype.showNewVersionNotification;
  const originalPackageNotification = prototype.showPackageUpdateNotification;
  const originalPackageCheck = DefaultPackageManager.prototype.checkForAvailableUpdates;

  const piNotification: typeof originalPiNotification = function (this: InteractiveMode, release) {
    const host = this as unknown as NotificationHost;
    const listener = bridge.listeners.get(host.ui);
    if (!listener) return originalPiNotification.call(this, release);
    bridge.piVersions.set(host.ui, release.version);
    listener.onPiUpdate(release.version);
  };

  const packageNotification: typeof originalPackageNotification = function (this: InteractiveMode, names) {
    const host = this as unknown as NotificationHost;
    const listener = bridge.listeners.get(host.ui);
    if (!listener) return originalPackageNotification.call(this, names);
    const available = bridge.packages.get(listener.cwd);
    const notices = names.map((name) => available?.get(name) ?? { name });
    const handled = listener.onPackageUpdates(notices);
    const lines = notices.filter(({ name }) => !handled.has(name)).flatMap((notice) => {
      const { currentVersion, latestVersion } = notice;
      if (currentVersion && latestVersion && !isNewerVersion(latestVersion, currentVersion)) return [];
      const label = listener.theme.fg("text", notice.name);
      const version = currentVersion
        ? formatVersionChange(currentVersion, latestVersion, listener.theme)
        : latestVersion ? listener.theme.fg("success", `v${latestVersion}`) : "";
      const hint = latestVersion ? "" : listener.theme.fg("success", " (update available)");
      return [`${label}  ${version}${hint}`.trimEnd()];
    });
    showCompactUpdates(host, lines);
  };

  const packageCheck: typeof originalPackageCheck = async function (this: DefaultPackageManager) {
    const manager = this as unknown as NpmVersionLookup;
    if (![...bridge.listeners.values()].some((listener) => listener.cwd === manager.cwd)) {
      return originalPackageCheck.call(this);
    }
    const latest = new Map<string, string>();
    // Pi's public update result omits versions. Observe its existing lookup for this check only.
    const lookup = manager.getLatestNpmVersion;
    const hadOwnLookup = Object.hasOwn(manager, "getLatestNpmVersion");
    const observeLookup = async (name: string): Promise<string> => {
      const version = await lookup!.call(this, name);
      if (typeof version === "string") latest.set(name, version);
      return version;
    };
    if (lookup) manager.getLatestNpmVersion = observeLookup;
    try {
      const updates = await originalPackageCheck.call(this);
      const notices = new Map<string, PackageUpdateNotice>();
      for (const update of updates) {
        notices.set(update.displayName, {
          name: update.displayName,
          currentVersion: readPackageVersion(this.getInstalledPath(update.source, update.scope)),
          latestVersion: latest.get(update.displayName),
        });
      }
      bridge.packages.set(manager.cwd, notices);
      return updates;
    } finally {
      if (manager.getLatestNpmVersion === observeLookup) {
        if (hadOwnLookup) manager.getLatestNpmVersion = lookup;
        else delete manager.getLatestNpmVersion;
      }
    }
  };

  prototype.showNewVersionNotification = piNotification;
  prototype.showPackageUpdateNotification = packageNotification;
  DefaultPackageManager.prototype.checkForAvailableUpdates = packageCheck;
  bridge.restore = () => {
    if (prototype.showNewVersionNotification === piNotification) prototype.showNewVersionNotification = originalPiNotification;
    if (prototype.showPackageUpdateNotification === packageNotification) prototype.showPackageUpdateNotification = originalPackageNotification;
    if (DefaultPackageManager.prototype.checkForAvailableUpdates === packageCheck) {
      DefaultPackageManager.prototype.checkForAvailableUpdates = originalPackageCheck;
    }
    bridge.restore = undefined;
  };
  return bridge;
}

export function subscribeToUpdates(tui: TUI, listener: UpdateListener): () => void {
  const bridge = attachUpdateBridge();
  bridge.listeners.set(tui, listener);
  const piVersion = bridge.piVersions.get(tui);
  if (piVersion) listener.onPiUpdate(piVersion);
  const packages = bridge.packages.get(listener.cwd);
  if (packages) listener.onPackageUpdates([...packages.values()]);

  return () => {
    if (bridge.listeners.get(tui) === listener) bridge.listeners.delete(tui);
    if (bridge.listeners.size === 0) bridge.restore?.();
  };
}
