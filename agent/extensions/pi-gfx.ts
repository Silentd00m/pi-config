import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join, isAbsolute } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Protocol builders — return escape sequence strings, never write to stdout
// ---------------------------------------------------------------------------

function buildKittySequence(buffer: Buffer): string {
  const b64 = buffer.toString("base64");
  const chunkSize = 4096;
  let offset = 0;
  let result = "";

  while (offset < b64.length) {
    const chunk = b64.slice(offset, offset + chunkSize);
    const isLast = offset + chunkSize >= b64.length;
    const m = isLast ? 0 : 1;
    const prefix =
      offset === 0 ? `\x1b_Ga=T,f=100,m=${m};` : `\x1b_Gm=${m};`;
    result += `${prefix}${chunk}\x1b\\`;
    offset += chunkSize;
  }

  return result + "\n";
}

async function buildSixelSequence(fullPath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`chafa -f sixel "${fullPath}"`);
    return stdout + "\n";
  } catch {
    try {
      const { stdout } = await execAsync(`img2sixel "${fullPath}"`);
      return stdout + "\n";
    } catch {
      throw new Error(
        "Sixel rendering failed. Please install 'chafa' or 'libsixel'."
      );
    }
  }
}

function detectKitty(): boolean {
  const env = process.env;
  return (
    !!env.KONSOLE_VERSION ||
    env.TERM === "xterm-kitty" ||
    env.AGENT_GRAPHICS === "kitty"
  );
}

// ---------------------------------------------------------------------------
// TUI component that emits the image escape sequence during pi's render pass
// ---------------------------------------------------------------------------

class ImageComponent extends Text {
  private sequence: string;
  private rendered = false;

  constructor(sequence: string, caption: string) {
    // Display caption as fallback text
    super(caption, 0, 0);
    this.sequence = sequence;
  }

  override render(width: number): string[] {
    if (!this.rendered) {
      // Emit the image sequence once, then show caption on next line
      this.rendered = true;
      return [this.sequence, super.render(width)[0] ?? ""];
    }
    return super.render(width);
  }
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default async function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "terminal_preview",
    label: "Preview Image",
    description:
      "Renders an image directly inline in the terminal. " +
      "Attempts Kitty protocol natively, with an automatic Sixel fallback.",
    parameters: Type.Object({
      filepath: Type.String({
        description:
          "Relative or absolute path to the image file (MUST be .png or .jpg).",
      }),
      protocol: Type.Optional(
        Type.Union(
          [
            Type.Literal("auto"),
            Type.Literal("kitty"),
            Type.Literal("sixel"),
          ],
          {
            description: "Force a specific protocol. Defaults to 'auto'.",
          }
        )
      ),
    }),

    // ---------------------------------------------------------------------------
    // Render the image during pi's own TUI draw cycle instead of writing to
    // stdout directly. Direct stdout writes are immediately overwritten by pi's
    // next TUI redraw — this approach hands the escape sequence to the TUI
    // renderer so it's included in the draw pass.
    // ---------------------------------------------------------------------------
    renderResult(result, _options, _theme, context) {
      const details = result.details as {
        sequence?: string;
        caption?: string;
        error?: string;
      } | null;

      if (!details?.sequence) {
        // Error case or no sequence — plain text
        const t =
          (context.lastComponent as Text | undefined) ??
          new Text(result.content[0]?.text ?? "", 0, 0);
        t.setText(result.content[0]?.text ?? "");
        return t;
      }

      // Reuse existing component to avoid flickering on re-render
      if (context.lastComponent instanceof ImageComponent) {
        return context.lastComponent;
      }

      return new ImageComponent(
        details.sequence,
        details.caption ?? result.content[0]?.text ?? ""
      );
    },

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const fullPath = isAbsolute(params.filepath)
        ? params.filepath
        : join(ctx.cwd, params.filepath);

      const requestedProtocol = params.protocol ?? "auto";

      try {
        const useKitty =
          requestedProtocol === "kitty" ||
          (requestedProtocol === "auto" && detectKitty());

        let sequence: string;
        let protocol: string;

        if (useKitty) {
          try {
            const buffer = await readFile(fullPath);
            sequence = buildKittySequence(buffer);
            protocol = "kitty";
          } catch {
            // Kitty sequence build failed — fall back to Sixel
            sequence = await buildSixelSequence(fullPath);
            protocol = "sixel (kitty fallback)";
          }
        } else {
          sequence = await buildSixelSequence(fullPath);
          protocol = "sixel";
        }

        return {
          content: [
            {
              type: "text",
              text: `Rendered ${params.filepath} (${protocol})`,
            },
          ],
          details: {
            sequence,
            caption: `[${params.filepath}]`,
            path: fullPath,
            protocol,
          },
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [
            { type: "text", text: `Failed to render image: ${message}` },
          ],
          details: { error: message },
        };
      }
    },
  });
}
