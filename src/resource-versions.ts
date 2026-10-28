import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DefaultPackageManager,
  getAgentDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

export type PackageVersionResolver = (
  source: string,
  scope?: "user" | "project",
) => string | undefined;

export function readPackageVersion(root: string | undefined): string | undefined {
  if (!root) return undefined;
  try {
    const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    if (manifest && typeof manifest === "object" && "version" in manifest &&
        typeof manifest.version === "string" && /^[\w.+-]+$/.test(manifest.version)) {
      return manifest.version;
    }
  } catch {
    // Missing or invalid metadata must never prevent the welcome screen from rendering.
  }
  return undefined;
}

/** Resolve installed versions using Pi's own package locations, without network access. */
export function createPackageVersionResolver(cwd: string): PackageVersionResolver {
  const manager = new DefaultPackageManager({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.inMemory(),
  });
  const versions = new Map<string, string | undefined>();

  return (source, scope) => {
    const key = `${scope ?? "auto"}:${source}`;
    if (versions.has(key)) return versions.get(key);

    let version: string | undefined;
    for (const candidateScope of scope ? [scope] : (["project", "user"] as const)) {
      let root: string | undefined;
      try {
        root = manager.getInstalledPath(source, candidateScope);
      } catch {
        continue;
      }
      if (!root) continue;

      version = readPackageVersion(root);
      // Do not inherit another scope's version when this installation has no valid metadata.
      break;
    }
    versions.set(key, version);
    return version;
  };
}
