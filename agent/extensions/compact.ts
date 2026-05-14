/**
 * VCC - View-oriented Conversation Compiler for pi
 *
 * Inspired by https://github.com/lllyasviel/VCC
 *
 * Fixes two pi-vcc bugs:
 *   1. "AI stops after compaction" - we auto-send a continue message
 *   2. "Compacted from 0 tokens" loop - we cancel compaction on tiny sessions
 *
 * Install: copy this file to ~/.pi/agent/extensions/vcc/index.ts
 *
 * Config: ~/.pi/agent/vcc-config.json  (created with defaults on first run)
 * Reload config: /reload in pi
 *
 * Provides:
 *   - Automatic VCC compaction (replaces pi-vcc)
 *   - recall tool: search session history after compaction
 *   - /vcc command: trigger compaction manually
 *   - /vcc-full command: dump full view to /tmp/vcc-full.txt (debug)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Config ───────────────────────────────────────────────────────────────────

interface VccConfig {
  /**
   * Minimum token count before compaction is allowed.
   * Prevents the "compacted from 0 tokens" infinite loop caused by a broken
   * token counter in some llama-server builds.
   * Default: 3000
   */
  minTokensToCompact: number;

  /**
   * Maximum characters for the UI view summary injected as the compaction message.
   * Higher = more context preserved, more tokens consumed.
   * Default: 10000
   */
  maxSummaryChars: number;

  /**
   * Maximum characters shown per user message in the UI view.
   * Default: 600
   */
  maxUserMessageChars: number;

  /**
   * Maximum characters shown per assistant message in the UI view.
   * Default: 800
   */
  maxAssistantMessageChars: number;

  /**
   * Maximum characters shown for the session goal (first user message header).
   * Default: 400
   */
  maxGoalChars: number;

  /**
   * Whether to automatically send a follow-up message after compaction to
   * resume the agent. Fixes pi-vcc issue #3 ("AI stops after auto compaction").
   * Default: true
   */
  autoResume: boolean;

  /**
   * The message sent to the agent after compaction when autoResume is true.
   * Default: see below
   */
  autoResumeMessage: string;

  /**
   * Number of turns to skip compaction checks after a compaction completes.
   * Prevents the auto-resume message from immediately re-triggering compaction.
   * Default: 3
   */
  compactionCooldownTurns: number;

  /**
   * VCC proactively triggers compaction from turn_end when estimated context
   * exceeds this token count. This bypasses pi's built-in threshold check,
   * which never fires when the token counter is broken (shows 0).
   *
   * When ctx.getContextUsage() returns a non-zero value it is used directly
   * (includes system prompt). When it returns 0 (broken counter), the estimate
   * is: session content chars / 4 + systemPromptOverheadTokens.
   *
   * Set to 0 to disable proactive compaction (rely on pi's built-in threshold only).
   * Default: 45000  (leaves ~20k headroom on a 65536 context)
   */
  compactionThresholdTokens: number;

  /**
   * Added to the char-based token estimate to account for system prompt, skills,
   * AGENTS.md, and other context that isn't in the session entries.
   * Only used when ctx.getContextUsage() returns 0 (broken token counter).
   * Default: 20000  (conservative for a pi session with several skills loaded)
   */
  systemPromptOverheadTokens: number;
}

const CONFIG_PATH = join(homedir(), ".pi", "agent", "vcc-config.json");

const DEFAULTS: VccConfig = {
  minTokensToCompact: 3000,
  maxSummaryChars: 3000,
  maxUserMessageChars: 600,
  maxAssistantMessageChars: 800,
  maxGoalChars: 400,
  autoResume: true,
  autoResumeMessage:
    "Session compacted. Continue with the current task from where you left off — do not acknowledge this message, just keep going.",
  compactionThresholdTokens: 45000,
  systemPromptOverheadTokens: 20000,
  compactionCooldownTurns: 3,
};

