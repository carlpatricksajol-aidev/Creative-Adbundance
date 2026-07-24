#!/usr/bin/env node
/**
 * MaxFusion MCP server
 * Bridges Claude (Code / Desktop) to the MaxFusion API so they can talk directly:
 * browse flows and their master prompts, upload product images, generate
 * images/videos, poll jobs, and read finished results out of flow runs.
 *
 * Auth: set MAXFUSION_API_KEY in the environment (mfsk_...).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const BASE = "https://api.maxfusion.ai/api/v1";
const KEY = process.env.MAXFUSION_API_KEY;
if (!KEY) {
  console.error("MAXFUSION_API_KEY env var is required");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`MaxFusion ${method} ${path} -> HTTP ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] });

const server = new McpServer({ name: "maxfusion", version: "1.0.0" });

/* ------------------------------------------------------------------ */
server.tool(
  "list_models",
  "List available MaxFusion generation models and their capabilities (allowed aspect ratios, durations, resolutions, reference limits). kind: 'images' or 'videos'.",
  { kind: z.enum(["images", "videos"]) },
  async ({ kind }) => {
    const d = await api("GET", `/models/${kind}`);
    const slim = d.data.map((m) => ({
      id: m.id,
      name: m.display_name,
      capabilities: m.capabilities,
    }));
    return text(slim);
  }
);

server.tool(
  "list_flows",
  "List all flows in the MaxFusion workspace (id, name, node type counts, last run time). Flows contain the team's tuned master prompts.",
  {},
  async () => {
    const d = await api("GET", "/flows");
    const slim = d.data.map((f) => {
      const counts = {};
      for (const n of f.canvas_data?.nodes ?? []) counts[n.type] = (counts[n.type] || 0) + 1;
      return { id: f.id, name: f.name, nodes: counts, updated_at: f.updated_at };
    });
    return text(slim);
  }
);

server.tool(
  "get_flow_prompts",
  "Extract every prompt from a flow: content-analyzer master prompts, assistant system prompts, and text prompt nodes. Use this to reuse the team's tuned prompts.",
  { flow_id: z.string().uuid() },
  async ({ flow_id }) => {
    const d = await api("GET", `/flows/${flow_id}`);
    const out = [];
    for (const n of d.canvas_data?.nodes ?? []) {
      const data = n.data ?? {};
      const entry = { node_id: n.id, type: n.type, label: data.label };
      let has = false;
      for (const k of ["imageMasterPrompt", "videoMasterPrompt", "systemPrompt", "prompt", "text"]) {
        if (typeof data[k] === "string" && data[k].trim()) { entry[k] = data[k]; has = true; }
      }
      if (has) out.push(entry);
    }
    return text({ flow: d.name, prompts: out });
  }
);

