import { ExtensionRunner, InteractiveMode, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { installNativeStartup } from "./startup/native.ts";
import { registerMessageRenderer, setupCustomUI, clearWorkingIndicatorTimer } from "./ui.ts";

export default function (pi: ExtensionAPI) {
  const renderer = registerMessageRenderer(pi);
  installNativeStartup(ExtensionRunner.prototype, InteractiveMode.prototype, renderer);
  pi.on('session_start', async (event, ctx) => {
    if (ctx.hasUI && (!("mode" in ctx) || ctx.mode === "tui")) setupCustomUI(pi, ctx, event.reason);
  });

  pi.on('session_shutdown', async () => {
    clearWorkingIndicatorTimer();
  });
}