function loadConfig(): VccConfig {
  if (!existsSync(CONFIG_PATH)) {
    // Write defaults on first run so the user has a template to edit
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + "\n", "utf8");
    } catch {
      // Non-fatal — just use defaults
    }
    return { ...DEFAULTS };
  }

  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<VccConfig>;
    // Merge with defaults so new fields added in future versions work immediately
    return { ...DEFAULTS, ...parsed };
  } catch (e) {
    // Malformed JSON — fall back to defaults and warn at startup
    console.error(`[vcc] failed to parse ${CONFIG_PATH}: ${e}. Using defaults.`);
    return { ...DEFAULTS };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BlockRole =
  | "user"
  | "assistant"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "bash"
  | "compaction"
  | "custom";

interface Block {
  role: BlockRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  isError?: boolean;
  noise?: boolean;       // true = skip in UI view (noise-only user turns, etc.)
  startLine: number;     // stable, assigned after parsing
  endLine: number;
}

interface CompiledSession {
  blocks: Block[];
  /** tool_result blocks indexed by toolCallId for fast lookup */
  resultByCallId: Map<string, Block>;
}

// ─── Lexer helpers ────────────────────────────────────────────────────────────

/** Entry types that carry no useful content and should be skipped entirely. */
const NOISE_ENTRY_TYPES = new Set(["bashExecution"]);

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return (content as Array<{ type: string; text?: string }>)
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join("\n");
  }
  return "";
}

/**
 * Strip XML injected by pi's skill / system infrastructure from user text.
 * These tags are large and add no information the model doesn't already have
 * from the system prompt.
 *
 * Stripped:
 *   <skill name="...">…</skill>       pi skill content injected into user turns
 *   <system-reminder>…</system-reminder>
 *   <ide_opened_file>…</ide_opened_file>
 *   <command-message>…</command-message>
 */
const NOISE_XML_RE =
  /<(skill|system-reminder|ide_opened_file|command-message|local-command-stdout|local-command-stderr|task-notification)[^>]*>[\s\S]*?<\/\1>\s*/g;

/**
 * Exact-match strings that represent empty/noise user turns.
 * If a user message reduces to one of these after XML stripping, hide it entirely.
 */
const NOISE_EXACT = new Set([
  "Continue from where you left off.",
  "No response requested.",
  "Session compacted. Continue with the current task from where you left off — do not acknowledge this message, just keep going.",
]);

function stripNoiseXml(text: string): string {
  return text.replace(NOISE_XML_RE, "").trim();
}

function isNoiseTurn(text: string): boolean {
  const stripped = stripNoiseXml(text);
  return !stripped || NOISE_EXACT.has(stripped);
}

// ─── Tool arg summary ─────────────────────────────────────────────────────────

/**
 * Per-tool primary argument key — the one that best identifies what the tool
 * is operating on.  Mirrors VCC's _TOOL_SUMMARY_FIELDS.
 */
const TOOL_PRIMARY_ARG: Record<string, string> = {
  read:  "path",
  write: "path",
  edit:  "path",
  grep:  "pattern",
  find:  "pattern",
  ls:    "path",
  bash:  "command",
};

/** Tools whose output is internal bookkeeping — hide entirely in UI view. */
const HIDE_TOOLS = new Set(["plan_start", "plan_pause", "plan_done", "plan_progress"]);

/**
 * Build a human-readable one-liner summary of a tool call's arguments.
 * Returns: `"path/to/file"` or `pattern: foo` etc.
 */
function toolArgSummary(toolName: string, argsJson: string): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    const primaryKey = TOOL_PRIMARY_ARG[toolName.toLowerCase()];

    if (primaryKey && args[primaryKey] !== undefined) {
      const val = String(args[primaryKey]).split("\n")[0]!.slice(0, 80);
      return `"${val}"`;
    }

    // Fall back to first key
    const keys = Object.keys(args);
    if (keys.length > 0) {
      const k = keys[0]!;
      const v = String(args[k]).split("\n")[0]!.slice(0, 60);
      return `${k}: ${v}`;
    }
  } catch { /* malformed JSON */ }
  return "";
}

