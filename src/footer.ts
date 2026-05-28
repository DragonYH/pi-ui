import * as path from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
export const FOOTER_ICONS = {
  model: "󰚩",
  thinking: "󰧑",
  cwd: "",
  context: "󰨊",
  usage: "󰓡",
  cost: "󰈁",
  branch: "",
  core: "󰏿",
  extension: "",
  extensionSeriesStart: "󰲠",
} as const;
type UsageTotals = {
  input: number;
  output: number;
  cost: number;
};

export function collectUsage(ctx: ExtensionContext): UsageTotals {
  let input = 0;
  let output = 0;
  let cost = 0;

  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== 'message' || entry.message.role !== 'assistant') {
      continue;
    }

    const message = entry.message as AssistantMessage;
    const usage = message.usage;
    if (!usage) {
      continue;
    }

    input += usage.input || 0;
    output += usage.output || 0;
    cost += usage.cost?.total || 0;
  }

  return { input, output, cost };
}

function getThinkingLabel(pi: ExtensionAPI): string {
  return pi.getThinkingLevel?.() || 'default';
}

function getModelLabel(ctx: ExtensionContext): string {
  if (!ctx.model) {
    return 'no-model';
  }

  return [ctx.model.provider, ctx.model.id].filter(Boolean).join('/') || ctx.model.id || 'no-model';
}

function getCwdLabel(cwd?: string): string {
  if (!cwd) {
    return '.';
  }

  const base = path.basename(cwd);
  return base || cwd;
}

function getUsageLabel(usage: UsageTotals): string {
  if (!usage.input && !usage.output) {
    return '-';
  }

  return `↑${formatTokens(usage.input)} ↓${formatTokens(usage.output)}`;
}

function getCostLabel(cost: number): string {
  return cost > 0 ? cost.toFixed(4) : '-';
}

function getContextLabel(ctx: ExtensionContext): string {
  const usageInfo = ctx.getContextUsage?.();
  if (!usageInfo) {
    return '-';
  }

  const usageInfoWithFallbacks = usageInfo as typeof usageInfo & {
    fraction?: number;
    used?: number;
    limit?: number;
  };

  const percent = typeof usageInfo.percent === 'number'
    ? usageInfo.percent
    : typeof usageInfoWithFallbacks.fraction === 'number'
      ? usageInfoWithFallbacks.fraction * 100
      : typeof usageInfoWithFallbacks.used === 'number' && typeof usageInfoWithFallbacks.limit === 'number' && usageInfoWithFallbacks.limit > 0
        ? (usageInfoWithFallbacks.used / usageInfoWithFallbacks.limit) * 100
        : null;

  if (percent === null) {
    return '-';
  }

  const clamped = Math.max(0, Math.min(100, percent));
  return `${clamped.toFixed(clamped >= 10 ? 0 : 1)}%`;
}

function formatBadge(label: string, value: string): string {
  return `${label}${value}`;
}

function sanitizeStatusText(text: string): string {
  // Strip ANSI escape sequences so footer color is enforced
  const ansiPattern = new RegExp(String.raw`\u001b\[[0-9;]*m`, 'g');
  return text.replace(ansiPattern, '').replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim();
}

export function buildCoreFooterSections(
  theme: ExtensionContext['ui']['theme'],
  footerData: ReadonlyFooterDataProvider,
  ctx: ExtensionContext,
  pi: ExtensionAPI,
  usage: UsageTotals,
): string[] {
  const gitBranch = footerData.getGitBranch();

  return [
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.model} `), theme.fg('muted', getModelLabel(ctx))),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.thinking} `), theme.fg('muted', getThinkingLabel(pi))),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.cwd} `), theme.fg('muted', getCwdLabel(ctx.cwd))),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.branch} `), theme.fg('muted', gitBranch || '-')),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.context} `), theme.fg('muted', getContextLabel(ctx))),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.usage} `), theme.fg('muted', getUsageLabel(usage))),
    formatBadge(theme.fg('accent', ` ${FOOTER_ICONS.cost} `), theme.fg('muted', getCostLabel(usage.cost))),
  ];
}

export function renderCoreFooterLine(
  width: number,
  theme: ExtensionContext['ui']['theme'],
  sections: string[],
): string {
  const prefix = ` ${theme.fg('accent', FOOTER_ICONS.core)}${theme.fg('dim', ' |')}${themeSpacer()}`;
  const attempts = [
    sections,
    sections.slice(0, 6),
    [sections[0], sections[2], sections[3], sections[4], sections[6]].filter(Boolean),
    [sections[0], sections[2], sections[3], sections[6]].filter(Boolean),
    [sections[2], sections[3], sections[6]].filter(Boolean),
    [sections[2], sections[3]].filter(Boolean),
  ];

  for (const attempt of attempts) {
    const rendered = `${prefix}${joinFooterSections(attempt)}`;
    if (visibleWidth(rendered) <= width) {
      return rendered;
    }
  }

  const minimum = `${prefix}${joinFooterSections([sections[2], sections[3]].filter(Boolean))}`;
  return truncateToWidth(minimum, width);
}

export function renderExtensionStatusLine(
  width: number,
  theme: ExtensionContext['ui']['theme'],
  footerData: ReadonlyFooterDataProvider,
): string | undefined {
  const extensionStatuses = Array.from(footerData.getExtensionStatuses().values());
  const extensionSeriesStart = FOOTER_ICONS.extensionSeriesStart.codePointAt(0) ?? 0;
  const renderedStatuses = extensionStatuses
    .map((status, index) => {
      const cleanStatus = sanitizeStatusText(status);
      if (!cleanStatus) {
        return '';
      }

      const icon = String.fromCodePoint(extensionSeriesStart + index * 2);
      return formatBadge(theme.fg('accent', ` ${icon} `), theme.fg('muted', cleanStatus));
    })
    .filter(Boolean);

  if (renderedStatuses.length === 0) {
    return undefined;
  }

  const prefix = ` ${theme.fg('accent', FOOTER_ICONS.extension)}${theme.fg('dim', ' |')}${themeSpacer()}`;
  return truncateToWidth(
    `${prefix}${renderedStatuses.join(themeSpacer())}`,
    width,
    theme.fg('dim', '...'),
  );
}

function joinFooterSections(sections: string[]): string {
  return sections.filter(Boolean).join(themeSpacer());
}

function themeSpacer(): string {
  return ' ';
}

function formatTokens(count: number): string {
  if (count < 1000) {
    return `${count}`;
  }

  if (count < 10000) {
    return `${(count / 1000).toFixed(1)}k`;
  }

  if (count < 1000000) {
    return `${Math.round(count / 1000)}k`;
  }

  return `${(count / 1000000).toFixed(1)}M`;
}
