import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const MCPO_BASE = "http://localhost:8000";
const SERVERS = ["searxng", "crawl4ai", "memory", "sequential-thinking", "time"];

export default async function (pi: ExtensionAPI) {
  for (const server of SERVERS) {
    let spec: any;
    try {
      spec = await fetch(`${MCPO_BASE}/${server}/openapi.json`).then(r => r.json());
    } catch {
      console.error(`mcpo: failed to load spec for ${server}`);
      continue;
    }

    for (const [path, pathItem] of Object.entries(spec.paths ?? {}) as any) {
      const op = pathItem.post ?? pathItem.get;
      if (!op) continue;

      const toolName = `${server}${path.replace(/\//g, "_")}`;
      const rawSchema = op.requestBody?.content?.["application/json"]?.schema;
      const parameters = buildTypeboxSchema(rawSchema, spec);

      const capturedServer = server;
      const capturedPath = path;

      pi.registerTool({
        name: toolName,
        description: op.description ?? op.summary ?? `${server} ${path}`,
        parameters,
        async execute(_toolCallId, params) {
          const response = await fetch(`${MCPO_BASE}/${capturedServer}${capturedPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          });
          const text = await response.text();
          return {
            content: [{ type: "text", text }],
            details: {},
          };
        },
      });
    }
  }
}

function resolveRef(ref: string, spec: any): any {
  const name = ref.replace("#/components/schemas/", "");
  return spec.components?.schemas?.[name];
}

function buildTypeboxSchema(schema: any, spec: any): any {
  if (!schema) return Type.Object({});
  if (schema.$ref) return buildTypeboxSchema(resolveRef(schema.$ref, spec), spec);

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

  // anyOf: pick first non-null
  if (prop.anyOf) {
    const nonNull = prop.anyOf.find((s: any) => s.type !== "null");
    return toTypeboxProperty(nonNull ?? { type: "string" }, spec);
  }

  const desc = prop.description ? { description: prop.description } : {};

  if (prop.type === "array") return Type.Array(toTypeboxProperty(prop.items ?? {}, spec), desc);
  if (prop.type === "number") return Type.Number(desc);
  if (prop.type === "boolean") return Type.Boolean(desc);
  if (prop.type === "object") return Type.Record(Type.String(), Type.Unknown(), desc);

  return Type.String(desc);
}
