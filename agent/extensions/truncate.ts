import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateHead, DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", async (event) => {
    if (!event.toolName.startsWith("crawl4ai")) return;

    const text = event.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");

    const truncation = truncateHead(text, {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    });

    if (!truncation.truncated) return;

    return {
      content: [
        {
          type: "text",
          text: truncation.content +
            `\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ` +
            `${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}]`,
        },
      ],
      details: event.details,
      isError: false,
    };
  });
}
