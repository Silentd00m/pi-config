import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// Default configuration fallbacks
const DEFAULT_CONFIG = {
	remote: "http://192.168.178.177/mcpo",
	local: "http://localhost:8000",
	servers: [],
};

async function resolveBase(
	server: string,
	remote: string,
	local: string,
): Promise<string | null> {
	for (const base of [remote, local]) {
		try {
			const res = await fetch(`${base}/${server}/openapi.json`);
			if (res.ok) return base;
		} catch {
			// Continue to next base if fetch fails
		}
	}
	return null;
}

export default async function (pi: ExtensionAPI) {
	const configPath = join(homedir(), ".pi/agent/mcpo.json");
	let config = DEFAULT_CONFIG;

	// Load configuration from ~/.pi/agent/mcp.json
	try {
		const fileContent = await readFile(configPath, "utf-8");
		const userConfig = JSON.parse(fileContent);
		config = { ...DEFAULT_CONFIG, ...userConfig };
		console.log(`mcpo: loaded configuration from ${configPath}`);
	} catch (err) {
		console.warn(
			`mcpo: could not load config from ${configPath}, using defaults.`,
		);
	}

	const unavailable: string[] = [];

	for (const server of config.servers) {
		const base = await resolveBase(server, config.remote, config.local);
		if (!base) {
			unavailable.push(server);
			continue;
		}

		console.log(`mcpo: ${server} -> ${base}`);

		let spec: any;
		try {
			spec = await fetch(`${base}/${server}/openapi.json`).then((r) =>
				r.json(),
			);
		} catch {
			unavailable.push(server);
			continue;
		}

		for (const [path, pathItem] of Object.entries(spec.paths ?? {}) as any) {
			const op = pathItem.post ?? pathItem.get;
			if (!op) continue;

			const toolName = `${server}${path.replace(/\//g, "_")}`;
			const rawSchema = op.requestBody?.content?.["application/json"]?.schema;
			const parameters = buildTypeboxSchema(rawSchema, spec);

			const capturedBase = base;
			const capturedServer = server;
			const capturedPath = path;

			pi.registerTool({
				name: toolName,
				description: op.description ?? op.summary ?? `${server} ${path}`,
				parameters,
				async execute(_toolCallId, params) {
					const response = await fetch(
						`${capturedBase}/${capturedServer}${capturedPath}`,
						{
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify(params),
						},
					);
					const text = await response.text();
					return {
						content: [{ type: "text", text }],
						details: {},
					};
				},
			});
		}
	}

	if (unavailable.length > 0) {
		console.warn(
			`mcpo: these servers were unreachable: [${unavailable.join(", ")}]. Their tools are not available.`,
		);
	}
}

// Schema builder helpers
function resolveRef(ref: string, spec: any): any {
	const name = ref.replace("#/components/schemas/", "");
	return spec.components?.schemas?.[name];
}

function buildTypeboxSchema(schema: any, spec: any): any {
	if (!schema) return Type.Object({});
	if (schema.$ref)
		return buildTypeboxSchema(resolveRef(schema.$ref, spec), spec);

	const props: Record<string, any> = {};
	for (const [key, val] of Object.entries(schema.properties ?? {}) as any) {
		props[key] = toTypeboxProperty(val, spec);
	}

	const required: string[] = schema.required ?? [];
	const result: Record<string, any> = {};
	for (const [key, tbProp] of Object.entries(props)) {
		result[key] = required.includes(key) ? tbProp : Type.Optional(tbProp);
	}
	return Type.Object(result);
}

function toTypeboxProperty(prop: any, spec: any): any {
	if (!prop) return Type.String();
	if (prop.$ref) return toTypeboxProperty(resolveRef(prop.$ref, spec), spec);
	if (prop.anyOf) {
		const nonNull = prop.anyOf.find((s: any) => s.type !== "null");
		return toTypeboxProperty(nonNull ?? { type: "string" }, spec);
	}

	const desc = prop.description ? { description: prop.description } : {};
	if (prop.type === "array")
		return Type.Array(toTypeboxProperty(prop.items ?? {}, spec), desc);
	if (prop.type === "number") return Type.Number(desc);
	if (prop.type === "boolean") return Type.Boolean(desc);
	if (prop.type === "object")
		return Type.Record(Type.String(), Type.Unknown(), desc);

	return Type.String(desc);
}
