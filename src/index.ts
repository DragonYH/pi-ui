import { ExtensionRunner, InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installNativeStartup } from "./startup/native.ts";
import { registerMessageRenderer, setupCustomUI } from "./ui.ts";
import { registerWorkingIndicator } from "./working.ts";
import { registerToolCards } from "./tool-cards.ts";

export default function (pi: ExtensionAPI) {
  const renderer = registerMessageRenderer(pi);
  installNativeStartup(ExtensionRunner.prototype, InteractiveMode.prototype, renderer);
  registerWorkingIndicator(pi);
  registerToolCards(pi);
  pi.on('session_start', async (event, ctx) => {
    if (ctx.hasUI && (!("mode" in ctx) || ctx.mode === "tui")) setupCustomUI(pi, ctx, event.reason);
  });
}
