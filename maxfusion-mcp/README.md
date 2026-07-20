# MaxFusion MCP Server

Lets Claude (Claude Code / Claude Desktop) talk directly to MaxFusion — browse the team's flows and master prompts, upload product photos, generate images and videos, poll jobs, and pull finished results out of flow runs. Built against the (undocumented) MaxFusion REST API; see `Docs/Creative OS/MaxFusion API - n8n Integration Guide.md` for the API details.

## Tools

| Tool | What it does |
|---|---|
| `list_models` | Generation models + capabilities (aspect ratios, durations, resolutions) |
| `list_flows` | All workspace flows with node counts |
| `get_flow_prompts` | Pull every master prompt out of a flow (analyzer, assistant, text nodes) |
| `get_flow_results` | Read a flow's runtime state: statuses, errors, costs, finished output URLs |
| `upload_image` | Upload a local product photo → `file_id` for image references |
| `generate_image` | Static ad generation (supports product references) — costs tokens |
| `generate_video` | Video generation, prompt-only (Seedance 2.0 etc.) — costs tokens |
| `check_job` / `wait_job` | Poll a generation job until succeeded/failed |
| `create_flow` | Create a (pre-wired) flow in the workspace; a human presses Run in-app |

## Setup (per machine)

```bash
cd maxfusion-mcp && npm install
claude mcp add maxfusion --env MAXFUSION_API_KEY=mfsk_... -- node "<absolute path>\maxfusion-mcp\index.js"
```

For Claude Desktop, add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "maxfusion": {
      "command": "node",
      "args": ["<absolute path>/maxfusion-mcp/index.js"],
      "env": { "MAXFUSION_API_KEY": "mfsk_..." }
    }
  }
}
```

## Example session

> "Upload `product.jpg`, then generate 3 static ad concepts for it using the Statics flow's prompts, wait for them, and show me the URLs. Then write a 15s UGC script in the ugc-15-seconds flow's style and generate the video. If the result looks off, tighten the prompt and regenerate."

Claude chains: `upload_image` → `get_flow_prompts` → `generate_image` ×3 → `wait_job` → `generate_video` → `wait_job` — and iterates on results. That iteration loop is the quality unlock vs. one-shot pipelines.

Notes:
- `generate_video` is prompt-only on the public API (reference images are ignored server-side) — embed the product description in the prompt.
- Generations bill the shared MaxFusion token balance.