// ─── Compiler: Parse → IR ─────────────────────────────────────────────────────

/**
 * Parse pi session entries into raw blocks (no line numbers yet).
 * Line numbers are assigned in a separate pass so they are stable and
 * consistent across all views.
 */
function parse(entries: unknown[]): Omit<Block, "startLine" | "endLine">[] {
  const raw: Omit<Block, "startLine" | "endLine">[] = [];

  const add = (
    role: BlockRole,
    content: string,
    extra?: { toolName?: string; toolCallId?: string; isError?: boolean; noise?: boolean }
  ) => raw.push({ role, content, ...extra });

  for (const entry of entries as Array<{ type: string; message?: unknown }>) {
    if (!entry.message) continue;
    if (NOISE_ENTRY_TYPES.has(entry.type)) continue;
    if (entry.type !== "message") continue;

    const msg = entry.message as {
      role: string;
      content?: unknown;
      toolName?: string;
      toolCallId?: string;
      isError?: boolean;
      summary?: string;
      display?: boolean;
    };

    switch (msg.role) {
      case "user": {
        const raw_text = extractText(msg.content).trim();
        if (!raw_text) break;
        const clean = stripNoiseXml(raw_text);
        // Always emit the block, but flag it as noise so the UI view can skip it
        add("user", clean || raw_text, { noise: isNoiseTurn(raw_text) });
        break;
      }

      case "assistant": {
        for (const part of (msg.content as Array<{
          type: string; text?: string; thinking?: string;
          id?: string; name?: string; arguments?: unknown;
        }> ?? [])) {
          if (part.type === "thinking" && part.thinking?.trim()) {
            add("thinking", part.thinking);
          } else if (part.type === "text" && part.text?.trim()) {
            add("assistant", part.text);
          } else if (part.type === "toolCall") {
            const argsJson =
              typeof part.arguments === "object"
                ? JSON.stringify(part.arguments, null, 2)
                : String(part.arguments ?? "");
            const toolName = part.name ?? "unknown";
            add("tool_call", argsJson, {
              toolName,
              toolCallId: part.id,
              noise: HIDE_TOOLS.has(toolName),
            });
          }
        }
        break;
      }

      case "toolResult": {
        const text = extractText(msg.content);
        add("tool_result", text, {
          toolName: msg.toolName,
          toolCallId: msg.toolCallId,
          isError: msg.isError,
        });
        break;
      }

      case "compactionSummary": {
        const text = typeof msg.summary === "string" ? msg.summary : "";
        if (text.trim()) add("compaction", text);
        break;
      }

      case "custom": {
        if (msg.display === false) break;
        const text = extractText(msg.content).trim();
        if (text) add("custom", text, { noise: NOISE_EXACT.has(text) });
        break;
      }
    }
  }

  return raw;
}

// ─── Line assignment ──────────────────────────────────────────────────────────

/**
 * Assign stable line numbers to every block.
 * Each block in the full view occupies:
 *   1 separator line + 1 header line + 1 blank + N content lines + 1 trailing blank
 * = N + 4 lines total.
 *
 * Line numbers are 1-based and never change after this pass.
 */
function assignLines(
  raw: Omit<Block, "startLine" | "endLine">[]
): Block[] {
  let lineNo = 1;
  return raw.map((b) => {
    const contentLines = b.content.split("\n").length;
    const startLine = lineNo;
    const endLine = startLine + 2 + contentLines - 1; // header + blank + content
    lineNo += 4 + contentLines; // sep + header + blank + content + trailing blank
    return { ...b, startLine, endLine } as Block;
  });
}

// ─── Compile (entry point) ────────────────────────────────────────────────────

function compile(entries: unknown[]): CompiledSession {
  const blocks = assignLines(parse(entries));

  // Build reverse index: toolCallId → tool_result block
  const resultByCallId = new Map<string, Block>();
  for (const b of blocks) {
    if (b.role === "tool_result" && b.toolCallId) {
      resultByCallId.set(b.toolCallId, b);
    }
  }

  return { blocks, resultByCallId };
}