server.tool(
  "get_flow_results",
  "Read a flow's runtime state: node statuses (done/error), errors, costs, and every generated output URL (finished videos/images live here after someone runs the flow in the app).",
  { flow_id: z.string().uuid() },
  async ({ flow_id }) => {
    const d = await api("GET", `/flows/${flow_id}`);
    const rs = d.runtime_state ?? {};
    const urls = [...JSON.stringify(rs.node_outputs ?? {}).matchAll(/https:\/\/[^"\\]+\.(?:mp4|png|jpe?g|webp)/g)].map((m) => m[0]);
    return text({
      flow: d.name,
      last_run_at: rs.last_run_at,
      node_statuses: rs.node_statuses,
      node_errors: rs.node_errors,
      output_urls: [...new Set(urls)],
    });
  }
);

server.tool(
  "upload_image",
  "Upload a local image file (product photo) to MaxFusion. Returns a file_id usable as a reference in generate_image.",
  { file_path: z.string().describe("Absolute path to a local image file (jpg/png/webp)") },
  async ({ file_path }) => {
    const buf = await readFile(file_path);
    const name = basename(file_path);
    const ext = name.split(".").pop().toLowerCase();
    const ct = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[ext] ?? "image/jpeg";
    const reg = await api("POST", "/files", {
      filename: name,
      content_type: ct,
      size_bytes: buf.length,
      purpose: "image_reference",
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(reg.upload.fields)) form.append(k, v);
    form.append("file", new Blob([buf], { type: ct }), name);
    const up = await fetch(reg.upload.url, { method: "POST", body: form });
    if (!up.ok) throw new Error(`S3 upload failed: HTTP ${up.status} ${await up.text()}`);
    return text({ file_id: reg.file_id, filename: name, bytes: buf.length });
  }
);

server.tool(
  "generate_image",
  "Generate a static ad image. references = file_ids from upload_image (the product photo, for product fidelity). Returns a job_id; use wait_job to get the result. Costs MaxFusion tokens.",
  {
    model: z.string().default("nanobanana-2").describe("From list_models('images'), e.g. nanobanana-2, gpt-image-2"),
    prompt: z.string(),
    aspect_ratio: z.string().default("9_16").describe("Underscore format: 9_16, 1_1, 16_9, 4_5..."),
    quality: z.enum(["low", "medium", "high"]).optional().describe("gpt-image-2 only"),
    references: z.array(z.string().uuid()).optional().describe("file_ids from upload_image"),
  },
  async (args) => {
    const body = { model: args.model, prompt: args.prompt, aspect_ratio: args.aspect_ratio };
    if (args.quality) body.quality = args.quality;
    if (args.references?.length) body.references = args.references;
    return text(await api("POST", "/images", body));
  }
);

server.tool(
  "generate_video",
  "Generate a video with a text prompt (Seedance 2.0 etc.). NOTE: the public API ignores reference images for video, so embed the full product description in the prompt. Returns a job_id; use wait_job. Costs MaxFusion tokens.",
  {
    video_model: z.string().default("seedance-2.0").describe("From list_models('videos')"),
    prompt: z.string(),
    duration: z.number().int().describe("Seconds; must be allowed by the model (seedance-2.0: 4-15)"),
    aspect_ratio: z.string().default("9_16"),
    resolution: z.string().default("1080p").describe("480p | 720p | 1080p (model dependent)"),
  },
  async (args) => text(await api("POST", "/videos", {
    video_model: args.video_model,
    prompt: args.prompt,
    duration: args.duration,
    aspect_ratio: args.aspect_ratio,
    resolution: args.resolution,
  }))
);

server.tool(
  "check_job",
  "Check a generation job once. Statuses: queued -> running -> succeeded | failed. On success the result contains the S3 URL(s).",
  { job_id: z.string().uuid() },
  async ({ job_id }) => text(await api("GET", `/jobs/${job_id}`))
);

server.tool(
  "wait_job",
  "Poll a generation job until it finishes (or times out). Images take ~30s, videos ~3-5 min. Returns the final job object with result URLs.",
  {
    job_id: z.string().uuid(),
    timeout_seconds: z.number().int().min(30).max(900).default(420),
  },
  async ({ job_id, timeout_seconds }) => {
    const start = Date.now();
    let last;
    while (Date.now() - start < timeout_seconds * 1000) {
      last = await api("GET", `/jobs/${job_id}`);
      if (last.status === "succeeded" || last.status === "failed") return text(last);
      await new Promise((r) => setTimeout(r, 10000));
    }
    return text({ timed_out: true, last_status: last?.status ?? "unknown", job_id });
  }
);

server.tool(
  "create_flow",
  "Create a new (empty or pre-wired) flow in the MaxFusion workspace. Pass canvas_data to pre-wire nodes; a human still needs to press Run in the app to execute it.",
  {
    name: z.string(),
    canvas_data: z.any().optional().describe("Optional {nodes:[], edges:[]} canvas object"),
  },
  async ({ name, canvas_data }) => {
    const flow = await api("POST", "/flows", {});
    const patch = { name };
    if (canvas_data) patch.canvas_data = canvas_data;
    return text(await api("PATCH", `/flows/${flow.id}`, patch));
  }
);

/* ------------------------------------------------------------------ */
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("MaxFusion MCP server running (stdio)");
