import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  getAgentDir,
  VERSION,
  type ExtensionContext,
  type SessionStartEvent,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type Component,
  type Container,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import {
  createPackageVersionResolver,
  type PackageVersionResolver,
} from "./resource-versions.ts";
import { PI_LOGO, getStartupProgress } from "./startup/progress.ts";
import { renderStartupProgress } from "./startup/view.ts";
import {
  formatVersionChange,
  isNewerVersion,
  subscribeToUpdates,
  type PackageUpdateNotice,
} from "./update-notices.ts";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

// 双列布局中左侧品牌列（logo 列）的最小宽度，宽屏时按总宽 1/3 放大
export const BRAND_COLUMN_WIDTH = 14;
// 品牌列与内容列之间的间距
export const GRID_COLUMN_GAP = 3;
// 内容列的最小可用宽度，低于该宽度时降级为单列堆叠
export const MIN_RESOURCE_COLUMN_WIDTH = 44;
// 窄屏单列布局的最大列宽
export const MAX_STACKED_COLUMN_WIDTH = 80;
// 列表自动多列时每列最多行数
export const MAX_LIST_ROWS_PER_COLUMN = 6;
// 多列列表中每列的最小宽度
export const MIN_LIST_COLUMN_WIDTH = 22;
// 多列列表中列与列的间距
export const LIST_COLUMN_GAP = 2;
// 资源面板轮询间隔
export const RESOURCE_POLL_INTERVAL_MS = 50;
// 资源面板捕获的最大重试次数
export const MAX_RESOURCE_RETRIES = 3;
// 核心 loaded-resources 面板在 header 所在容器中的下标
export const RESOURCE_PANEL_INDEX = 1;
// 挂在 TUI 上防止重复桥接的标记
export const RESOURCE_BRIDGE_KEY = "@rokiy/pi-ui:welcome:resource-bridge";

// 核心 compact 模式下的快捷键提示行。工厂函数拿不到 keybindings，与核心默认保持一致。
const KEYBINDING_HINTS_LINE =
  "escape interrupt · ctrl+c/ctrl+d clear/exit · / commands · ! bash · ctrl+o more";
// 核心的 onboarding 提示行
const ONBOARDING_LINE =
  "Pi can explain its own features and look up its docs. Ask it how to use or extend Pi.";

// 现有欢迎屏 logo（6 行块状 "pi" 字符画）
const WIDE_LOGO = PI_LOGO;

// ---------------------------------------------------------------------------
// 资源解析（桥接核心 loaded-resources 面板）
// ---------------------------------------------------------------------------

type WelcomeSection = "Context" | "Skills" | "Prompts" | "Extensions" | "Themes";
const WELCOME_SECTIONS: readonly WelcomeSection[] = [
  "Context",
  "Skills",
  "Prompts",
  "Extensions",
  "Themes",
];

export interface WelcomeResources {
  context: string[];
  skills: string[];
  prompts: string[];
  themes: string[];
  extensions: string[];
  /** Extensions loaded from npm or git packages. */
  packageExtensions?: string[];
  /** Local extension entry points outside Pi's extension directories. */
  sourceExtensions?: string[];
  /** @deprecated Use packageExtensions. */
  vendoredExtensions?: string[];
}

interface CollapsedTextComponent extends Component {
  getCollapsedText?: () => string;
  getExpandedText?: () => string;
  setExpanded?: (expanded: boolean) => void;
  state?: { expanded: boolean };
}

interface ResourcePanel extends Component {
  children: Component[];
}

interface ResourceBridge {
  panel: ResourcePanel;
  parent: ResourcePanel;
  originalIndex: number;
}

interface ResourcePanelSnapshot {
  resourceText: string;
  expandedExtensionsText?: string;
  requiresNativePanel: boolean;
}

type BridgeTui = TUI & {
  [RESOURCE_BRIDGE_KEY]?: ResourceBridge;
};

