import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  pi.on("turn_end", async (event, ctx) => {
    const toolCallCount = event.toolResults?.length ?? 0;
    if (toolCallCount >= 8) {
      ctx.ui.notify(`Turn had ${toolCallCount} tool calls — steering model to yield`, "warn");
      pi.sendUserMessage(
        "You have made many tool calls this turn. Stop, report what you have done so far, and wait for confirmation before continuing.",
        { deliverAs: "steer" }
      );
    }
  });
}