// ─── Token estimation ─────────────────────────────────────────────────────────

/**
 * Rough token count from session entries.
 * Uses ~4 chars per token — good enough for a compaction threshold check.
 * Does NOT include the system prompt; add ~10-20k overhead in your threshold.
 */
function estimateTokens(entries: unknown[]): number {
  let chars = 0;
  for (const entry of entries as Array<{ type: string; message?: unknown }>) {
    if (entry.type !== "message" || !entry.message) continue;
    const msg = entry.message as { content?: unknown };
    chars += extractText(msg.content).length;
  }
  return Math.floor(chars / 4);
}

// ─── Views ────────────────────────────────────────────────────────────────────

const SEP = "══════════════════════════════";

/** Full view: every block with stable line numbers. Used as the recall source. */
function fullView(session: CompiledSession): string {
  const lines: string[] = [];
  let n = 1;

  const push = (line: string) => {
    lines.push(`${String(n).padStart(4)}  ${line}`);
    n++;
  };

  for (const block of session.blocks) {
    push(SEP);
    const role = block.toolName
      ? `[${block.role}] ${block.toolName}${block.toolCallId ? `:${block.toolCallId.slice(0, 6)}` : ""}${block.isError ? " ERROR" : ""}`
      : `[${block.role}]`;
    push(role);
    push("");
    for (const line of block.content.split("\n")) push(line);
    push("");
  }

  return lines.join("\n");
}

/**
 * UI view: compact summary injected as the compaction message.
 *
 * Structure:
 *   [Session Goal]    — first non-noise user message
 *   [Files Changed]   — unique paths touched by write/edit tool calls
 *   [Recent Session]  — rolling tail: user/assistant in full, tools as one-liners
 *
 * Tool call one-liners include both the call range AND the result range:
 *   * read "src/main.rs" (session.txt:42-55,88-102)
 * This lets the model jump directly to the result if needed.
 */
