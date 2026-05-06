import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { access, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";

const FLAG = ".pi/plan-running";
const PLAN = "PLAN.md";

function resolvePath(cwd: string, relative: string) {
	return join(cwd, relative);
}

async function fileExists(cwd: string, relative: string) {
	try {
		await access(resolvePath(cwd, relative));
		return true;
	} catch {
		return false;
	}
}

async function readPlan(cwd: string): Promise<string> {
	return await readFile(resolvePath(cwd, PLAN), "utf8");
}

interface PlanTask {
	index: number;
	status: "todo" | "done" | "failed";
	text: string;
}

interface PlanSection {
	title: string;
	tasks: PlanTask[];
}

interface ParsedPlan {
	sections: PlanSection[];
	tasks: PlanTask[];
}

function parsePlan(raw: string): ParsedPlan {
	const lines = raw.split("\n");
	const sections: PlanSection[] = [];
	const tasks: PlanTask[] = [];
	let currentSection: PlanSection | null = null;
	let taskIndex = 0;

	for (const line of lines) {
		// Match headings (##, ###, etc.) — treat as section boundaries
		const headingMatch = line.match(/^(#{2,})\s+(.+)$/);
		if (headingMatch) {
			currentSection = { title: headingMatch[2].trim(), tasks: [] };
			sections.push(currentSection);
			continue;
		}

		// Match tasks
		const taskMatch = line.match(/^- \[([ x!])\]\s*(.+)$/);
		if (taskMatch) {
			const status = taskMatch[1] as " " | "x" | "!";
			const task: PlanTask = {
				index: taskIndex++,
				status: status === "x" ? "done" : status === "!" ? "failed" : "todo",
				text: taskMatch[2].trim(),
			};
			tasks.push(task);
			if (currentSection) {
				currentSection.tasks.push(task);
			}
		}
	}

	return { sections, tasks };
}

function idleStatusBarText(done: number, total: number) {
	return `PLAN: (${done}/${total})`;
}

function setStatusBarIdle(
	ctx: {
		ui: {
			setStatus: (key: string, value: string | undefined) => void;
			theme: { fg: (color: string, text: string) => string };
		};
	},
	done: number,
	total: number,
) {
	ctx.ui.setStatus(
		"plan",
		ctx.ui.theme.fg("accent", idleStatusBarText(done, total)),
	);
}

function continuation() {
	return "A plan is active — call tool /plan_next_section and continue from the first unchecked item. Do not ask for confirmation.";
}

export default function (pi: ExtensionAPI) {
	async function updateIdleStatus(ctx: ExtensionContext) {
		try {
			const cwd = ctx.cwd || process.cwd();
			if (!(await fileExists(cwd, PLAN))) return;
			if (await fileExists(cwd, FLAG)) return; // actively running
			const raw = await readPlan(cwd);
			const { tasks } = parsePlan(raw);
			if (tasks.length === 0) return;
			const done = tasks.filter((t) => t.status === "done").length;
			setStatusBarIdle(ctx, done, tasks.length);
		} catch {
			// ignore
		}
	}

	// Auto-detect PLAN.md on session start
	pi.on("session_start", async (_event, ctx) => {
		await updateIdleStatus(ctx);
	});

	// Also check on resources_discover (fires after session_start)
	pi.on("resources_discover", async (_event, ctx) => {
		await updateIdleStatus(ctx);
	});

	// And on first turn to ensure it shows up
	pi.on("turn_start", async (_event, ctx) => {
		await updateIdleStatus(ctx);
	});

	// Resume after compaction
	pi.on("session_compact", async (_event, ctx) => {
		const cwd = ctx.cwd;
		if (await fileExists(cwd, FLAG)) {
			pi.sendUserMessage(`Session was compacted. ${continuation()}`);
		}
	});

	pi.registerTool({
		name: "plan_start",
		description: "Call this when starting to execute a PLAN.md",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			await writeFile(resolvePath(ctx.cwd, FLAG), "");
			return {
				content: [{ type: "text", text: "Plan marked as running." }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_pause",
		description:
			"Pause the plan. Clears the running state and shows idle progress in the status bar (PLAN: done/total). Call when stepping away or when a session ends before the plan is complete.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (await fileExists(cwd, FLAG)) await unlink(resolvePath(cwd, FLAG));
			if (await fileExists(cwd, PLAN)) {
				const raw = await readPlan(cwd);
				const { tasks } = parsePlan(raw);
				const done = tasks.filter((t) => t.status === "done").length;
				setStatusBarIdle(ctx, done, tasks.length);
			} else {
				ctx.ui.setStatus("plan", undefined);
			}
			return {
				content: [{ type: "text", text: "Plan paused." }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_progress",
		description:
			"Update the status bar with the current plan step. Call at the start of each task.",
		parameters: Type.Object({
			taskName: Type.String({
				description: "Short description of the current task",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			let progressText = params.taskName;

			if (await fileExists(cwd, PLAN)) {
				const raw = await readPlan(cwd);
				const { tasks } = parsePlan(raw);
				const done = tasks.filter((t) => t.status === "done").length;
				const total = tasks.length;
				progressText = `(${done}/${total}) ${params.taskName}`;
			}

			ctx.ui.setStatus("plan", ctx.ui.theme.fg("accent", progressText));
			return {
				content: [
					{
						type: "text",
						text: `Progress updated: ${progressText}`,
					},
				],
				details: {},
			};
		},
	});

	// --- Plan inspection tools (keep context small) ---

	pi.registerTool({
		name: "plan_general",
		description:
			"Get a high-level summary of the plan: total tasks, done, remaining, and progress.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (!(await fileExists(cwd, PLAN))) {
				return {
					content: [{ type: "text", text: "No PLAN.md found." }],
					details: {},
				};
			}
			const raw = await readPlan(cwd);
			const { tasks } = parsePlan(raw);
			const done = tasks.filter((t) => t.status === "done").length;
			const failed = tasks.filter((t) => t.status === "failed").length;
			const todo = tasks.filter((t) => t.status === "todo").length;
			const total = tasks.length;
			const pct = total ? `${Math.round((done / total) * 100)}%` : "0%";

			// If plan is not actively running, show idle status bar
			if (!(await fileExists(cwd, FLAG))) {
				setStatusBarIdle(ctx, done, total);
			}
			return {
				content: [
					{
						type: "text",
						text: `Total: ${total} | Done: ${done} | Remaining: ${todo} | Failed: ${failed} | Progress: ${pct}`,
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_sections",
		description:
			"List section titles in the plan with done/total counts. Use plan_get_section to see tasks within a section.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (!(await fileExists(cwd, PLAN))) {
				return {
					content: [{ type: "text", text: "No PLAN.md found." }],
					details: {},
				};
			}
			const raw = await readPlan(cwd);
			const { sections, tasks } = parsePlan(raw);
			const done = tasks.filter((t) => t.status === "done").length;
			const lines: string[] = [];
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i];
				const sectionDone = section.tasks.filter(
					(t) => t.status === "done",
				).length;
				lines.push(
					`${i + 1}. ${section.title} (${sectionDone}/${section.tasks.length})`,
				);
			}
			// Top-level tasks (before any heading)
			const topLevel = tasks.filter(
				(t) => !sections.some((s) => s.tasks.includes(t)),
			);
			if (topLevel.length > 0) {
				const topDone = topLevel.filter((t) => t.status === "done").length;
				lines.push(
					`${sections.length + 1}. (top-level) (${topDone}/${topLevel.length})`,
				);
			}

			// If plan is not actively running, show idle status bar
			if (!(await fileExists(cwd, FLAG))) {
				setStatusBarIdle(ctx, done, tasks.length);
			}
			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_get_section",
		description:
			"Get the tasks of a specific section by its 1-indexed number. Use this to focus on one section without reading the whole plan.",
		parameters: Type.Object({
			number: Type.Number({
				description: "Section number (1-indexed) in the plan",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (!(await fileExists(cwd, PLAN))) {
				return {
					content: [{ type: "text", text: "No PLAN.md found." }],
					details: {},
				};
			}
			const raw = await readPlan(cwd);
			const { sections } = parsePlan(raw);
			const section = sections[params.number - 1];
			if (!section) {
				return {
					content: [
						{
							type: "text",
							text: `Section #${params.number} not found. Total sections: ${sections.length}`,
						},
					],
					details: {},
				};
			}
			const lines = [`## ${section.title}`];
			for (const t of section.tasks) {
				const icon =
					t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : "[ ]";
				lines.push(`  ${t.index + 1}. ${icon} ${t.text}`);
			}
			return {
				content: [
					{
						type: "text",
						text: lines.join("\n"),
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_next_section",
		description:
			"Find the next section that still has unchecked tasks. Returns the section title and its tasks. Use this as the primary entry point to find what to work on next.",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (!(await fileExists(cwd, PLAN))) {
				return {
					content: [{ type: "text", text: "No PLAN.md found." }],
					details: {},
				};
			}
			const raw = await readPlan(cwd);
			const { sections, tasks } = parsePlan(raw);

			// Check sections first for one with open tasks
			for (const section of sections) {
				const open = section.tasks.filter(
					(t) => t.status === "todo" || t.status === "failed",
				);
				if (open.length > 0) {
					const lines = [
						`${section.title} (${open.length}/${section.tasks.length} remaining)`,
					];
					for (const t of section.tasks) {
						const icon =
							t.status === "done"
								? "[x]"
								: t.status === "failed"
									? "[!]"
									: "[ ]";
						lines.push(`  ${t.index + 1}. ${icon} ${t.text}`);
					}
					return {
						content: [{ type: "text", text: lines.join("\n") }],
						details: {},
					};
				}
			}

			// Fall back to top-level tasks
			const topLevel = tasks.filter(
				(t) => !sections.some((s) => s.tasks.includes(t)),
			);
			const openTop = topLevel.filter(
				(t) => t.status === "todo" || t.status === "failed",
			);
			if (openTop.length > 0) {
				const lines = [
					`(top-level) (${openTop.length}/${topLevel.length} remaining)`,
				];
				for (const t of topLevel) {
					const icon =
						t.status === "done" ? "[x]" : t.status === "failed" ? "[!]" : "[ ]";
					lines.push(`${t.index + 1}. ${icon} ${t.text}`);
				}
				return {
					content: [{ type: "text", text: lines.join("\n") }],
					details: {},
				};
			}

			return {
				content: [{ type: "text", text: "All tasks are complete!" }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_mark_done",
		description:
			"Mark a specific task as done in the plan file by replacing its checkbox. Use section_title and task to identify the target task.",
		parameters: Type.Object({
			section_title: Type.String({
				description:
					"The section heading the task is under (e.g. 'Implementation'), or '' if top-level.",
			}),
			task: Type.String({
				description:
					"The task description text to mark as done (match first N characters).",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (!(await fileExists(cwd, PLAN))) {
				return {
					content: [{ type: "text", text: "No PLAN.md found." }],
					details: {},
				};
			}

			const raw = await readPlan(cwd);
			const { sections, tasks } = parsePlan(raw);

			// 1. Find the target section by title
			const targetSection = params.section_title
				? sections.find((s) => s.title === params.section_title)
				: null;

			if (params.section_title && !targetSection) {
				const available = sections.map((s) => `  - "${s.title}"`).join("\n");
				return {
					content: [
						{
							type: "text",
							text: `Section "${params.section_title}" not found.\nAvailable sections:\n${available}`,
						},
					],
					details: {},
				};
			}

			// 2. Get tasks to search within (section tasks or top-level tasks)
			const searchTasks = targetSection
				? targetSection.tasks
				: tasks.filter((t) => !sections.some((s) => s.tasks.includes(t)));

			if (searchTasks.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No tasks found in section "${params.section_title || "(top-level)"}".`,
						},
					],
					details: {},
				};
			}

			// 3. Find task by prefix match (case sensitive, no fallbacks)
			const target = searchTasks.find((t) => t.text.startsWith(params.task));
			if (!target) {
				const available = searchTasks.map((t) => `  - "${t.text}"`).join("\n");
				return {
					content: [
						{
							type: "text",
							text: `Task "${params.task}" not found in section "${params.section_title || "(top-level)"}".\nAvailable tasks:\n${available}`,
						},
					],
					details: {},
				};
			}

			// 4. Mark task as done in the raw file
			const taskLine = `- [ ] ${target.text}`;
			const doneLine = `- [x] ${target.text}`;
			const updated = raw.replace(taskLine, doneLine);

			if (updated === raw) {
				return {
					content: [
						{
							type: "text",
							text: `Task "${target.text}" is already marked as done.`,
						},
					],
					details: {},
				};
			}

			await writeFile(resolvePath(cwd, PLAN), updated);
			const { tasks: updatedTasks } = parsePlan(updated);
			const done = updatedTasks.filter((t) => t.status === "done").length;

			// Always update status bar with real progress after marking done
			const isRunning = await fileExists(cwd, FLAG);
			ctx.ui.setStatus(
				"plan",
				ctx.ui.theme.fg(
					"accent",
					isRunning
						? `PLAN: ${done}/${updatedTasks.length} ✓`
						: idleStatusBarText(done, updatedTasks.length),
				),
			);
			return {
				content: [
					{
						type: "text",
						text: `Marked task as done: "${target.text}" (${done}/${updatedTasks.length} complete).`,
					},
				],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "plan_done",
		description: "Call this when all tasks in the plan are complete",
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const cwd = ctx.cwd;
			if (await fileExists(cwd, FLAG)) await unlink(resolvePath(cwd, FLAG));
			ctx.ui.setStatus("plan", undefined);
			return {
				content: [{ type: "text", text: "Plan marked as done." }],
				details: {},
			};
		},
	});
}
