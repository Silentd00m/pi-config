/**
 * Safety Guard: Network & Exfiltration Prevention
 *
 * SECURITY MODEL:
 * This extension is an APPLICATION-LEVEL safety net, not a kernel boundary.
 * It is complementary to file-permissions.ts + bwrap (filesystem enforcement).
 * For network-level isolation, use bwrap --unshare-net (not done here by design
 * since curl/git/cargo/npm require outbound network access).
 *
 * KNOWN LIMITATIONS (by design or deferred):
 * - Regex-based detection is bypassable via sufficient obfuscation (base64, hex,
 *   variable indirection). A deterministic shell deobfuscation pre-checker is the
 *   correct long-term fix (see Gemini CLI issue #25836).
 * - crawl4ai_execute_js can exfiltrate data via browser JS context — not blocked
 *   here. Mitigation: restrict crawl4ai to known-safe domains at the config level.
 * - MCP tool calls are not monitored — treat mcpo tools as trusted.
 * - Cross-command state tracking (download-then-execute across separate calls) is
 *   not implemented. A 50-command history buffer would catch multi-step attacks.
 *
 * 🔴 Hard-blocked (no override):
 *   - Piped shell execution: curl/wget | sh/bash/python/node/ruby/perl/php
 *   - eval/source with remote fetch
 *   - Multi-stage pipe RCE
 *   - Download-then-execute (curl -o + bash, wget + exec, etc.)
 *   - Hardcoded secrets in commands or file content (tokens, API keys as literals)
 *   - Outbound transfer of sensitive files (.env, id_rsa, private keys)
 *
 * 🟡 Confirmation required:
 *   - curl/wget POST/PUT/PATCH/DELETE requests (data upload)
 *   - scp/rsync to remote hosts (file transfer)
 *   - nc/netcat/ncat commands (raw network access)
 *   - npm/pip/gem/cargo publish (package publishing)
 *   - SSH tunnels
 *   - docker push
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

// ── Secret detection helpers ──────────────────────────────────────────────────

/**
 * Known secret prefixes for common API token formats.
 * These are short enough to miss a pure length-based check.
 */
const KNOWN_SECRET_PREFIXES = [
	"ghp_", // GitHub personal access token
	"gho_", // GitHub OAuth token
	"ghs_", // GitHub server-to-server token
	"github_pat_", // GitHub fine-grained PAT
	"sk-", // OpenAI API key
	"sk-ant-", // Anthropic API key
	"xoxb-", // Slack bot token
	"xoxp-", // Slack user token
	"xapp-", // Slack app-level token
	"glpat-", // GitLab PAT
	"Bearer ", // Generic bearer (short check)
];

/**
 * Shannon entropy — high entropy strings are likely secrets.
 * Threshold of 3.5 bits/char catches most API keys/tokens.
 */
function shannonEntropy(str: string): number {
	const freq = new Map<string, number>();
	for (const c of str) freq.set(c, (freq.get(c) ?? 0) + 1);
	let entropy = 0;
	for (const count of freq.values()) {
		const p = count / str.length;
		entropy -= p * Math.log2(p);
	}
	return entropy;
}

/**
 * Returns true if the value looks like a hardcoded secret.
 * Allows shell variable references and command substitutions through.
 * Flags: known prefixes, long high-entropy literals, long alphanumeric literals.
 */