function uiView(session: CompiledSession, cfg: VccConfig): string {
  const { blocks, resultByCallId } = session;
  const parts: string[] = [];

  // ── Section 1: session goal ──────────────────────────────────────────────────
  const firstUser = blocks.find((b) => b.role === "user" && !b.noise);
  if (firstUser) {
    const goal = firstUser.content.slice(0, cfg.maxGoalChars);
    const ellipsis =
      firstUser.content.length > cfg.maxGoalChars
        ? `\n...(session.txt:${firstUser.startLine}-${firstUser.endLine})`
        : "";
    parts.push(`[Session Goal]\n${goal}${ellipsis}\n`);
  }

  // ── Section 2: files changed ─────────────────────────────────────────────────
  const changedFiles = new Set<string>();
  for (const b of blocks) {
    if (b.role !== "tool_call") continue;
    const name = (b.toolName ?? "").toLowerCase();
    if (name !== "write" && name !== "edit") continue;
    try {
      const args = JSON.parse(b.content) as Record<string, unknown>;
      const path = String(args["path"] ?? args["file_path"] ?? "").trim();
      if (path) changedFiles.add(path);
    } catch { /* */ }
  }
  if (changedFiles.size > 0) {
    parts.push(`[Files Changed]\n${[...changedFiles].map((f) => `  ${f}`).join("\n")}\n`);
  }

  // ── Section 3: recent conversation ──────────────────────────────────────────
  const recentParts: string[] = [];

  for (const block of blocks) {
    if (block.noise) continue;

    switch (block.role) {
      case "user": {
        const text = block.content.slice(0, cfg.maxUserMessageChars);
        const ellipsis =
          block.content.length > cfg.maxUserMessageChars
            ? `\n...(session.txt:${block.startLine}-${block.endLine})`
            : "";
        recentParts.push(`[user]\n\n${text}${ellipsis}\n`);
        break;
      }

      case "thinking": {
        // Collapse to first line only — thinking is implementation detail
        const firstLine = block.content.split("\n")[0] ?? "";
        recentParts.push(`>>>thinking\n${firstLine.slice(0, 120)}...\n<<<thinking\n`);
        break;
      }

      case "assistant": {
        const text = block.content.slice(0, cfg.maxAssistantMessageChars);
        const ellipsis =
          block.content.length > cfg.maxAssistantMessageChars
            ? `\n...(session.txt:${block.startLine}-${block.endLine})`
            : "";
        recentParts.push(`[assistant]\n\n${text}${ellipsis}\n`);
        break;
      }

      case "tool_call": {
        // One-liner: * toolName "arg" (session.txt:callStart-callEnd,resultStart-resultEnd)
        const argStr = toolArgSummary(block.toolName ?? "", block.content);
        const callRef = `${block.startLine}-${block.endLine}`;
        const result = block.toolCallId ? resultByCallId.get(block.toolCallId) : undefined;
        const resultRef = result ? `,${result.startLine}-${result.endLine}` : "";
        recentParts.push(
          `* ${block.toolName ?? "tool"}${argStr ? ` ${argStr}` : ""} (session.txt:${callRef}${resultRef})\n`
        );
        break;
      }

      case "tool_result": {
        // Error results get a brief inline note; successes are silent (use recall)
        if (block.isError) {
          const firstLine = block.content.split("\n")[0] ?? "";
          recentParts.push(
            `  ✗ ${block.toolName}: ${firstLine.slice(0, 120)} (session.txt:${block.startLine})\n`
          );
        }
        break;
      }

      case "compaction": {
        recentParts.push(`[previous compaction omitted]\n`);
        break;
      }
    }
  }

  // Keep the rolling tail within maxSummaryChars
  let recent = recentParts.join("\n");
  if (recent.length > cfg.maxSummaryChars) {
    recent =
      "...(earlier turns omitted — use recall to search)\n\n" +
      recent.slice(recent.length - cfg.maxSummaryChars);
  }

  parts.push(`[Recent Session]\n\n${recent}`);

  return parts.join("\n");
}

/**
 * Adaptive view: grep-filtered blocks with context and line pointers.
 *
 * Improvements over v1:
 * - When a tool_call matches, its paired tool_result is also shown (and vice versa)
 * - Thinking blocks are excluded from search (too noisy)
 * - Noise blocks are skipped
 * - Block headers only shown for matched sections
 */
