import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

interface TruncatedRecord {
	id: string;
	toolName: string;
	toolCallId: string;
	fullText: string;
	totalLines: number;
	totalBytes: number;
	shownLines: number;
	shownBytes: number;
}

export default function (pi: ExtensionAPI) {
	const store = new Map<string, TruncatedRecord>();

	// Restore persisted truncation records from session on reload
	pi.on("session_start", async (_event, ctx) => {
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "truncated_content") {
				const data = entry.data as TruncatedRecord;
				if (data && data.id && data.fullText) {
					store.set(data.id, data);
				}
			}
		}
	});

	// Intercept crawl4ai tool results, truncate, and store full text
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

		const id = event.toolCallId;
		const record: TruncatedRecord = {
			id,
			toolName: event.toolName,
			toolCallId: event.toolCallId,
			fullText: text,
			totalLines: truncation.totalLines,
			totalBytes: truncation.totalBytes,
			shownLines: truncation.outputLines,
			shownBytes: truncation.outputBytes,
		};

		store.set(id, record);

		// Persist to session so it survives reloads
		pi.appendEntry("truncated_content", record);

		return {
			content: [
				{
					type: "text",
					text:
						truncation.content +
						`\n\n[Truncated: ${truncation.outputLines}/${truncation.totalLines} lines, ` +
						`${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}]` +
						`\nUse get_truncated_lines(id="${id}", start_line, end_line) to read more.` +
						`\nUse search_truncated_content(pattern) to search the hidden content.`,
				},
			],
			details: event.details,
			isError: false,
		};
	});

	// Tool 1: Retrieve a specific line range from truncated content
	pi.registerTool({
		name: "get_truncated_lines",
		label: "Get Truncated Lines",
		description:
			"Retrieve a specific range of lines from a truncated tool result. Use this after truncation to read the hidden portion, or after search_truncated_content to fetch lines around a match.",
		parameters: Type.Object({
			id: Type.String({
				description:
					"The tool call ID of the truncated result (shown in the truncation notice).",
			}),
			start_line: Type.Integer({
				description:
					"The 1-based line number to start reading from. If this is where truncation began, use the number shown in the truncation notice.",
			}),
			end_line: Type.Optional(
				Type.Integer({
					description:
						"The 1-based line number to stop at (inclusive). If omitted, reads until the end.",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			const record = store.get(params.id);
			if (!record) {
				return {
					content: [
						{
							type: "text",
							text: `No truncated content found for id "${params.id}". It may have been from a previous session that wasn't persisted.`,
						},
					],
					details: {},
				};
			}

			const lines = record.fullText.split("\n");
			const start = Math.max(1, params.start_line);
			const end = params.end_line
				? Math.min(params.end_line, lines.length)
				: lines.length;

			if (start > lines.length) {
				return {
					content: [
						{
							type: "text",
							text: `Line ${start} is beyond the end of the content (${record.totalLines} lines total).`,
						},
					],
					details: {},
				};
			}

			const sliced = lines.slice(start - 1, end).join("\n");
			const slicedLines = lines.slice(start - 1, end).length;
			const slicedBytes = new TextEncoder().encode(sliced).length;

			return {
				content: [
					{
						type: "text",
						text:
							`Content from tool call ${record.id} (${record.toolName})\n` +
							`Lines ${start}-${end} of ${record.totalLines} total:\n\n` +
							sliced +
							`\n\n[${slicedLines} lines, ${formatSize(slicedBytes)}]`,
					},
				],
				details: {
					id: record.id,
					toolName: record.toolName,
					startLine: start,
					endLine: end,
				},
			};
		},
	});

	// Tool 2: Search truncated content with regex, return line numbers
	pi.registerTool({
		name: "search_truncated_content",
		label: "Search Truncated Content",
		description:
			"Search stored truncated content with a regex pattern. Returns matching lines with line numbers and surrounding context. Use get_truncated_lines() to fetch more content around a match.",
		parameters: Type.Object({
			id: Type.Optional(
				Type.String({
					description:
						"Search only this specific truncated result. If omitted, searches all stored records.",
				}),
			),
			pattern: Type.String({
				description:
					"A JavaScript regex pattern (e.g., 'function.*auth', 'error|warn', 'token').",
			}),
			flags: Type.Optional(
				Type.String({
					description: "Regex flags. Default: 'gi' (global, case-insensitive).",
				}),
			),
			context: Type.Optional(
				Type.Integer({
					description:
						"Number of lines of context to show above and below each match. Default: 3.",
				}),
			),
		}),
		async execute(_toolCallId, params) {
			const records: TruncatedRecord[] = params.id
				? [store.get(params.id)].filter(
						(r): r is TruncatedRecord => r !== undefined,
					)
				: Array.from(store.values());

			if (!records.length) {
				return {
					content: [
						{ type: "text", text: "No truncated content available to search." },
					],
					details: {},
				};
			}

			const regex = new RegExp(params.pattern, params.flags || "gi");
			const ctxLines = Math.max(0, params.context || 3);
			const results: {
				id: string;
				toolName: string;
				totalLines: number;
				matches: {
					line: number;
					text: string;
					context: { line: number; text: string }[];
				}[];
			}[] = [];

			for (const record of records) {
				const lines = record.fullText.split("\n");
				const matches: {
					line: number;
					text: string;
					context: { line: number; text: string }[];
				}[] = [];

				for (let i = 0; i < lines.length; i++) {
					regex.lastIndex = 0;
					if (regex.test(lines[i])) {
						const matchLine = i + 1; // 1-based
						const contextStart = Math.max(0, i - ctxLines);
						const contextEnd = Math.min(lines.length - 1, i + ctxLines);

						const context: { line: number; text: string }[] = [];
						for (let j = contextStart; j <= contextEnd; j++) {
							context.push({ line: j + 1, text: lines[j] });
						}

						matches.push({
							line: matchLine,
							text: lines[i],
							context,
						});
					}
				}

				if (matches.length > 0) {
					results.push({
						id: record.id,
						toolName: record.toolName,
						totalLines: record.totalLines,
						matches,
					});
				}
			}

			if (!results.length) {
				return {
					content: [
						{
							type: "text",
							text: `No matches found for pattern "${params.pattern}" in ${records.length} record(s).`,
						},
					],
					details: {},
				};
			}

			// Format output
			let output = "";
			for (const result of results) {
				output += `Results for id "${result.id}" (${result.toolName}, ${result.totalLines} lines):\n`;

				for (const [mi, match] of result.matches.entries()) {
					if (mi > 0) output += "\n";
					const ctx = match.context;
					for (const c of ctx) {
						const marker = c.line === match.line ? ">>>" : "   ";
						output += `${marker} ${String(c.line).padStart(4)}: ${c.text}\n`;
					}
				}
				output += `\n`;
			}

			output +=
				`Use get_truncated_lines(id, start_line, end_line) to read full content around a match.\n` +
				`Use search_truncated_content(pattern) again with a refined pattern if needed.`;

			return {
				content: [{ type: "text", text: output }],
				details: {
					totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0),
					results,
				},
			};
		},
	});
}
