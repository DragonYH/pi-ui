import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { BoxedEditor } from "./editor.ts";
import { collectUsage, buildCoreFooterSections, renderCoreFooterLine, renderExtensionStatusLine } from "./footer.ts";

export const WORKING_INDICATOR_FRAMES = ["󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"] as const;


export function registerMessageRenderer(pi: ExtensionAPI): void {
  pi.registerMessageRenderer('assistant', (message, options, theme) => {
    const { expanded } = options;
    let text = '';

    text += (message as { content: string }).content;

    if (expanded && message.details) {
      text += '\n' + theme.fg('dim', JSON.stringify(message.details, null, 2));
    }

    return new Text(text, 0, 0);
  });
}

export function setupCustomUI(pi: ExtensionAPI, ctx: ExtensionContext): void {
  let rerenderFooter: (() => void) | undefined;

  ctx.ui.setWorkingIndicator({
    frames: WORKING_INDICATOR_FRAMES.map((frame, index) => {
      const tone = index === 0 || index === 2 ? 'accent' : 'muted';
      return ctx.ui.theme.fg(tone, frame);
    }),
    intervalMs: 120,
  });

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

  pi.on('model_select', async () => {
    rerenderFooter?.();
  });

  pi.on('thinking_level_select', async () => {
    rerenderFooter?.();
  });

  pi.on('turn_end', async () => {
    rerenderFooter?.();
  });
}