function adaptiveView(session: CompiledSession, query: string): string {
  const { blocks, resultByCallId } = session;

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (terms.length === 0) return "No search terms provided.";

  const matches = (text: string) =>
    terms.some((t) => text.toLowerCase().includes(t));

  // Build a reverse map: toolCallId → tool_call block (for result→call linking)
  const callByCallId = new Map<string, Block>();
  for (const b of blocks) {
    if (b.role === "tool_call" && b.toolCallId) callByCallId.set(b.toolCallId, b);
  }

  // Determine which blocks to show
  const toShow = new Set<Block>();
  for (const block of blocks) {
    if (block.noise) continue;
    if (block.role === "thinking") continue; // thinking is internal, skip in search

    if (matches(block.content)) {
      toShow.add(block);
      // If a tool_call matches, also pull in its result
      if (block.role === "tool_call" && block.toolCallId) {
        const result = resultByCallId.get(block.toolCallId);
        if (result) toShow.add(result);
      }
      // If a tool_result matches, also pull in its call
      if (block.role === "tool_result" && block.toolCallId) {
        const call = callByCallId.get(block.toolCallId);
        if (call) toShow.add(call);
      }
    }
  }

  if (toShow.size === 0) {
    return `No matches found for: "${query}"\n\nTry broader terms or use /vcc-full to dump the full view.`;
  }

  const results: string[] = [];

  for (const block of blocks) {
    if (!toShow.has(block)) continue;

    const label = block.toolName
      ? `[${block.role}] ${block.toolName}${block.isError ? " ERROR" : ""}`
      : `[${block.role}]`;
    results.push(`(session.txt:${block.startLine}-${block.endLine}) ${label}`);

    const lines = block.content.split("\n");
    const shown = new Set<number>();

    for (let idx = 0; idx < lines.length; idx++) {
      if (matches(lines[idx]!)) {
        for (
          let j = Math.max(0, idx - 1);
          j <= Math.min(lines.length - 1, idx + 1);
          j++
        ) {
          if (!shown.has(j)) {
            const marker = j === idx ? ">" : " ";
            const approxLine = block.startLine + 3 + j;
            results.push(`  ${marker}${approxLine}: ${lines[j]}`);
            shown.add(j);
          }
        }
      }
    }

    // If this block was pulled in as a paired counterpart (not a direct match),
    // show just the first line as context
    if (!matches(block.content) && lines.length > 0) {
      results.push(`   (pulled in as paired ${block.role})`);
      results.push(`   ${block.startLine + 3}: ${lines[0]!.slice(0, 100)}`);
    }

    results.push("");
  }

  return results.join("\n");
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Config is loaded once at startup (or on /reload).
  // Edit ~/.pi/agent/vcc-config.json then /reload to apply changes.
  let cfg = loadConfig();

  pi.on("session_start", async (_event, ctx) => {
    cfg = loadConfig();
    ctx.ui.notify(
      `[vcc] loaded (threshold=${cfg.compactionThresholdTokens}, overhead=${cfg.systemPromptOverheadTokens}, autoResume=${cfg.autoResume})`,
      "info"
    );
  });

  // ── Proactive compaction ─────────────────────────────────────────────────────
  // Pi's built-in threshold never fires when its token counter is broken (shows 0).
  // We check at turn_start AND turn_end:
  //   turn_start — catches accumulated context before the next LLM call
  //   turn_end   — catches a single turn that blew up context (e.g. 4 large reads)

  let compactionPending = false;
  // Cooldown: after compaction completes, skip threshold checks for N turns
  // to prevent the auto-resume message from immediately re-triggering compaction.
  let compactionCooldownTurns = 0;

  function contextTokens(ctx: any): number {
    const usage = ctx.getContextUsage();
    const reported = usage?.tokens ?? 0;
    if (reported > 0) return reported;
    // Broken counter fallback: session chars / 4 + system prompt overhead
    const entries = ctx.sessionManager.getBranch();
    return estimateTokens(entries) + cfg.systemPromptOverheadTokens;
  }

  function maybeCompact(ctx: any, when: string) {
    if (cfg.compactionThresholdTokens <= 0 || compactionPending) return;
    if (compactionCooldownTurns > 0) {
      compactionCooldownTurns--;
      return;
    }
    const tokens = contextTokens(ctx);
    if (tokens < cfg.compactionThresholdTokens) return;
    ctx.ui.notify(`[vcc] ~${tokens} tokens >= ${cfg.compactionThresholdTokens} at ${when} — compacting`, "info");
    compactionPending = true;
    ctx.compact({
      onComplete: () => {
        compactionPending = false;
        compactionCooldownTurns = cfg.compactionCooldownTurns;
        ctx.ui.notify("[vcc] compaction complete", "success");
      },
      onError: (e: Error) => { compactionPending = false; ctx.ui.notify(`[vcc] compaction failed: ${e.message}`, "error"); },
    });
  }

  pi.on("turn_start", async (_event, ctx) => maybeCompact(ctx, "turn_start"));
  pi.on("turn_end",   async (_event, ctx) => maybeCompact(ctx, "turn_end"));

  // ── Compaction hook ──────────────────────────────────────────────────────────

  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation } = event;
    const tokensBefore = preparation.tokensBefore ?? 0;

    // Cancel spurious compactions triggered by pi's broken 0-token counter.
    // A compaction is meaningful if reported tokens are reasonable OR our own
    // estimate (session chars / 4 + overhead) exceeds the threshold.
    const entries = ctx.sessionManager.getBranch();
    const estimated = estimateTokens(entries) + cfg.systemPromptOverheadTokens;
    const meaningful =
      tokensBefore >= cfg.minTokensToCompact ||
      estimated >= cfg.compactionThresholdTokens;

    if (!meaningful) {
      ctx.ui.notify(
        `[vcc] cancelling spurious compaction (reported ${tokensBefore}, estimated ${estimated} tokens)`,
        "info"
      );
      return { cancel: true };
    }

    ctx.ui.notify(`[vcc] compacting (reported ${tokensBefore}, estimated ${estimated} tokens)...`, "info");

    // Compile ONLY the messages being discarded (messagesToSummarize), not the
    // full branch. The kept tail (from firstKeptEntryId) is sent to the LLM
    // verbatim — summarising it too would double its context cost.
    const toSummarize = preparation.messagesToSummarize ?? [];
    const syntheticEntries = toSummarize.map((msg: unknown) => ({ type: "message", message: msg }));
    const session = compile(syntheticEntries);
    const summary = uiView(session, cfg);

    return {
      compaction: {
        summary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        tokensBefore,
      },
    };
  });

  // ── Auto-continue after compaction ───────────────────────────────────────────
  // Fix: pi-vcc issue #3 — "AI stops after auto compaction"
  // After compaction fires, pi leaves the agent idle waiting for user input.
  // We send a follow-up user message to resume automatically.

  pi.on("session_compact", async (_event, _ctx) => {
    if (!cfg.autoResume) return;
    // Use followUp so the message queues until the agent finishes its current
    // turn — avoids "Agent is already processing" error when compaction fires
    // mid-stream. Falls back to immediate send when agent is idle.
    pi.sendUserMessage(cfg.autoResumeMessage, { deliverAs: "followUp" });
  });

  // ── Recall tool ──────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "recall",
    label: "Recall",
    description:
      "Search session history for prior decisions, code, or context. " +
      "Returns matching blocks with (session.txt:N-M) pointers for exact location.",
    promptSnippet: "Search past session history for context compacted away",
    promptGuidelines: [
      "Use recall when you need to find specific prior decisions, code changes, " +
        "or context that may have been compacted. Pass specific keywords, not vague phrases.",
    ],
    parameters: Type.Object({
      query: Type.String({
        description:
          "Search terms (space-separated). Matches any term. Use specific words from the original context.",
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const entries = ctx.sessionManager.getBranch();
      const session = compile(entries as unknown[]);
      const result = adaptiveView(session, params.query);

      return {
        content: [{ type: "text", text: result }],
        details: {},
      };
    },
  });

  // ── Manual compaction command ─────────────────────────────────────────────────

  pi.registerCommand("vcc", {
    description: "Compact session now using VCC algorithm",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getBranch();
      const estimated = estimateTokens(entries);
      ctx.ui.notify(`[vcc] triggering manual compaction (~${estimated} estimated tokens)`, "info");
      compactionPending = true;
      ctx.compact({
        onComplete: () => {
          compactionPending = false;
          ctx.ui.notify("[vcc] compaction complete", "success");
        },
        onError: (e) => {
          compactionPending = false;
          ctx.ui.notify(`[vcc] compaction failed: ${e.message}`, "error");
        },
      });
    },
  });

  // ── Config command ────────────────────────────────────────────────────────────

  pi.registerCommand("vcc-config", {
    description: "Show current VCC config and path",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        `[vcc] config at ${CONFIG_PATH}:\n${JSON.stringify(cfg, null, 2)}`,
        "info"
      );
    },
  });

  // ── Full view command (debug) ──────────────────────────────────────────────────

  pi.registerCommand("vcc-full", {
    description: "Dump full VCC view of current session to /tmp/vcc-full.txt",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getBranch();
      const session = compile(entries as unknown[]);
      const full = fullView(session);
      writeFileSync("/tmp/vcc-full.txt", full, "utf8");
      ctx.ui.notify(
        `[vcc] full view written to /tmp/vcc-full.txt (${full.split("\n").length} lines)`,
        "success"
      );
    },
  });
}
