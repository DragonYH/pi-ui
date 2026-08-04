import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerMessageRenderer, setupCustomUI, clearWorkingIndicatorTimer, clearWelcomeWidget } from "./ui.ts";

export default function (pi: ExtensionAPI) {
  registerMessageRenderer(pi);
  pi.on('session_start', async (event, ctx) => {
    setupCustomUI(pi, ctx, event.reason);
  });

  pi.on('session_shutdown', async () => {
    clearWorkingIndicatorTimer();
    clearWelcomeWidget();
  });
}