function isHardcodedSecret(value: string): boolean {
	const v = value.trim();

	// Allow shell variable references: $TOKEN, ${TOKEN}, $(...), `...`
	if (/^\$[{(]?[A-Z_][A-Z0-9_]*[)}]?$/.test(v)) return false;
	if (/^\$\(/.test(v)) return false;
	if (/^`/.test(v)) return false;

	// Known token prefixes (even if short)
	if (KNOWN_SECRET_PREFIXES.some((pfx) => v.startsWith(pfx))) return true;

	// Long strings (≥16 chars) with high Shannon entropy
	if (
		v.length >= 16 &&
		/^[A-Za-z0-9_\-./+=]+$/.test(v) &&
		shannonEntropy(v) >= 3.5
	) {
		return true;
	}

	return false;
}

// ── Detection patterns ────────────────────────────────────────────────────────

/**
 * Piped remote code execution — always hard block.
 * Covers: shell interpreters, scripting languages, eval, source, multi-stage pipes.
 */
const PIPED_RCE_PATTERNS: RegExp[] = [
	// Direct pipe to shell interpreter
	/\b(curl|wget)\b[^|#]*\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|fish)\b/i,
	// Direct pipe to scripting language interpreter
	/\b(curl|wget)\b[^|#]*\|\s*(sudo\s+)?(python|python3|python2|node|nodejs|ruby|perl|php)\b/i,
	// bash/sh <(curl ...) process substitution
	/\b(sh|bash|zsh)\s+<\(\s*(curl|wget)\b/i,
	// bash -c "$(curl ...)" command substitution
	/\b(sh|bash|zsh)\s+-c\s+["'`][^"'`]*\$\(\s*(curl|wget)\b/i,
	// eval with curl/wget (any form)
	/\beval\s+["'`$][^"'`]*(curl|wget)\b/i,
	/\beval\s+\$\(\s*(curl|wget)\b/i,
	// source/dot with process substitution
	/\b(source|\.)\s+<\(\s*(curl|wget)\b/i,
	// Multi-stage pipes that end in a shell/interpreter
	/\b(curl|wget)\b.*\|[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|ruby|perl)\b/i,
];

/**
 * Download-then-execute — always hard block.
 * Covers: -o/-O/redirect to file followed by execution in same command string.
 */
const DOWNLOAD_THEN_EXECUTE_PATTERNS: RegExp[] = [
	// curl/wget -o file && exec
	/\b(curl|wget)\b[^;&\n]*(-o|--output|-O)\s+\S+\s*[;&\n|]+\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|fish|python|python3|node|ruby|perl|php)\b/i,
	// curl > file then exec
	/\b(curl|wget)\b[^>&\n]*>\s*\S+\s*[;&\n|]+\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|fish|python|python3|node|ruby|perl|php)\b/i,
	// chmod +x then immediate execution
	/\bchmod\s+\+x\b.*[;&\n|]+\s*\.?\//i,
	// Indirect: base64 decode then execute
	/\bbase64\s+(-d|--decode)\b.*[;&\n|]+\s*(sudo\s+)?(sh|bash|zsh|python3?|node)\b/i,
	/\becho\b.*\|\s*base64\s+(-d|--decode)\b.*[;&\n|]+\s*(sudo\s+)?(sh|bash|zsh|python3?|node)\b/i,
];

/**
 * Hardcoded secret detection — always hard block.
 * Only triggers on literal values, not env var references ($TOKEN, ${TOKEN}).
 */
const SECRET_PATTERNS: Array<{
	pattern: RegExp;
	captureGroup: number;
	label: string;
}> = [
	{
		pattern:
			/\b(curl|wget)\b.*(-H|--header)\s+['"]?Authorization:\s*(Bearer|Basic|Token)\s+([A-Za-z0-9_\-./+=]{8,})/i,
		captureGroup: 4,
		label: "hardcoded Authorization header",
	},
	{
		pattern:
			/\b(curl|wget)\b.*[?&](token|key|secret|apikey|api_key)=([A-Za-z0-9_\-./+=]{8,})/i,
		captureGroup: 3,
		label: "hardcoded token in URL",
	},
	{
		// Sensitive file transfer — always block regardless of entropy
		pattern:
			/\b(curl|wget|scp|rsync)\b.*\.(env|pem|key|p12|pfx|jks|keystore)\b/i,
		captureGroup: -1,
		label: "sensitive file (.env/.pem/.key/etc.) in transfer command",
	},
	{
		pattern: /\b(curl|wget|scp|rsync)\b.*\bid_rsa\b/i,
		captureGroup: -1,
		label: "SSH private key in transfer command",
	},
	{
		pattern: /\b(curl|wget|scp|rsync)\b.*\.ssh[/\\]/i,
		captureGroup: -1,
		label: ".ssh directory in transfer command",
	},
];

/**
 * Upload / outbound transfer — require user confirmation.
 */
const UPLOAD_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
	{
		pattern:
			/\bcurl\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--request\s*(POST|PUT|PATCH|DELETE))/i,
		label: "curl POST/PUT/PATCH/DELETE",
	},
	{
		pattern:
			/\bcurl\b.*(-d\s|--data[\s=]|--data-raw[\s=]|--data-binary[\s=]|-F\s|--form\s)/i,
		label: "curl data upload",
	},
	{ pattern: /\bwget\b.*--post-(data|file)\b/i, label: "wget POST" },
	{ pattern: /\bscp\b.*\S+@\S+:/i, label: "scp to remote host" },
	{ pattern: /\brsync\b.*\S+@\S+:/i, label: "rsync to remote host" },
	{ pattern: /\b(nc|netcat|ncat)\b/i, label: "netcat (raw network)" },
	{ pattern: /\bnpm\s+publish\b/i, label: "npm publish" },
	{ pattern: /\bpip\s+(upload|publish)\b/i, label: "pip publish" },
	{ pattern: /\bgem\s+push\b/i, label: "gem push" },
	{ pattern: /\bcargo\s+publish\b/i, label: "cargo publish" },
	{ pattern: /\bdocker\s+push\b/i, label: "docker push" },
	{ pattern: /\bssh\b.*-[LRD]\b/i, label: "SSH tunnel" },
];

// ── Check functions ───────────────────────────────────────────────────────────

function checkPipedRCE(text: string): string | null {
	for (const pattern of PIPED_RCE_PATTERNS) {
		if (pattern.test(text)) {
			return "Piped remote code execution is never allowed. Download the script first, review it, then run it explicitly.";
		}
	}
	return null;
}

function checkDownloadThenExecute(text: string): string | null {
	for (const pattern of DOWNLOAD_THEN_EXECUTE_PATTERNS) {
		if (pattern.test(text)) {
			return "Download-then-execute pattern detected. Download the script first, review it manually, then run it explicitly.";
		}
	}
	return null;
}

function checkHardcodedSecrets(text: string): string | null {
	for (const { pattern, captureGroup, label } of SECRET_PATTERNS) {
		const match = text.match(pattern);
		if (!match) continue;

		// For patterns with a specific capture group, verify the value is hardcoded
		if (captureGroup >= 0) {
			const tokenValue = match[captureGroup];
			if (!tokenValue || !isHardcodedSecret(tokenValue)) continue;
		}

		return `Command contains ${label}. Use environment variables (e.g. $TOKEN) instead of hardcoding secrets.`;
	}
	return null;
}

function checkUploadPatterns(text: string): string[] {
	return UPLOAD_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
		({ label }) => label,
	);
}

/**
 * Run all hard-block checks. Returns a reason string if blocked, null if clean.
 */
function checkHardBlocks(text: string): string | null {
	return (
		checkPipedRCE(text) ??
		checkDownloadThenExecute(text) ??
		checkHardcodedSecrets(text) ??
		null
	);
}

/**
 * Shared handler for write and edit tool events.
 * Checks content for RCE patterns, secrets, and upload patterns.
 */
async function handleFileWriteEvent(
	content: string,
	filePath: string,
	ctx: any,
): Promise<{ block: boolean; reason: string } | undefined> {
	// Hard-block: RCE or secrets in written content
	const hardBlockReason = checkHardBlocks(content);
	if (hardBlockReason) {
		if (ctx.hasUI)
			ctx.ui.notify(`🚫 Blocked: dangerous content in ${filePath}`, "error");
		return {
			block: true,
			reason: `Writing to ${filePath}: ${hardBlockReason}`,
		};
	}

	// Confirmation: upload patterns embedded in written content
	const uploadMatches = checkUploadPatterns(content);
	if (uploadMatches.length > 0) {
		if (!ctx.hasUI) {
			return {
				block: true,
				reason: `File content contains network upload patterns (non-interactive mode): ${uploadMatches.join(", ")}`,
			};
		}

		const displayPath =
			filePath.length > 80 ? `…${filePath.slice(-77)}` : filePath;
		const concerns = uploadMatches.map((l) => `• ${l}`).join("\n");
		const ok = await ctx.ui.confirm(
			"🌐 File contains network operations",
			`${concerns}\n\nFile: ${displayPath}\n\nThis file contains commands that send data over the network. Allow writing it?`,
		);

		if (!ok) {
			return {
				block: true,
				reason: `Blocked by user: file content contains ${uploadMatches.join(", ")}`,
			};
		}
	}

	return undefined;
}

// ── Extension ─────────────────────────────────────────────────────────────────

// ── Cross-call state tracking ──────────────────────────────────────────────

/**
 * Ring buffer of the last 10 bash commands with extracted download targets.
 * Catches the most dangerous two-step attack: `curl -o /tmp/x.sh` followed by
 * `bash /tmp/x.sh` in separate tool calls.
 */
interface DownloadRecord {
	command: string;
	file: string;
	timestamp: number;
}

const DOWNLOAD_HISTORY_SIZE = 10;
let downloadHistory: DownloadRecord[] = [];

/**
 * Detect download-to-file patterns: curl/wget with -o, -O, or redirect.
 * Returns the target file path or null.
 */
function extractDownloadTarget(command: string): string | null {
	// curl/wget -o <file> or --output <file>
	const m = command.match(/\b(curl|wget)\b[^;&\n]*(-o|--output)\s+(\S+)/i);
	if (m) return m[3];
	// curl/wget -O (uppercase, saves to remote filename)
	if (/\b(curl|wget)\b[^;&\n]*-O\b/.test(command)) return "<remote-filename>";
	// curl/wget > <file>
	const r = command.match(/\b(curl|wget)\b[^>&\n]*>\s*(\S+)/);
	if (r) return r[1];
	return null;
}

function checkCrossCallExecute(command: string): string | null {
	// Extract the target of any download-to-file pattern
	const target = extractDownloadTarget(command);

	if (target) {
		// Record the download
		downloadHistory.push({
			command,
			file: target,
			timestamp: Date.now(),
		});
		// Keep only last N entries
		if (downloadHistory.length > DOWNLOAD_HISTORY_SIZE) {
			downloadHistory = downloadHistory.slice(-DOWNLOAD_HISTORY_SIZE);
		}
	}

	// Check if the current command executes a recently-downloaded file
	for (const record of downloadHistory) {
		if (record.file === "<remote-filename>") continue; // can't match
		const lower = command.toLowerCase();
		const fileBase = record.file.toLowerCase();
		// Match execution patterns: bash /tmp/x.sh, sh /tmp/x.sh, /tmp/x.sh, etc.
		if (
			lower.includes(`bash ${fileBase}`) ||
			lower.includes(`sh ${fileBase}`) ||
			lower.includes(`zsh ${fileBase}`) ||
			lower.includes(`source ${fileBase}`) ||
			lower.includes(`. ${fileBase}`) ||
			lower.includes(fileBase)
		) {
			return `Cross-call download-then-execute detected. The file ${record.file} was downloaded ${Math.round((Date.now() - record.timestamp) / 1000)}s ago. Download, review, then run explicitly.`;
		}
	}

	return null;
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// --- bash tool ---
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("bash", event)) return undefined;

		const command = event.input.command;

		// Hard-block: RCE or secrets
		const hardBlockReason = checkHardBlocks(command);
		if (hardBlockReason) {
			if (ctx.hasUI)
				ctx.ui.notify("🚫 Blocked: dangerous bash command", "error");
			return { block: true, reason: hardBlockReason };
		}

		// Hard-block: cross-call download-then-execute
		const crossCallReason = checkCrossCallExecute(command);
		if (crossCallReason) {
			if (ctx.hasUI)
				ctx.ui.notify("🚫 Blocked: cross-call download-then-execute", "error");
			return { block: true, reason: crossCallReason };
		}

		// Confirmation: upload / outbound transfer — collect ALL matches, ask once
		const uploadMatches = checkUploadPatterns(command);
		if (uploadMatches.length > 0) {
			if (!ctx.hasUI) {
				return {
					block: true,
					reason: `Network upload blocked (non-interactive mode): ${uploadMatches.join(", ")}`,
				};
			}

			const displayCmd =
				command.length > 200 ? `${command.slice(0, 200)}…` : command;
			const concerns = uploadMatches.map((l) => `• ${l}`).join("\n");
			const ok = await ctx.ui.confirm(
				"🌐 Network operation requires approval",
				`${concerns}\n\nCommand:\n${displayCmd}\n\nThis command sends data over the network. Allow?`,
			);

			if (!ok) {
				return {
					block: true,
					reason: `Blocked by user: ${uploadMatches.join(", ")}`,
				};
			}
		}

		return undefined;
	});

	// --- write tool ---
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("write", event)) return undefined;
		const content = String(event.input.content ?? "");
		const filePath = String(event.input.path ?? "");
		return handleFileWriteEvent(content, filePath, ctx);
	});

	// --- edit tool (was completely unmonitored — FINDING-02) ---
	pi.on("tool_call", async (event, ctx) => {
		if (!isToolCallEventType("edit", event)) return undefined;
		// For edit, the new content is in newContent or new_str depending on pi version
		const content = String(
			(event.input as any).newContent ??
				(event.input as any).new_str ??
				(event.input as any).content ??
				"",
		);
		const filePath = String(event.input.path ?? "");
		return handleFileWriteEvent(content, filePath, ctx);
	});

	// --- session start: show active status ---
	pi.on("session_start", async (_event, ctx) => {
		if (ctx.hasUI) {
			ctx.ui.setStatus(
				"safety-net",
				ctx.ui.theme.fg("success", "🌐 net-guard"),
			);
		}
	});
}
