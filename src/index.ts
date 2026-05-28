import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerMessageRenderer, setupCustomUI, clearWorkingIndicatorTimer } from "./ui.ts";

export default function (pi: ExtensionAPI) {
  registerMessageRenderer(pi);
  pi.on('session_start', async (_event, ctx) => {
    setupCustomUI(pi, ctx);
  });

  pi.on('session_shutdown', async () => {
    clearWorkingIndicatorTimer();
  });
}
