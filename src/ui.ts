import type { ExtensionAPI, ExtensionContext, SessionStartEvent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { BoxedEditor } from "./editor.ts";
import { collectUsage, buildCoreFooterSections, renderCoreFooterLine, renderExtensionStatusLine } from "./footer.ts";
import { installWelcomeHeader } from "./welcome.ts";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function registerMessageRenderer(pi: ExtensionAPI): Parameters<ExtensionAPI["registerMessageRenderer"]>[1] {
  const renderer: Parameters<ExtensionAPI["registerMessageRenderer"]>[1] = (message, options, theme) => {
    const { expanded } = options;
    let text = '';
    text += (message as { content: string }).content;
    if (expanded && message.details) {
      text += '\n' + theme.fg('dim', JSON.stringify(message.details, null, 2));
    }
    return new Text(text, 0, 0);
  };
  pi.registerMessageRenderer('assistant', renderer);
  return renderer;
}

export function setupCustomUI(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  sessionStartReason: SessionStartEvent["reason"],
): void {
  let rerenderFooter: (() => void) | undefined;

  ctx.ui.setEditorComponent((tui, theme, keybindings) => new BoxedEditor(tui, theme, keybindings));

  ctx.ui.setFooter((tui, theme, footerData) => ({
    dispose: footerData.onBranchChange(() => tui.requestRender()),
    render(width: number) {
      rerenderFooter = () => tui.requestRender();
      const usage = collectUsage(ctx);
      const coreSections = buildCoreFooterSections(theme, footerData, ctx, pi, usage);
      const lines = [renderCoreFooterLine(width, theme, coreSections)];
      const extensionLine = renderExtensionStatusLine(width, theme, footerData);

      if (extensionLine) {
        lines.push(extensionLine);
      }

      return lines;
    },
    invalidate() { },
  }));

  // 自定义欢迎屏：替换核心 header 为左右双列布局（左侧 logo + 右侧原有欢迎内容）
  installWelcomeHeader(ctx, sessionStartReason);

  pi.on('agent_start', async () => {
    rerenderFooter?.();
  });

  pi.on('agent_end', async () => {
    rerenderFooter?.();
  });

  pi.on('thinking_level_select', async () => {
    rerenderFooter?.();
  });
}
