import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile, writeFile } from "node:fs/promises";
import { htmlToMarkdown } from "./convert.js";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "html2md",
    label: "Convert HTML to Markdown",
    description:
      "Convert an HTML file to clean Markdown. " +
      "Pass `output` to write the result directly to disk — " +
      "omit it to receive the Markdown as text.",
    parameters: Type.Object({
      path: Type.String({
        description: "Path to the HTML file to convert.",
      }),
      output: Type.Optional(Type.String({
        description:
          "If provided, write the Markdown to this path instead of returning it. " +
          "Use this when converting many files — it avoids passing large strings back through the tool result.",
      })),
    }),
    async execute(_toolCallId, params) {
      const html = await readFile(params.path as string, "utf8");
      const markdown = await htmlToMarkdown(html);

      if (params.output) {
        await writeFile(params.output as string, markdown, "utf8");
        return {
          content: [{ type: "text", text: `Written to ${params.output}` }],
          details: {},
        };
      }

      return {
        content: [{ type: "text", text: markdown }],
        details: {},
      };
    },
  });
}
