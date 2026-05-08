import { execSync } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import chalk from "chalk";
import YAML from "yaml";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_RELATIVE_PATH = "./file-permissions.yaml";
const PERSONA_RELATIVE_PATH = "./persona.yaml";
const GLOBAL_CONFIG_PATH = path.join(
	os.homedir(),
	".pi",
	"agent",
	"file-permissions.yaml",
);
const GUARDED_TOOLS = ["read", "write", "edit", "find", "grep", "ls"] as const;
const OVERRIDDEN_TOOL_NAMES = [
	"read",
	"write",
	"edit",
	"find",
	"grep",
	"ls",
	"bash",
] as const;
const BASH_FORBIDDEN_COMMANDS = [
	"find",
	"grep",
	"rg",
	"ls",
	"tree",
	"fd",
	"ag",
	"ack",
	"locate",
] as const;

// Config file basenames — used for name-based blocking in bash commands
const CONFIG_FILE_NAMES = ["file-permissions.yaml", "persona.yaml"];

// System directories always mounted read-only in the bwrap sandbox
const BWRAP_SYSTEM_RO = [
	"/usr",
	"/bin",
	"/sbin",
	"/lib",
	"/lib64",
	"/etc/resolv.conf",
	"/etc/ssl",
	"/etc/ca-certificates",
	"/etc/passwd",
	"/etc/group",
	"/etc/localtime",
	"/etc/hostname",
];