// 用 fromCharCode 构造 ESC 控制字符，避免 eslint no-control-regex
const ANSI_ESCAPE_RE = new RegExp(
  `${String.fromCharCode(27)}(?:[@-Z\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  "g",
);

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_RE, "");
}

function isResourcePanel(
  component: unknown,
): component is ResourcePanel {
  if (!component || typeof component !== "object") return false;
  return Array.isArray((component as Partial<Container>).children);
}

function getSectionHeading(text: string): string | undefined {
  return stripAnsi(text.split("\n", 1)[0] ?? "")
    .trim()
    .match(/^\[([^\]]+)\]$/)?.[1];
}

/** Pi 0.x exposes text getters; Pi 1.x renders its expandable text on demand. */
function readResourceText(component: Component): {
  collapsed: string;
  expanded?: string;
} | undefined {
  const expandable = component as CollapsedTextComponent;
  if (typeof expandable.getCollapsedText === "function") {
    return {
      collapsed: expandable.getCollapsedText(),
      expanded: expandable.getExpandedText?.(),
    };
  }
  if (
    typeof expandable.setExpanded !== "function" ||
    typeof expandable.state?.expanded !== "boolean"
  ) return undefined;

  const wasExpanded = expandable.state.expanded;
  try {
    expandable.setExpanded(false);
    const collapsed = expandable.render(16_384).join("\n");
    expandable.setExpanded(true);
    const expanded = expandable.render(16_384).join("\n");
    return { collapsed, expanded };
  } finally {
    expandable.setExpanded(wasExpanded);
  }
}

function inspectResourcePanel(panel: ResourcePanel): ResourcePanelSnapshot {
  const sections: string[] = [];
  let expandedExtensionsText: string | undefined;

  for (const child of panel.children) {
    const text = readResourceText(child);
    if (text) {
      const heading = getSectionHeading(text.collapsed);
      if (WELCOME_SECTIONS.some((section) => section === heading)) {
        sections.push(text.collapsed);
        if (heading === "Extensions") {
          expandedExtensionsText = text.expanded;
        }
      } else {
        // 未知的原生区段可能包含可操作信息，恢复原生面板而不是冒险猜测。
        return { resourceText: "", requiresNativePanel: true };
      }
      continue;
    }

    const hasVisibleContent = child
      .render(1_000)
      .some((line) => stripAnsi(line).trim().length > 0);
    if (hasVisibleContent) {
      return { resourceText: "", requiresNativePanel: true };
    }
  }

  return {
    resourceText: sections.join("\n"),
    ...(expandedExtensionsText ? { expandedExtensionsText } : {}),
    requiresNativePanel: false,
  };
}

function splitList(body: string[]): string[] {
  return body
    .join(" ")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeExtensionName(label: string): string {
  let name = label.trim().replace(/^npm:/, "").replace(/\\/g, "/");
  // Windows drive letters use a colon as part of the path, not as the
  // separator between a package name and its extension entry point.
  const packageSeparator = /^[A-Za-z]:\//.test(name) ? -1 : name.indexOf(":");
  const isPackageLabel = packageSeparator !== -1;
  if (isPackageLabel) name = name.slice(0, packageSeparator);

  name = name.replace(/\/$/, "");
  if (!isPackageLabel && !name.startsWith("@")) {
    if (/\/(?:index)\.(?:[cm]?[jt]s)$/.test(name)) return name;
    const segments = name.split("/").filter(Boolean);
    const fileName = segments.pop() ?? name;
    name = fileName;
  }
  return name.replace(/\.(?:[cm]?[jt]s)$/, "");
}

function isSelfExtension(name: string): boolean {
  name = name.split(/\s{2}v/)[0] ?? name;
  const normalized = name.replace(/\\/g, "/");
  return (
    /^pi-ui(?:@|$)/.test(name) ||
    /^@rokiy\/pi-ui(?:@|$)/.test(name) ||
    name === "src" ||
    normalized === "./src/index.ts" ||
    normalized.endsWith("/src/index.ts") ||
    normalized.endsWith("/src")
  );
}

export function sortExtensionNames(names: string[]): string[] {
  return [...names].sort((left, right) => {
    const scopeOrder =
      Number(left.startsWith("@")) - Number(right.startsWith("@"));
    return scopeOrder || left.localeCompare(right);
  });
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

interface ExtensionGroups {
  localExtensions: string[];
  packageExtensions: string[];
  sourceExtensions: string[];
}

function isPackageSource(label: string): boolean {
  return label.startsWith("npm:") || label.startsWith("git:");
}

function normalizePackageSource(label: string): string {
  return label.replace(/^(?:npm|git):/, "");
}

interface GitPackageSource {
  label: string;
  revision: string | undefined;
}

function splitGitRevision(pathWithRevision: string): {
  path: string;
  revision: string | undefined;
} {
  const separator = pathWithRevision.indexOf("@");
  if (separator === -1) return { path: pathWithRevision, revision: undefined };
  return {
    path: pathWithRevision.slice(0, separator),
    revision: pathWithRevision.slice(separator + 1),
  };
}

function parseGitPackageSource(source: string): GitPackageSource {
  const value = source.replace(/^git:/, "");
  const scpMatch = value.match(/^git@([^:]+):(.+)$/);
  if (scpMatch) {
    const { path, revision } = splitGitRevision(scpMatch[2] ?? "");
    return {
      label: `${scpMatch[1] ?? ""}/${path}`.replace(/\.git$/, ""),
      revision,
    };
  }

  if (value.includes("://")) {
    try {
      const url = new URL(value);
      const { path, revision } = splitGitRevision(
        url.pathname.replace(/^\/+/, ""),
      );
      return {
        label: `${url.hostname}/${path}`.replace(/\.git$/, ""),
        revision,
      };
    } catch {
      return { label: value, revision: undefined };
    }
  }

  const slash = value.indexOf("/");
  if (slash === -1) return { label: value, revision: undefined };
  const { path, revision } = splitGitRevision(value.slice(slash + 1));
  return {
    label: `${value.slice(0, slash)}/${path}`.replace(/\.git$/, ""),
    revision,
  };
}

function formatPackageExtensionLabel(
  source: string,
  resolveVersion?: PackageVersionResolver,
  scope?: "user" | "project",
): string {
  const version = resolveVersion?.(source, scope);
  if (!source.startsWith("git:")) {
    const label = normalizePackageSource(source);
    // Replace a configured range/tag with the actual installed version when available.
    const name = label.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@.*)?$/)?.[1] ?? label;
    return version ? `${name}  v${version}` : label;
  }

  const { label, revision } = parseGitPackageSource(source);
  return [
    label,
    ...(version ? [` v${version}`] : []),
    ...(revision ? [`@${revision.slice(0, 6)}`] : []),
  ].join(" ");
}

function isExplicitSourcePath(label: string): boolean {
  const normalized = label.replace(/\\/g, "/");
  return (
    normalized.startsWith("/") ||
    normalized.startsWith("~/") ||
    normalized.startsWith("./") ||
    normalized.startsWith("../") ||
    /^[A-Za-z]:\//.test(normalized) ||
    /\/(?:index)\.(?:[cm]?[jt]s)$/.test(normalized)
  );
}

function parseExpandedExtensionGroups(
  text: string | undefined,
  localExtensionNames: Set<string>,
  resolveVersion?: PackageVersionResolver,
): ExtensionGroups | undefined {
  if (!text || getSectionHeading(text) !== "Extensions") return undefined;

  const localExtensions: string[] = [];
  const packageExtensions: string[] = [];
  const sourceExtensions: string[] = [];
  let foundItem = false;
  let currentPackageSource: string | undefined;
  let scope: "user" | "project" | undefined;
  const flushPackage = () => {
    if (!currentPackageSource) return;
    packageExtensions.push(formatPackageExtensionLabel(currentPackageSource, resolveVersion, scope));
    currentPackageSource = undefined;
  };

  for (const rawLine of text.split("\n").slice(1)) {
    const line = stripAnsi(rawLine).replace(/\s+$/, "");
    const scopeLabel = line.match(/^ {2}(user|project|path)$/)?.[1];
    if (scopeLabel) {
      flushPackage();
      scope = scopeLabel === "path" ? undefined : scopeLabel as "user" | "project";
      continue;
    }
    const packageSource = line.match(/^ {4}((?:npm|git):.+)$/)?.[1];
    if (packageSource) {
      flushPackage();
      currentPackageSource = packageSource;
      foundItem = true;
      continue;
    }

    const packagePath = line.match(/^ {6}(\S.*)$/)?.[1];
    if (packagePath && currentPackageSource) continue;

    flushPackage();
    const path = line.match(/^ {4}(\S.*)$/)?.[1];
    if (!path || /^(?:project|user|path)$/.test(path)) continue;

    const name = normalizeExtensionName(path);
    if (
      localExtensionNames.has(name) ||
      /(?:^|\/)\.pi\/(?:agent\/)?extensions(?:\/|$)/.test(
        path.replace(/\\/g, "/"),
      )
    ) {
      localExtensions.push(name);
    } else {
      sourceExtensions.push(path.replace(/\\/g, "/"));
    }
    foundItem = true;
  }

  flushPackage();

  if (!foundItem) return undefined;
  return {
    localExtensions: sortExtensionNames(unique(localExtensions)),
    packageExtensions: sortExtensionNames(unique(packageExtensions)),
    sourceExtensions: sortExtensionNames(unique(sourceExtensions)),
  };
}

function classifyCompactExtensionLabels(
  labels: string[],
  localExtensionNames: Set<string>,
  resolveVersion?: PackageVersionResolver,
): ExtensionGroups {
  const localExtensions: string[] = [];
  const packageExtensions: string[] = [];
  const sourceExtensions: string[] = [];

  for (const label of labels) {
    const name = normalizeExtensionName(label);
    const indexParent = label
      .replace(/\\/g, "/")
      .match(/(?:^|\/)([^/]+)\/index\.(?:[cm]?[jt]s)$/)?.[1];
    if (
      localExtensionNames.has(name) ||
      localExtensionNames.has(indexParent ?? "")
    ) {
      localExtensions.push(name);
    } else if (isPackageSource(label) || name.startsWith("@")) {
      packageExtensions.push(formatPackageExtensionLabel(
        isPackageSource(label) ? label : `npm:${name}`,
        resolveVersion,
      ));
    } else if (isExplicitSourcePath(label)) {
      sourceExtensions.push(name);
    } else {
      packageExtensions.push(formatPackageExtensionLabel(`npm:${name}`, resolveVersion));
    }
  }

  return {
    localExtensions: sortExtensionNames(unique(localExtensions)),
    packageExtensions: sortExtensionNames(unique(packageExtensions)),
    sourceExtensions: sortExtensionNames(unique(sourceExtensions)),
  };
}

let cachedLocalExtensionNames: Set<string> | undefined;

function getLocalExtensionNames(): Set<string> {
  if (cachedLocalExtensionNames) return cachedLocalExtensionNames;

  const extensionsDir = join(getAgentDir(), "extensions");
  try {
    cachedLocalExtensionNames = new Set(
      readdirSync(extensionsDir, { withFileTypes: true }).flatMap((entry) => {
        if (/\.[cm]?[jt]s$/.test(entry.name))
          return normalizeExtensionName(entry.name);
        if (
          entry.isDirectory() &&
          existsSync(join(extensionsDir, entry.name, "index.ts"))
        ) {
          return entry.name;
        }
        return [];
      }),
    );
  } catch {
    cachedLocalExtensionNames = new Set();
  }
  return cachedLocalExtensionNames;
}

export function parseWelcomeResources(
  text: string,
  localExtensionNames = getLocalExtensionNames(),
  expandedExtensionsText?: string,
  resolveVersion?: PackageVersionResolver,
): WelcomeResources {
  const bodies = new Map<WelcomeSection, string[]>();
  let currentSection: WelcomeSection | undefined;

  for (const rawLine of text.split("\n")) {
    const line = stripAnsi(rawLine).trim();
    const header = line.match(/^\[([^\]]+)\]$/)?.[1];
    if (header) {
      currentSection = WELCOME_SECTIONS.find((section) => section === header);
      if (currentSection && !bodies.has(currentSection)) {
        bodies.set(currentSection, []);
      }
      continue;
    }

    if (line && currentSection) bodies.get(currentSection)?.push(line);
  }

  const context = unique(splitList(bodies.get("Context") ?? []));
  const skills = unique(splitList(bodies.get("Skills") ?? []));
  const prompts = unique(splitList(bodies.get("Prompts") ?? []));
  const themes = unique(splitList(bodies.get("Themes") ?? []));
  const extensionLabels = unique(splitList(bodies.get("Extensions") ?? []));
  const groups =
    parseExpandedExtensionGroups(expandedExtensionsText, localExtensionNames, resolveVersion) ??
    classifyCompactExtensionLabels(extensionLabels, localExtensionNames, resolveVersion);
  const extensions = [
    ...groups.localExtensions,
    ...groups.packageExtensions,
    ...groups.sourceExtensions,
  ];

  return {
    context,
    skills,
    prompts,
    themes,
    extensions,
    packageExtensions: groups.packageExtensions,
    sourceExtensions: groups.sourceExtensions,
  };
}

function findResourceParent(component: unknown): ResourcePanel | undefined {
  if (!isResourcePanel(component)) return undefined;
  const [header, panel] = component.children;
  if (
    isResourcePanel(header) && isResourcePanel(panel) &&
    header.children.some((child) => {
      const expandable = child as CollapsedTextComponent;
      return child instanceof WelcomeHeader ||
        typeof expandable.getCollapsedText === "function" ||
        (typeof expandable.setExpanded === "function" &&
          typeof expandable.state?.expanded === "boolean");
    })
  ) return component;

  // Newer Pi versions keep header/resources/chat inside a document container.
  for (const child of component.children) {
    const parent = findResourceParent(child);
    if (parent) return parent;
  }
  return undefined;
}

function takeResourcePanel(tui: TUI): ResourceBridge | undefined {
  const host = tui as BridgeTui;
  if (host[RESOURCE_BRIDGE_KEY]) return undefined;

  // The early progress header replaces the native ExpandableText before this
  // factory runs. Its controller supplies the verified container location.
  const location = getStartupProgress()?.resourcePanel?.();
  const hinted = location && isResourcePanel(location.parent) &&
    isResourcePanel(location.panel) && location.parent.children.includes(location.panel)
    ? { parent: location.parent, panel: location.panel }
    : undefined;
  const parent = hinted?.parent ?? findResourceParent(tui);
  if (!parent) return undefined;
  const originalIndex = hinted ? parent.children.indexOf(hinted.panel) : RESOURCE_PANEL_INDEX;
  const panel = parent.children[originalIndex];
  if (!isResourcePanel(panel)) return undefined;

  const bridge = { panel, parent, originalIndex };
  parent.children.splice(originalIndex, 1);
  host[RESOURCE_BRIDGE_KEY] = bridge;
  return bridge;
}

function restoreResourcePanel(
  tui: TUI,
  bridge: ResourceBridge | undefined,
): void {
  if (!bridge) return;

  if (!bridge.parent.children.includes(bridge.panel)) {
    const index = Math.min(bridge.originalIndex, bridge.parent.children.length);
    bridge.parent.children.splice(index, 0, bridge.panel);
  }
  // Pi 1.x forwards property writes through its TUI proxy, but not delete.
  (tui as BridgeTui)[RESOURCE_BRIDGE_KEY] = undefined;
}

// ---------------------------------------------------------------------------
// 布局渲染
// ---------------------------------------------------------------------------

function centerLineIn(line: string, width: number): string {
  const clipped = truncateToWidth(line, width, "");
  const padding = Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2));
  return `${" ".repeat(padding)}${clipped}`;
}

function padToWidth(text: string, width: number): string {
  const clipped = truncateToWidth(text, width, "");
  return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function wrapPrefixed(prefix: string, text: string, width: number): string[] {
  const prefixWidth = visibleWidth(prefix);
  if (width <= prefixWidth) return [truncateToWidth(prefix, width, "")];

  const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
  const continuation = " ".repeat(prefixWidth);
  return wrapped.map(
    (line, index) => `${index === 0 ? prefix : continuation}${line}`,
  );
}

function formatResourceItem(item: string, theme: Theme, nameWidth = 0): string {
  const versioned = item.match(/^(.*?) {2}v(\S+)(.*)$/);
  if (!versioned) return theme.fg("text", item);
  const [, name, versions, revision] = versioned;
  const [current, latest] = versions.split("->v");
  const padding = " ".repeat(Math.max(2, nameWidth - visibleWidth(name) + 2));
  return `${theme.fg("text", name)}${padding}${formatVersionChange(current, latest, theme)}${theme.fg("dim", revision)}`;
}

function versionedNameWidth(items: string[]): number {
  return items.reduce((width, item) => {
    const name = item.match(/^(.*?) {2}v\S/)?.[1];
    return name ? Math.max(width, visibleWidth(name)) : width;
  }, 0);
}

function sectionHeading(title: WelcomeSection, count: number, theme: Theme): string {
  return `${theme.fg("mdHeading", `[${title}]`)}${theme.fg("dim", ` ${count}`)}`;
}

function appendSingleColumnRows(
  lines: string[],
  items: string[],
  theme: Theme,
  columnWidth: number,
): void {
  const nameWidth = versionedNameWidth(items);
  for (const item of items) {
    const aligned = formatResourceItem(item, theme, nameWidth);
    lines.push(
      ...wrapPrefixed(
        theme.fg("dim", "  • "),
        visibleWidth(aligned) <= columnWidth - 4
          ? aligned
          : formatResourceItem(item, theme),
        columnWidth,
      ),
    );
  }
}

function getColumnWidths(listWidth: number, columnCount: number): number[] {
  const totalCellWidth = listWidth - LIST_COLUMN_GAP * (columnCount - 1);
  const baseCellWidth = Math.floor(totalCellWidth / columnCount);
  const widerCellCount = totalCellWidth % columnCount;
  return Array.from(
    { length: columnCount },
    (_, index) => baseCellWidth + (index < widerCellCount ? 1 : 0),
  );
}

function canUseThreeColumns(items: string[], columnWidth: number): boolean {
  const listWidth = Math.max(1, columnWidth - 2);
  const fittingColumns = Math.floor(
    (listWidth + LIST_COLUMN_GAP) / (MIN_LIST_COLUMN_WIDTH + LIST_COLUMN_GAP),
  );
  if (fittingColumns < 3) return false;

  const rowsPerColumn = Math.ceil(items.length / 3);
  const cellWidths = getColumnWidths(listWidth, 3);
  return items.every((item, index) => {
    const column = Math.floor(index / rowsPerColumn);
    return visibleWidth(`• ${item}`) <= (cellWidths[column] ?? 0);
  });
}

function getSharedMultiColumnCount(
  resources: WelcomeResources,
  columnWidth: number,
): 2 | 3 {
  const packageExtensions = new Set(
    resources.packageExtensions ??
      resources.vendoredExtensions ??
      resources.extensions.filter((name) => name.startsWith("@")),
  );
  const sourceExtensions = new Set(resources.sourceExtensions ?? []);
  const localExtensions = resources.extensions.filter(
    (name) => !packageExtensions.has(name) && !sourceExtensions.has(name),
  );
  const multiColumnLists = [resources.skills, localExtensions].filter(
    (items) => items.length > MAX_LIST_ROWS_PER_COLUMN,
  );
  return multiColumnLists.every((items) =>
    canUseThreeColumns(items, columnWidth),
  )
    ? 3
    : 2;
}

function appendColumnRows(
  lines: string[],
  items: string[],
  theme: Theme,
  columnWidth: number,
  sharedColumnCount?: 2 | 3,
): void {
  const listWidth = Math.max(1, columnWidth - 2);
  const desiredColumns = Math.ceil(items.length / MAX_LIST_ROWS_PER_COLUMN);
  const fittingColumns = Math.max(
    1,
    Math.floor((listWidth + LIST_COLUMN_GAP) / (MIN_LIST_COLUMN_WIDTH + LIST_COLUMN_GAP)),
  );
  const requestedColumns =
    sharedColumnCount && items.length > MAX_LIST_ROWS_PER_COLUMN
      ? sharedColumnCount
      : desiredColumns;
  let columnCount = Math.min(requestedColumns, fittingColumns);
  // Prefer fewer columns to losing a skill name or an extension's version.
  while (columnCount > 1) {
    const rowCount = Math.ceil(items.length / columnCount);
    const widths = getColumnWidths(listWidth, columnCount);
    if (items.every((item, index) =>
      visibleWidth(`• ${item}`) <= (widths[Math.floor(index / rowCount)] ?? 0),
    )) break;
    columnCount -= 1;
  }

  if (columnCount <= 1) {
    appendSingleColumnRows(lines, items, theme, columnWidth);
    return;
  }

  const rowsPerColumn = Math.ceil(items.length / columnCount);
  const cellWidths = getColumnWidths(listWidth, columnCount);
  const nameWidths = cellWidths.map((_, column) =>
    versionedNameWidth(items.slice(column * rowsPerColumn, (column + 1) * rowsPerColumn)),
  );

  for (let row = 0; row < rowsPerColumn; row += 1) {
    const cells = cellWidths.map((cellWidth, column) => {
      const item = items[column * rowsPerColumn + row];
      if (!item) return " ".repeat(cellWidth);
      const aligned = formatResourceItem(item, theme, nameWidths[column]);
      const label = visibleWidth(aligned) <= cellWidth - 2
        ? aligned : formatResourceItem(item, theme);
      const cell = `${theme.fg("dim", "• ")}${label}`;
      return cell + " ".repeat(Math.max(0, cellWidth - visibleWidth(cell)));
    });
    lines.push(`  ${cells.join(" ".repeat(LIST_COLUMN_GAP))}`.trimEnd());
  }
}

function appendSection(
  lines: string[],
  title: WelcomeSection,
  body: string[],
  theme: Theme,
  columnWidth: number,
  singleColumn = false,
  sharedColumnCount?: 2 | 3,
): void {
  if (lines.length > 0) lines.push("");
  lines.push(sectionHeading(title, body.length, theme));

  if (body.length === 0) {
    lines.push(theme.fg("dim", "  (none)"));
    return;
  }

  if (singleColumn) appendSingleColumnRows(lines, body, theme, columnWidth);
  else appendColumnRows(lines, body, theme, columnWidth, sharedColumnCount);
}

function appendExtensionsSection(
  lines: string[],
  extensions: string[],
  packageExtensionNames: string[] | undefined,
  sourceExtensionNames: string[] | undefined,
  theme: Theme,
  columnWidth: number,
  sharedColumnCount: 2 | 3,
): void {
  if (lines.length > 0) lines.push("");
  lines.push(sectionHeading("Extensions", extensions.length, theme));

  if (extensions.length === 0) {
    lines.push(theme.fg("dim", "  (none)"));
    return;
  }

  const packageExtensions = new Set(
    // Keep direct callers that provide only `extensions` backward compatible.
    packageExtensionNames ?? extensions.filter((name) => name.startsWith("@")),
  );
  const sourceExtensions = new Set(sourceExtensionNames ?? []);
  const localExtensions = extensions.filter(
    (name) => !packageExtensions.has(name) && !sourceExtensions.has(name),
  );
  const installedPackageExtensions = extensions.filter((name) =>
    packageExtensions.has(name),
  );
  const linkedSourceExtensions = extensions.filter((name) =>
    sourceExtensions.has(name),
  );
  type ExtensionGroup = {
    title: string;
    items: string[];
    multiColumn: boolean;
  };
  const groups: ExtensionGroup[] = [
    { title: "Local", items: localExtensions, multiColumn: true },
    {
      title: "Packages",
      items: installedPackageExtensions,
      multiColumn: true,
    },
    {
      title: "Source paths",
      items: linkedSourceExtensions,
      multiColumn: false,
    },
  ].filter(({ items }) => items.length > 0);

  for (const [index, group] of groups.entries()) {
    if (index > 0) lines.push("");
    if (groups.length > 1) {
      lines.push(theme.fg("muted", `  ${group.title} · ${group.items.length}`));
    }
    if (group.multiColumn) {
      appendColumnRows(
        lines,
        group.items,
        theme,
        columnWidth,
        sharedColumnCount,
      );
    } else {
      appendSingleColumnRows(lines, group.items, theme, columnWidth);
    }
  }
}

function appendResourceSection(
  lines: string[],
  title: WelcomeSection,
  resources: WelcomeResources,
  theme: Theme,
  columnWidth: number,
  sharedColumnCount: 2 | 3,
): void {
  if (title === "Extensions") {
    appendExtensionsSection(
      lines,
      resources.extensions,
      resources.packageExtensions ?? resources.vendoredExtensions,
      resources.sourceExtensions,
      theme,
      columnWidth,
      sharedColumnCount,
    );
    return;
  }

  const body =
    title === "Context"
      ? resources.context
      : title === "Skills"
        ? resources.skills
        : title === "Prompts"
          ? resources.prompts
          : resources.themes;
  appendSection(
    lines,
    title,
    body,
    theme,
    columnWidth,
    // Context / Prompts / Themes 固定单列，Skills 按宽度自动多列
    title === "Context" || title === "Prompts" || title === "Themes",
    title === "Skills" ? sharedColumnCount : undefined,
  );
}

function renderBrandColumn(theme: Theme, columnWidth: number, latestPiVersion?: string): string[] {
  const lines = WIDE_LOGO.map((line) =>
    centerLineIn(theme.bold(theme.fg("accent", line)), columnWidth),
  );
  lines.push("");
  lines.push(...wrapTextWithAnsi(
    formatVersionChange(VERSION, latestPiVersion, theme), Math.max(1, columnWidth),
  ).map((line) => centerLineIn(line, columnWidth)));
  return lines;
}

// Context / Prompts / Themes 等小区段并排为一行组：每个区段占一列（标题 + 各项）。
// 若某区段任一项超出并排列宽，则该区段降级为独占渲染（appendSection，可换行），
// 其余区段仍保持并排；整体顺序与传入顺序一致。
function appendInlineSections(
  lines: string[],
  sections: { title: WelcomeSection; body: string[] }[],
  theme: Theme,
  columnWidth: number,
): void {
  if (sections.length === 0) return;
  const gap = LIST_COLUMN_GAP;
  const cellWidth = Math.max(
    1,
    Math.floor((columnWidth - gap * (sections.length - 1)) / sections.length),
  );

  const flush = (): void => {
    const batch = pending;
    if (batch.length === 0) return;
    pending = [];
    if (batch.length === 1) {
      const { title, body } = batch[0];
      appendSection(lines, title, body, theme, columnWidth, true);
      return;
    }
    if (lines.length > 0) lines.push("");

    const columns = batch.map(({ title, body }) => {
      const column: string[] = [sectionHeading(title, body.length, theme)];
      if (body.length === 0) {
        column.push(theme.fg("dim", "  (none)"));
      } else {
        for (const item of body) {
          // 列内宽度有限，超长直接截断（不换行）
          column.push(
            theme.fg(
              "dim",
              `  • ${truncateToWidth(item, Math.max(0, cellWidth - 4), "")}`,
            ),
          );
        }
      }
      return column;
    });

    const height = Math.max(...columns.map((column) => column.length));
    for (let row = 0; row < height; row += 1) {
      const cells = columns.map((column) =>
        padToWidth(column[row] ?? "", cellWidth),
      );
      lines.push(cells.join(" ".repeat(gap)).trimEnd());
    }
  };

  let pending: { title: WelcomeSection; body: string[] }[] = [];
  for (const section of sections) {
    const fitsInline = section.body.every(
      (item) => visibleWidth(`  • ${item}`) <= cellWidth,
    );
    if (fitsInline) {
      pending.push(section);
    } else {
      flush();
      appendSection(lines, section.title, section.body, theme, columnWidth, true);
    }
  }
  flush();
}

function renderResourceColumn(
  resources: WelcomeResources,
  theme: Theme,
  columnWidth: number,
): string[] {
  const lines: string[] = [];
  const sharedColumnCount = getSharedMultiColumnCount(resources, columnWidth);

  // Context / Prompts / Themes 三个小区段并排为一行组，放在原来 Context 的位置
  appendInlineSections(
    lines,
    [
      { title: "Context" as const, body: resources.context },
      { title: "Prompts" as const, body: resources.prompts },
      { title: "Themes" as const, body: resources.themes },
    ].filter(({ body }) => body.length > 0),
    theme,
    columnWidth,
  );
  // Skills / Extensions 保持各自独占一行组
  appendResourceSection(
    lines,
    "Skills",
    resources,
    theme,
    columnWidth,
    sharedColumnCount,
  );
  appendResourceSection(
    lines,
    "Extensions",
    resources,
    theme,
    columnWidth,
    sharedColumnCount,
  );
  return lines;
}

// 右侧内容列：快捷键提示行 + onboarding 行 + 空行 + 各区段
function renderContentColumn(
  resources: WelcomeResources,
  theme: Theme,
  columnWidth: number,
): string[] {
  return [
    ...wrapTextWithAnsi(
      theme.fg("muted", KEYBINDING_HINTS_LINE),
      Math.max(1, columnWidth),
    ),
    ...wrapTextWithAnsi(
      theme.fg("dim", ONBOARDING_LINE),
      Math.max(1, columnWidth),
    ),
    "",
    ...renderResourceColumn(resources, theme, columnWidth),
  ];
}

// 宽屏双列：左侧品牌列（logo + 版本，垂直居中，宽约总宽 1/3），右侧原有欢迎内容
function renderWideWelcome(
  resources: WelcomeResources,
  theme: Theme,
  width: number,
  brandWidth: number,
  latestPiVersion?: string,
): string[] {
  const contentWidth = width - brandWidth - GRID_COLUMN_GAP;
  const brandLines = renderBrandColumn(theme, brandWidth, latestPiVersion);
  const contentLines = renderContentColumn(resources, theme, contentWidth);
  const rowCount = Math.max(brandLines.length, contentLines.length);
  // 品牌列垂直居中：前面补空行，其余由 padToWidth 补到等宽
  const brandTopPad = Math.floor((rowCount - brandLines.length) / 2);
  const rows: string[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const brand = padToWidth(
      brandLines[row - brandTopPad] ?? "",
      brandWidth,
    );
    const content = contentLines[row] ?? "";
    rows.push(`${brand}${" ".repeat(GRID_COLUMN_GAP)}${content}`.trimEnd());
  }
  return rows;
}

// 窄屏单列堆叠：品牌列居中，空行 + 各区段，整体居中（首尾各一个空行）
function renderNarrowWelcome(
  resources: WelcomeResources | undefined,
  theme: Theme,
  width: number,
  latestPiVersion?: string,
): string[] {
  const columnWidth = Math.min(MAX_STACKED_COLUMN_WIDTH, width);
  const lines = ["", ...renderBrandColumn(theme, columnWidth, latestPiVersion)];
  if (resources) {
    lines.push("", ...renderResourceColumn(resources, theme, columnWidth));
  }
  lines.push("");

  const leftPadding = Math.max(0, Math.floor((width - columnWidth) / 2));
  return lines.map((line) =>
    line
      ? `${" ".repeat(leftPadding)}${truncateToWidth(line, columnWidth, "")}`
      : "",
  );
}

function renderWelcomeHeader(
  resources: WelcomeResources | undefined,
  theme: Theme,
  width: number,
  latestPiVersion?: string,
): string[] {
  if (width <= 0) return [];
  const brandWidth = Math.max(BRAND_COLUMN_WIDTH, Math.floor(width / 3));
  if (
    resources &&
    width >= brandWidth + GRID_COLUMN_GAP + MIN_RESOURCE_COLUMN_WIDTH
  ) {
    return renderWideWelcome(resources, theme, width, brandWidth, latestPiVersion);
  }
  return renderNarrowWelcome(resources, theme, width, latestPiVersion);
}

// ---------------------------------------------------------------------------
// 自定义 header
// ---------------------------------------------------------------------------

class WelcomeHeader implements Component {
  private resourceReadyTimer: ReturnType<typeof setTimeout> | undefined;
  private resources: WelcomeResources | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;
  private latestPiVersion: string | undefined;
  private readonly latestPackageVersions = new Map<string, string>();
  private readonly unsubscribeUpdates: () => void;
  private readonly startup = getStartupProgress();
  private readonly unsubscribeStartup: (() => void) | undefined;
  private disposed = false;

  constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly bridge: ResourceBridge | undefined,
    private readonly resolveVersion: PackageVersionResolver,
    forceInitialRender: boolean,
    cwd = process.cwd(),
  ) {
    this.unsubscribeStartup = this.startup?.subscribe(() => {
      this.clearRenderCache();
      this.tui.requestRender();
      if (!this.startup?.snapshot().active) {
        if (this.resourceReadyTimer) clearTimeout(this.resourceReadyTimer);
        this.resourceReadyTimer = setTimeout(() => this.captureResourcesWhenReady(false, 0), 0);
      }
    });
    this.unsubscribeUpdates = subscribeToUpdates(tui, {
      cwd,
      theme,
      onPiUpdate: (version) => {
        this.latestPiVersion = version;
        this.clearRenderCache();
        this.tui.requestRender();
      },
      onPackageUpdates: (updates) => this.receivePackageUpdates(updates),
    });
    // session_start 在核心填充 loaded-resources 面板之前触发，稍后再捕获。
    this.resourceReadyTimer = setTimeout(
      () => this.captureResourcesWhenReady(forceInitialRender, 0),
      0,
    );
  }

  private receivePackageUpdates(updates: PackageUpdateNotice[]): Set<string> {
    const handled = new Set<string>();
    for (const { name, latestVersion } of updates) {
      if (!latestVersion) continue;
      this.latestPackageVersions.set(name, latestVersion);
      if (this.resources?.extensions.some((item) => item.startsWith(`${name}  v`))) {
        handled.add(name);
      }
    }
    this.clearRenderCache();
    this.tui.requestRender();
    return handled;
  }

  private resourcesWithUpdates(): WelcomeResources | undefined {
    if (!this.resources) return this.resources;
    const updateLabel = (item: string): string => {
      const versioned = item.match(/^(.*?) {2}v(\S+)(.*)$/);
      if (!versioned) return item;
      const [, name, current, revision] = versioned;
      const latest = this.latestPackageVersions.get(name);
      return latest && isNewerVersion(latest, current)
        ? `${name}  v${current}->v${latest.replace(/^v/, "")}${revision}`
        : item;
    };
    return {
      ...this.resources,
      extensions: this.resources.extensions.map(updateLabel),
      packageExtensions: this.resources.packageExtensions?.map(updateLabel),
      sourceExtensions: this.resources.sourceExtensions?.map(updateLabel),
      vendoredExtensions: this.resources.vendoredExtensions?.map(updateLabel),
    };
  }

  private captureResourcesWhenReady(
    forceInitialRender: boolean,
    attempt: number,
  ): void {
    if (this.disposed) return;
    if (!this.bridge) {
      this.resourceReadyTimer = undefined;
      if (attempt === 0) this.tui.requestRender(forceInitialRender);
      return;
    }

    let snapshot: ResourcePanelSnapshot;
    try {
      snapshot = inspectResourcePanel(this.bridge.panel);
    } catch {
      this.showNativePanel(forceInitialRender);
      return;
    }
    if (snapshot.requiresNativePanel) {
      this.showNativePanel(forceInitialRender);
      return;
    }

    const { resourceText, expandedExtensionsText } = snapshot;
    const candidateResources = resourceText
      ? parseWelcomeResources(
          resourceText,
          getLocalExtensionNames(),
          expandedExtensionsText,
          this.resolveVersion,
        )
      : undefined;
    // 完整性检查：扩展列表必须包含 pi-ui 自身，防止抓到半填充的快照。
    const resourcePanelIsComplete = Boolean(
      candidateResources?.extensions.some(isSelfExtension),
    );
    if (resourcePanelIsComplete) {
      this.resources = candidateResources;
      this.clearRenderCache();
      this.resourceReadyTimer = undefined;
      this.tui.requestRender(forceInitialRender);
      return;
    }

    if (attempt === 0) {
      // 先渲染品牌列，等完整快照到达后再原子切换为完整布局。
      this.tui.requestRender(forceInitialRender);
    }
    if (this.startup?.snapshot().active) {
      this.resourceReadyTimer = setTimeout(
        () => this.captureResourcesWhenReady(false, attempt), RESOURCE_POLL_INTERVAL_MS,
      );
    } else if (attempt < MAX_RESOURCE_RETRIES) {
      this.resourceReadyTimer = setTimeout(
        () => this.captureResourcesWhenReady(false, attempt + 1),
        RESOURCE_POLL_INTERVAL_MS,
      );
    } else {
      this.showNativePanel(false);
    }
  }

  private showNativePanel(forceRender: boolean): void {
    this.resourceReadyTimer = undefined;
    restoreResourcePanel(this.tui, this.bridge);
    this.clearRenderCache();
    this.tui.requestRender(forceRender);
  }

  private clearRenderCache(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    const startup = this.startup?.snapshot();
    if (startup?.active) {
      return renderStartupProgress(startup, width, (tone, text) => this.theme.fg(tone, text), Math.max(1, this.tui.terminal.rows - 8));
    }
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const resources = this.resourcesWithUpdates();
    const lines = renderWelcomeHeader(resources, this.theme, width, this.latestPiVersion);
    if (resources) {
      this.cachedWidth = width;
      this.cachedLines = lines;
    }
    return lines;
  }

  invalidate(): void {
    this.clearRenderCache();
    this.bridge?.panel.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeStartup?.();
    this.unsubscribeUpdates();
    if (this.resourceReadyTimer) clearTimeout(this.resourceReadyTimer);
    restoreResourcePanel(this.tui, this.bridge);
  }
}

/**
 * 安装自定义欢迎屏：替换核心 header 为"左侧 logo 列 + 右侧原有欢迎内容"的
 * 左右双列布局。session_start 时调用即可，核心在 setHeader 时会先释放旧的
 * 自定义 header（dispose 会恢复原生资源面板），重复调用是安全的。
 */
export function installWelcomeHeader(
  ctx: ExtensionContext,
  reason: SessionStartEvent["reason"],
): void {
  try {
    ctx.ui.setHeader(
      (tui, theme) =>
        new WelcomeHeader(
          tui,
          theme,
          takeResourcePanel(tui),
          createPackageVersionResolver(ctx.cwd),
          reason === "startup",
          ctx.cwd,
        ),
    );
  } catch {
    // ctx 在 session 替换/重载后可能已失效，静默忽略。
  }
}
