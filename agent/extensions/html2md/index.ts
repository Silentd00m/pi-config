import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import TurndownService from "turndown";
import { Type } from "typebox";

function walkDir(dirPath: string): string[] {
	const results: string[] = [];
	const entries = fs.readdirSync(dirPath, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkDir(fullPath));
		} else if (/\.(html|htm)$/i.test(entry.name)) {
			results.push(fullPath);
		}
	}
	return results;
}

const turndownService = new TurndownService({
	headingStyle: "atx",
	codeBlockStyle: "fenced",
	bulletListMarker: "-",
	strongDelimiter: "**",
	emDelimiter: "*",
});

// Preserve code blocks inside <pre> tags without extra indentation
turndownService.addRule("fencedCodeBlock", {
	filter: (node) => {
		const name = node.nodeName;
		return (
			name === "PRE" ||
			(name === "CODE" && node.parentElement?.nodeName === "PRE")
		);
	},
	replacement: (content, node) => {
		const language =
			(node as HTMLElement).getAttribute("data-language") ??
			(node as HTMLElement)
				.getAttribute("class")
				?.split(/\s+/)
				.find((c) => c.startsWith("language-"))
				?.replace("language-", "");

		const text = content.trimEnd();
		const fence = "```";
		return `${fence}${language ?? ""}\n${text}\n${fence}\n\n`;
	},
});

// Skip <pre> wrapper when <code> inside is handled
turndownService.addRule("preWrapper", {
	filter: (node) => node.nodeName === "PRE",
	replacement: (content) => content,
});

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "html2md",
		label: "HTML to Markdown",
		description:
			"Convert an HTML file to Markdown format and return the result. Use this when the user asks to convert, parse, or extract content from HTML files.",
		promptSnippet: "Convert HTML files to Markdown format",
		promptGuidelines: [
			"Use html2md when the user wants to convert an HTML file to Markdown.",
			"Use html2md to extract readable text from HTML without manually parsing tags.",
		],
		parameters: Type.Object({
			file: Type.String({
				description:
					"Path to the HTML file or directory to convert (absolute or relative to cwd).",
			}),
			recursive: Type.Optional(
				Type.Boolean({
					description:
						"When true and file is a directory, convert all .html/.htm files found recursively.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const targetPath = path.resolve(ctx.cwd, params.file);

			if (!fs.existsSync(targetPath)) {
				return {
					content: [{ type: "text", text: `Not found: ${targetPath}` }],
					details: { isError: true },
				};
			}

			const isDir = fs.statSync(targetPath).isDirectory();
			const files =
				params.recursive && isDir ? walkDir(targetPath) : [targetPath];

			if (files.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No HTML files found in: ${targetPath}`,
						},
					],
					details: { isError: true },
				};
			}

			if (!params.recursive) {
				// Single file mode
				const html = fs.readFileSync(targetPath, "utf-8");
				const markdown = turndownService.turndown(html);

				return {
					content: [{ type: "text", text: markdown }],
					details: {
						source: targetPath,
						size: html.length,
						markdownLength: markdown.length,
					},
				};
			}

			// Recursive directory mode
			const results: string[] = [];
			let totalSize = 0;
			let totalMarkdown = 0;

			for (const filePath of files) {
				try {
					const html = fs.readFileSync(filePath, "utf-8");
					const markdown = turndownService.turndown(html);
					const relPath = path.relative(targetPath, filePath);
					results.push(`--- ${relPath} ---\n${markdown}\n`);
					totalSize += html.length;
					totalMarkdown += markdown.length;
				} catch (err) {
					results.push(
						`--- ${path.relative(targetPath, filePath)} ---\nError: ${err}\n`,
					);
				}
			}

			return {
				content: [{ type: "text", text: results.join("\n") }],
				details: {
					source: targetPath,
					filesConverted: files.length,
					totalSize,
					totalMarkdown,
				},
			};
		},
	});
}
