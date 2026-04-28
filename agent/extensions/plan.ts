import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, writeFile, unlink, readFile } from "fs/promises";

const FLAG = ".pi/plan-running";
const PLAN = "PLAN.md";

async function exists(path: string) {
  try { await access(path); return true; } catch { return false; }
}

async function planActive() {
  return (await exists(FLAG)) && (await exists(PLAN));
}

async function hasUncheckedTasks() {
  try {
    const plan = await readFile(PLAN, "utf8");
    return plan.includes("- [ ]");
  } catch {
    return false;
  }
}

function continuation() {
  return "A plan is active — read PLAN.md and continue from the first unchecked item. Do not ask for confirmation.";
}

export default function (pi: ExtensionAPI) {
  // Resume after compaction
  pi.on("session_compact", async (_event, _ctx) => {
    if (!await planActive()) return;
    pi.sendUserMessage(`Session was compacted. ${continuation()}`);
  });

  // Auto-start or resume on session start
  pi.on("session_start", async (_event, _ctx) => {
    if (!await exists(PLAN)) return;
    if (!await hasUncheckedTasks()) return;
    if (!await exists(FLAG)) await writeFile(FLAG, "");
    pi.sendUserMessage(`Session started with an active plan. ${continuation()}`);
  });

  // Remind the agent on every turn while plan is running
  pi.on("before_agent_start", async (event, _ctx) => {
    if (!await planActive()) return;
    return {
      systemPrompt: event.systemPrompt + "\n\n[Plan Runner] A PLAN.md is currently active. After completing each task mark it done immediately and call plan_done when all tasks are complete.",
    };
  });

  pi.registerTool({
    name: "plan_start",
    description: "Call this when starting to execute a PLAN.md",
    parameters: Type.Object({}),
    async execute() {
      await writeFile(FLAG, "");
      return { content: [{ type: "text", text: "Plan marked as running." }], details: {} };
    },
  });

  pi.registerTool({
    name: "plan_done",
    description: "Call this when all tasks in PLAN.md are complete",
    parameters: Type.Object({}),
    async execute() {
      if (await exists(FLAG)) await unlink(FLAG);
      return { content: [{ type: "text", text: "Plan marked as done." }], details: {} };
    },
  });
}