// Environment variables to preserve inside the sandbox after --clearenv.
// Everything else is stripped to prevent LD_PRELOAD, PATH hijacking, etc.
const BWRAP_PRESERVED_ENV = [
	"PATH",
	"HOME",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TERM",
	"USER",
	"LOGNAME",
	"SHELL",
	// Rust toolchain
	"CARGO_HOME",
	"RUSTUP_HOME",
	"RUSTUP_TOOLCHAIN",
	// Git identity
	"GIT_AUTHOR_NAME",
	"GIT_AUTHOR_EMAIL",
	"GIT_COMMITTER_NAME",
	"GIT_COMMITTER_EMAIL",
	// Node / npm
	"npm_config_cache",
	"npm_config_prefix",
	// XDG
	"XDG_RUNTIME_DIR",
	"XDG_DATA_HOME",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GuardedToolName = (typeof GUARDED_TOOLS)[number];
type PermissionAction = "allow" | "ask" | "deny";

type RawDomain = {
	path: string;
	permissions: Record<string, string>;
	comment?: string;
};

type RawConfig = {
	domains: RawDomain[] | null;
};

type Domain = {
	path: string;
	raw: string;
	permissions: Map<GuardedToolName, PermissionAction>;
	comment?: string;
};

type PermissionRules = {
	configPath: string;
	domains: Domain[];
};

type LoadedRules = {
	rules: PermissionRules | null;
	fingerprint: string | null;
};

type AccessResult =
	| { allowed: true }
	| { allowed: false; action: "ask" | "deny"; reason: string };

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function normalizePath(value: string): string {
	const normalized = path.resolve(value).replace(/\\/g, "/");
	return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function stripAtPrefix(value: string): string {
	return value.startsWith("@") ? value.slice(1) : value;
}

function expandTilde(value: string): string {
	if (value === "~") return os.homedir();
	if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
	return value;
}

function resolveToolPath(rawPath: string, cwd: string): string {
	const cleaned = expandTilde(stripAtPrefix(rawPath.trim()));
	return normalizePath(path.resolve(cwd, cleaned));
}

/**
 * Resolve a path and follow symlinks via realpath().
 * Falls back to resolveToolPath for paths that don't exist yet (new files).
 */
async function resolveRealPath(rawPath: string, cwd: string): Promise<string> {
	const resolved = resolveToolPath(rawPath, cwd);
	try {
		return normalizePath(await realpath(resolved));
	} catch {
		// File doesn't exist yet — use resolved path as-is
		return resolved;
	}
}

function isSameOrDescendant(parent: string, target: string): boolean {
	return target === parent || target.startsWith(`${parent}/`);
}

function getProtectedPaths(cwd: string): string[] {
	return [
		normalizePath(path.join(cwd, CONFIG_RELATIVE_PATH)),
		normalizePath(path.join(cwd, PERSONA_RELATIVE_PATH)),
		GLOBAL_CONFIG_PATH,
	];
}

// ---------------------------------------------------------------------------
// Bubblewrap sandbox
// ---------------------------------------------------------------------------

/**
 * Wrap a bash command in a bwrap sandbox.
 *
 * Security properties:
 * - --unshare-all --share-net: isolates all namespaces, preserves network
 * - --new-session: prevents TIOCSTI ioctl sandbox escape (CVE-2017-5226)
 * - --die-with-parent: sandbox dies if pi process dies
 * - --clearenv + --setenv: strips LD_PRELOAD, PATH hijack, GIT_CONFIG_GLOBAL etc.
 * - --dev: new devtmpfs (safe minimal device set, NOT host /dev bind)
 * - --perms 0700 --size 10485760 --tmpfs /tmp: restricted isolated tmpfs
 * - $HOME: empty read-only tmpfs (0500) — SSH keys, .bashrc, .npmrc etc. invisible
 * - ~/.pi mounted read-only on top of home tmpfs — agent can read skills/config
 * - cwd: read-write bind mount
 * - Config-defined domains: rw or ro based on permissions
 */
function buildBwrapCommand(
	command: string,
	cwd: string,
	rules: PermissionRules | null,
): string {
	const args: string[] = ["bwrap"];

	// Namespace isolation — share network for curl/git/cargo/npm
	args.push("--unshare-all", "--share-net");

	// Prevent TIOCSTI sandbox escape (CVE-2017-5226)
	args.push("--new-session");

	// Kill sandbox if pi process dies
	args.push("--die-with-parent");

	// Essential pseudo-filesystems
	args.push("--proc", "/proc");
	args.push("--dev", "/dev");

	// Restricted /tmp: 10MiB, owner-only (0700), isolated tmpfs
	// --perms and --size must precede --tmpfs (per man page)
	args.push("--perms", "0700", "--size", "10485760", "--tmpfs", "/tmp");

	// System directories (read-only)
	for (const sysPath of BWRAP_SYSTEM_RO) {
		args.push("--ro-bind-try", sysPath, sysPath);
	}

	// Project directory (read-write — this is the primary workspace)
	args.push("--bind", cwd, cwd);

	// Mount an empty read-only tmpfs at $HOME so it exists but is non-writable
	// and contains nothing. This hides SSH keys, .bashrc, .npmrc, .gitconfig, etc.
	// 0500 = owner read+execute (can traverse) but no write.
	// Must come BEFORE the ~/.pi bind so the bind overlays on top.
	const homeDir = os.homedir();
	args.push("--perms", "0500", "--tmpfs", homeDir);

	// ~/.pi mounted read-only on top of the empty home tmpfs.
	// Agent needs to read skills/config but must not be able to write to it.
	const piDir = path.join(homeDir, ".pi");
	args.push("--ro-bind-try", piDir, piDir);

	// Config-defined domains — rw if domain has write/edit allow, ro otherwise
	if (rules) {
		for (const domain of rules.domains) {
			const canWrite =
				domain.permissions.get("write") === "allow" ||
				domain.permissions.get("edit") === "allow";
			if (canWrite) {
				args.push("--bind-try", domain.path, domain.path);
			} else {
				args.push("--ro-bind-try", domain.path, domain.path);
			}
		}
	}

	// Set working directory inside sandbox
	args.push("--chdir", cwd);

	// Strip all environment variables, then restore only what's needed.
	// Prevents LD_PRELOAD, PATH hijacking, GIT_CONFIG_GLOBAL, PYTHONPATH, etc.
	args.push("--clearenv");
	for (const key of BWRAP_PRESERVED_ENV) {
		const val = process.env[key];
		if (val !== undefined) {
			args.push("--setenv", key, val);
		}
	}
	// Always set PWD explicitly to cwd
	args.push("--setenv", "PWD", cwd);

	// The actual command
	args.push("--", "bash", "-c", command);

	// Shell-quote each argument
	return args
		.map((a) => {
			if (a.startsWith("--")) return a;
			if (/[\s"'\\$`!]/.test(a)) return `'${a.replace(/'/g, "'\\''")}'`;
			return a;
		})
		.join(" ");
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function validatePermissions(
	perms: unknown,
	domainPath: string,
): Map<GuardedToolName, PermissionAction> {
	if (typeof perms !== "object" || perms === null || Array.isArray(perms)) {
		throw new Error(
			`permissions for "${domainPath}" must be a map of tool: action pairs`,
		);
	}

	const result = new Map<GuardedToolName, PermissionAction>();
	for (const [tool, action] of Object.entries(
		perms as Record<string, unknown>,
	)) {
		const lowerTool = tool.toLowerCase();
		if (!(GUARDED_TOOLS as readonly string[]).includes(lowerTool)) {
			throw new Error(
				`Unknown tool "${tool}" for "${domainPath}". Valid: ${GUARDED_TOOLS.join(", ")}`,
			);
		}
		if (action !== "allow" && action !== "ask" && action !== "deny") {
			throw new Error(
				`Invalid action "${action}" for "${tool}" in "${domainPath}". Valid: allow, ask, deny`,
			);
		}
		result.set(lowerTool as GuardedToolName, action);
	}
	return result;
}

function extractDomainComments(raw: string, domainsKeyName: string): string[] {
	const comments: string[] = [];
	try {
		const doc = YAML.parseDocument(raw);
		const root = doc.contents;
		if (!YAML.isMap(root)) return comments;

		for (const topPair of root.items) {
			if (
				!YAML.isPair(topPair) ||
				!YAML.isScalar(topPair.key) ||
				(topPair.key as { value: unknown }).value !== domainsKeyName
			)
				continue;

			const seq = topPair.value;
			if (!YAML.isSeq(seq)) break;

			for (const item of seq.items) {
				let comment = "";
				if (YAML.isMap(item)) {
					for (const domainPair of item.items) {
						if (
							YAML.isPair(domainPair) &&
							YAML.isScalar(domainPair.key) &&
							(domainPair.key as { value: unknown }).value === "path" &&
							YAML.isScalar(domainPair.value)
						) {
							const c = (domainPair.value as { comment?: string }).comment;
							if (c) comment = c.trim();
							break;
						}
					}
				}
				comments.push(comment);
			}
			break;
		}
	} catch {
		// comments are best-effort; ignore errors
	}
	return comments;
}

function parseRawDomains(
	rawDomains: RawDomain[],
	cwd: string,
	comments: string[] = [],
): Domain[] {
	const domains: Domain[] = [];
	for (let i = 0; i < rawDomains.length; i++) {
		const entry = rawDomains[i];
		if (
			typeof entry !== "object" ||
			entry === null ||
			typeof entry.path !== "string"
		) {
			throw new Error("Each domain must have a 'path' string");
		}
		domains.push({
			path: resolveToolPath(entry.path, cwd),
			raw: entry.path,
			permissions: validatePermissions(entry.permissions, entry.path),
			comment: comments[i] || undefined,
		});
	}
	return domains;
}

async function parseConfig(
	raw: string,
	configPath: string,
	cwd: string,
): Promise<LoadedRules> {
	const parsed = YAML.parse(raw) as RawConfig;

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Top-level YAML document must be a mapping");
	}
	if (parsed.domains !== null && !Array.isArray(parsed.domains)) {
		throw new Error("'domains' must be an array");
	}

	const rawDomains = parsed.domains ?? [];
	const comments = extractDomainComments(raw, "domains");
	return {
		fingerprint: raw,
		rules: { configPath, domains: parseRawDomains(rawDomains, cwd, comments) },
	};
}

async function loadRules(cwd: string): Promise<LoadedRules> {
	// 1. Project-local file-permissions.yaml
	const configPath = path.join(cwd, CONFIG_RELATIVE_PATH);
	try {
		const raw = await readFile(configPath, "utf8");
		return await parseConfig(raw, configPath, cwd);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	// 2. persona.yaml (pi-teammate)
	const personaPath = path.join(cwd, PERSONA_RELATIVE_PATH);
	try {
		const raw = await readFile(personaPath, "utf8");
		const parsed = YAML.parse(raw) as Record<string, unknown>;

		if (
			typeof parsed !== "object" ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return { rules: null, fingerprint: null };
		}
		if (!("domains" in parsed)) {
			return { rules: null, fingerprint: null };
		}

		const rawDomains = Array.isArray(parsed.domains)
			? (parsed.domains as RawDomain[])
			: [];
		const comments = extractDomainComments(raw, "domains");
		return {
			fingerprint: raw,
			rules: {
				configPath: personaPath,
				domains: parseRawDomains(rawDomains, cwd, comments),
			},
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	// 3. Global ~/.pi/agent/file-permissions.yaml
	try {
		const raw = await readFile(GLOBAL_CONFIG_PATH, "utf8");
		return await parseConfig(raw, GLOBAL_CONFIG_PATH, cwd);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}

	return { rules: null, fingerprint: null };
}

// ---------------------------------------------------------------------------
// Access evaluation
// ---------------------------------------------------------------------------

async function getTargetPath(
	toolName: GuardedToolName,
	input: Record<string, unknown>,
	cwd: string,
): Promise<string | null> {
	const rawPath =
		typeof input.path === "string" && input.path.trim().length > 0
			? input.path
			: cwd;

	switch (toolName) {
		case "read":
		case "write":
		case "edit":
			if (typeof input.path !== "string" || input.path.trim().length === 0)
				return null;
			// Resolve symlinks to prevent symlink-based path traversal
			return resolveRealPath(input.path, cwd);

		case "find":
		case "grep":
		case "ls":
			return resolveRealPath(rawPath, cwd);
	}
}

function findMatchingDomain(
	rules: PermissionRules,
	targetPath: string,
): Domain | undefined {
	let best: Domain | undefined;
	for (const domain of rules.domains) {
		if (isSameOrDescendant(domain.path, targetPath)) {
			if (!best || domain.path.length > best.path.length) {
				best = domain;
			}
		}
	}
	return best;
}

function evaluateAccess(
	rules: PermissionRules,
	toolName: GuardedToolName,
	targetPath: string,
	cwd: string,
): AccessResult {
	const domain = findMatchingDomain(rules, targetPath);
	if (domain) {
		const action = domain.permissions.get(toolName);
		if (action === "allow") return { allowed: true };
		if (action === "ask") {
			return {
				allowed: false,
				action: "ask",
				reason: `"${toolName}" on "${domain.raw}" requires approval`,
			};
		}
		return {
			allowed: false,
			action: "deny",
			reason: `"${toolName}" is not permitted on "${domain.raw}"`,
		};
	}

	// Default auto-allow: cwd
	if (isSameOrDescendant(normalizePath(cwd), targetPath))
		return { allowed: true };

	// Default auto-allow: ~/.pi (read-only enforced by bwrap for bash; app-level for Node tools)
	const piDir = normalizePath(path.join(os.homedir(), ".pi"));
	if (isSameOrDescendant(piDir, targetPath)) return { allowed: true };

	return {
		allowed: false,
		action: "deny",
		reason: `Path "${targetPath}" is not within any allowed domain in ${path.basename(rules.configPath)}`,
	};
}

// ---------------------------------------------------------------------------
// Bash validation (forbidden subcommands — paths handled by bwrap at kernel level)
// ---------------------------------------------------------------------------

function hasCommandLike(command: string, name: string): boolean {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const pattern = new RegExp(
		`(^|[\\s;|&()])(?:[^\\s;|&()]+/)?${escaped}(?=($|[\\s;|&()]))`,
	);
	return pattern.test(command);
}

function validateBashCommand(command: string): {
	allowed: boolean;
	reason?: string;
} {
	// Note: this is a UX layer to discourage misuse of dedicated tools.
	// It is bypassable via variable expansion — bwrap is the actual security boundary.
	const matched = BASH_FORBIDDEN_COMMANDS.find((name) =>
		hasCommandLike(command, name),
	);
	if (!matched) return { allowed: true };
	return {
		allowed: false,
		reason: `bash may not invoke ${matched}; use the dedicated ${matched === "rg" ? "grep" : matched} tool instead.`,
	};
}

// ---------------------------------------------------------------------------
// Summary / prompt helpers
// ---------------------------------------------------------------------------

function configLabel(rules: PermissionRules): string {
	return path.basename(rules.configPath);
}

function domainLabel(domain: Domain): string {
	return domain.comment ? `${domain.raw}  # ${domain.comment}` : domain.raw;
}

function buildPermissionSummary(rules: PermissionRules): string {
	const lines = [
		`File permissions active from ${configLabel(rules)} (bash sandboxed via bwrap):`,
	];
	for (const domain of rules.domains) {
		const perms = [...domain.permissions.entries()]
			.map(([t, a]) => `${t}:${a}`)
			.join(", ");
		lines.push(`  ${domainLabel(domain)} → {${perms}}`);
	}
	lines.push(
		"Everything not listed is denied. $HOME is a read-only empty sandbox.",
	);
	return lines.join("\n");
}

function buildSystemPromptNotice(rules: PermissionRules): string {
	const domainLines = rules.domains.map((d) => {
		const perms = [...d.permissions.entries()]
			.map(([t, a]) => `${t}:${a}`)
			.join(", ");
		return `- ${domainLabel(d)}: {${perms}}`;
	});

	return [
		"## File Permission Policy",
		`Permissions are controlled by ${configLabel(rules)}.`,
		"Only the following paths and tools are allowed:",
		...domainLines,
		"",
		"By default, everything in the current project folder is accessible.",
		"Bash commands run inside a bubblewrap sandbox — filesystem access is enforced at the kernel level.",
		"$HOME inside the sandbox is an empty read-only tmpfs. Only ~/.pi is accessible (read-only).",
		"Node.js file tools (read/write/edit/find/grep/ls) are enforced at the application level.",
		"Permission config files (file-permissions.yaml, persona.yaml) are read-only and must never be modified.",
		"If a tool reports a permission restriction, NEVER try a workaround. Stop and report the limitation.",
	].join("\n");
}

function buildToolDescription(
	baseDesc: string,
	toolName: GuardedToolName,
	rules: PermissionRules,
): string {
	const allowed = rules.domains.filter((d) => {
		const a = d.permissions.get(toolName);
		return a === "allow" || a === "ask";
	});
	if (allowed.length === 0)
		return `${baseDesc} This tool is not permitted on any configured path.`;
	const paths = allowed.map((d) => domainLabel(d)).join(", ");
	return `${baseDesc} Allowed paths: ${paths}. All other paths are denied.`;
}

function createPromptGuidelines(
	toolName: GuardedToolName,
	rules: PermissionRules,
): string[] {
	const allowed = rules.domains.filter((d) => {
		const a = d.permissions.get(toolName);
		return a === "allow" || a === "ask";
	});
	const guidelines = [
		`Only use this tool on paths allowed by ${configLabel(rules)}.`,
		"If blocked by permissions, stop and explain the restriction.",
		"Never use bash or another tool as a workaround for a denied path.",
	];
	if (allowed.length > 0) {
		guidelines.push(
			`Allowed: ${allowed.map((d) => domainLabel(d)).join(", ")}`,
		);
	}
	return guidelines;
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

function registerScopedOverrides(
	pi: ExtensionAPI,
	cwd: string,
	rules: PermissionRules,
): void {
	const baseBashTool = createBashTool(cwd);
	const readTool = createReadTool(cwd);
	const writeTool = createWriteTool(cwd);
	const editTool = createEditTool(cwd);
	const findTool = createFindTool(cwd);
	const grepTool = createGrepTool(cwd);
	const lsTool = createLsTool(cwd);

	// Override bash to wrap every command in bwrap
	pi.registerTool({
		...baseBashTool,
		description:
			"Execute bash commands. Filesystem access is enforced by bubblewrap at the kernel level. " +
			"$HOME is an empty read-only sandbox — only ~/.pi and the project directory are accessible. " +
			"Do not invoke find, grep, rg, ls, tree, fd, ag, ack, or locate from bash — use the dedicated tools instead.",
		promptSnippet:
			"Run bash commands inside a bubblewrap sandbox with restricted home directory.",
		promptGuidelines: [
			"Do not call find, grep, rg, ls, tree, fd, ag, ack, or locate from bash — use the dedicated tools.",
			"Filesystem access outside permitted paths will fail at the kernel level.",
			"$HOME is empty and read-only inside the sandbox — do not attempt to read or write home directory files.",
		],
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const command = typeof params.command === "string" ? params.command : "";
			const bwrapCommand = buildBwrapCommand(command, ctx.cwd, rules);
			return baseBashTool.execute(
				toolCallId,
				{ ...params, command: bwrapCommand },
				signal,
				onUpdate,
				ctx,
			);
		},
	});

	pi.registerTool({
		...readTool,
		description: buildToolDescription("Read file contents.", "read", rules),
		promptSnippet: `Read file contents only on permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("read", rules),
	});

	pi.registerTool({
		...writeTool,
		description: buildToolDescription(
			"Create or overwrite files.",
			"write",
			rules,
		),
		promptSnippet: `Create or overwrite files only on permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("write", rules),
	});

	pi.registerTool({
		...editTool,
		description: buildToolDescription(
			"Edit a single file using exact text replacement.",
			"edit",
			rules,
		),
		promptSnippet: `Edit files only on permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("edit", rules),
	});

	pi.registerTool({
		...findTool,
		description: buildToolDescription(
			"Find files by glob pattern.",
			"find",
			rules,
		),
		promptSnippet: `Find filenames only inside permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("find", rules),
	});

	pi.registerTool({
		...grepTool,
		description: buildToolDescription(
			"Search file contents with ripgrep.",
			"grep",
			rules,
		),
		promptSnippet: `Search file contents only inside permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("grep", rules),
	});

	pi.registerTool({
		...lsTool,
		description: buildToolDescription("List directory contents.", "ls", rules),
		promptSnippet: `List directories only inside permitted paths from ${configLabel(rules)}.`,
		promptGuidelines: createPromptGuidelines("ls", rules),
	});

	const activeToolNames = new Set(pi.getActiveTools());
	for (const toolName of OVERRIDDEN_TOOL_NAMES) {
		activeToolNames.add(toolName);
	}
	pi.setActiveTools([...activeToolNames]);
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function scopedGuardedTools(pi: ExtensionAPI) {
	let lastFingerprint: string | null | undefined;
	let registeredForCwd: string | undefined;

	async function refreshOverrides(
		cwd: string,
	): Promise<PermissionRules | null> {
		const { rules, fingerprint } = await loadRules(cwd);
		if (!rules) {
			lastFingerprint = fingerprint;
			return null;
		}

		if (fingerprint !== lastFingerprint || registeredForCwd !== cwd) {
			registerScopedOverrides(pi, cwd, rules);
			lastFingerprint = fingerprint;
			registeredForCwd = cwd;
		}

		return rules;
	}

	pi.on("session_start", async (_event, ctx) => {
		// Check for bwrap dependency
		try {
			execSync("which bwrap", { stdio: "ignore" });
		} catch {
			console.log(
				`${chalk.red("[file-permissions]")} bubblewrap (bwrap) is not installed. Bash sandboxing is unavailable.`,
			);
			console.log(
				`${chalk.red("[file-permissions]")} Install with: sudo apt install bubblewrap`,
			);
			if (ctx.hasUI) {
				ctx.ui.notify(
					"bubblewrap (bwrap) not found. Install with: sudo apt install bubblewrap",
					"error",
				);
			}
			return;
		}

		try {
			const rules = await refreshOverrides(ctx.cwd);
			if (rules) {
				console.log(
					`${chalk.blue("[file-permissions]")} Loaded ${configLabel(rules)} (bash → bwrap)`,
				);
				for (const domain of rules.domains) {
					const perms = [...domain.permissions.entries()]
						.map(([t, a]) => `${t}:${a}`)
						.join(", ");
					console.log(`  ${domainLabel(domain)} → {${perms}}`);
				}
				console.log(
					"  Everything not listed is denied. $HOME is empty+read-only in sandbox.",
				);
				console.log(" ");
			}
		} catch (error) {
			console.log(
				`${chalk.red("[file-permissions]")} Failed to load config: ${(error as Error).message}\n`,
			);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`Failed to load permissions config: ${(error as Error).message}`,
					"error",
				);
			}
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		try {
			const rules = await refreshOverrides(ctx.cwd);
			if (!rules) return undefined;
			return {
				systemPrompt: `${event.systemPrompt}\n\n${buildSystemPromptNotice(rules)}`,
			};
		} catch {
			return undefined;
		}
	});

	pi.on("agent_start", async (_event, ctx) => {
		try {
			const rules = await refreshOverrides(ctx.cwd);
			if (rules) ctx.ui.notify(buildPermissionSummary(rules), "info");
		} catch (error) {
			ctx.ui.notify(
				`Failed to load permissions config: ${(error as Error).message}`,
				"error",
			);
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		let rules: PermissionRules | null;
		try {
			rules = await refreshOverrides(ctx.cwd);
		} catch (error) {
			const reason = `Failed to parse permissions config: ${(error as Error).message}`;
			if (ctx.hasUI) ctx.ui.notify(reason, "error");
			return { block: true, reason };
		}

		const protectedPaths = getProtectedPaths(ctx.cwd);

		// --- Protect config files from modification (belt-and-suspenders) ---
		if (["write", "edit"].includes(event.toolName)) {
			const rawPath = (event.input as Record<string, unknown>).path;
			if (typeof rawPath === "string") {
				const abs = await resolveRealPath(rawPath, ctx.cwd);
				if (protectedPaths.includes(abs)) {
					if (ctx.hasUI)
						ctx.ui.notify(
							`Blocked: cannot modify permission config file '${rawPath}'`,
							"warning",
						);
					return {
						block: true,
						reason:
							"Permission config files are read-only and cannot be modified by the agent.",
					};
				}
			}
		}

		// --- Bash: forbid config file references by name + forbidden subcommands ---
		// Path enforcement is handled by bwrap at the kernel level.
		if (event.toolName === "bash") {
			const command =
				typeof event.input.command === "string" ? event.input.command : "";

			if (CONFIG_FILE_NAMES.some((name) => command.includes(name))) {
				if (ctx.hasUI)
					ctx.ui.notify(
						"Blocked: bash command references a permission config file",
						"warning",
					);
				return {
					block: true,
					reason: "bash commands may not reference permission config files.",
				};
			}

			const bashCheck = validateBashCommand(command);
			if (!bashCheck.allowed) {
				if (ctx.hasUI)
					ctx.ui.notify(bashCheck.reason ?? "Blocked bash command", "warning");
				return { block: true, reason: bashCheck.reason };
			}

			return undefined;
		}

		if (!rules) return undefined;

		// --- Node.js file tools: application-level path enforcement ---
		if (!GUARDED_TOOLS.includes(event.toolName as GuardedToolName))
			return undefined;

		const toolName = event.toolName as GuardedToolName;
		const targetPath = await getTargetPath(
			toolName,
			event.input as Record<string, unknown>,
			ctx.cwd,
		);
		if (!targetPath)
			return { block: true, reason: `${toolName} requires a path` };

		const result = evaluateAccess(rules, toolName, targetPath, ctx.cwd);
		if (!result.allowed) {
			if (result.action === "ask" && ctx.hasUI) {
				const approved = await ctx.ui.confirm(
					"Permission Required",
					`Allow ${toolName} on '${targetPath}'?\n\n${result.reason}`,
				);
				if (approved) return undefined;
			} else if (ctx.hasUI) {
				ctx.ui.notify(result.reason, "warning");
			}
			return { block: true, reason: result.reason };
		}

		return undefined;
	});
}
