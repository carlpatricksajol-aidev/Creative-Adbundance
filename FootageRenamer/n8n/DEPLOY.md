# Stage 2 deployment (Hostinger n8n VPS)

Puts `stage2.js` into the n8n image and wires the workflow so hitting **READY** on a Notion job
renames that creator's footage automatically. All commands run on the VPS in `/docker/n8n-i3t9/`
(where the n8n `Dockerfile` + `docker-compose.override.yml` from the ffmpeg step already live).

## 1. Get `stage2.js` onto the VPS

From your machine (it's at `FootageRenamer/stage2.js` in the repo):
```bash
scp FootageRenamer/stage2.js root@187.77.154.60:/docker/n8n-i3t9/stage2.js
```
(or paste it on the VPS with `cat > /docker/n8n-i3t9/stage2.js <<'STAGE2EOF'` … `STAGE2EOF`).

## 2. Bake it into the image

Append one line to `/docker/n8n-i3t9/Dockerfile` (keep the existing ffmpeg lines):
```dockerfile
COPY stage2.js /usr/local/bin/stage2.js
```

## 3. Add the env vars

Edit `/docker/n8n-i3t9/docker-compose.override.yml` so the n8n service gets the secrets (fill in
the real values — same Dropbox refresh token / keys from setup):
```yaml
services:
  n8n:
    build:
      context: .
      dockerfile: Dockerfile
    image: n8n-ffmpeg:latest
    environment:
      - DROPBOX_REFRESH_TOKEN=<refresh token>
      - DROPBOX_APP_KEY=<app key>
      - DROPBOX_APP_SECRET=<app secret>
      - OPENROUTER_API_KEY=<openrouter key>
      - OPENROUTER_MODEL=google/gemini-2.5-flash
      - NOTION_TOKEN=<notion integration token>
      - OUTPUT_ROOT=/AI Renamer
      - FFMPEG=/usr/local/bin/ffmpeg
      - FFPROBE=/usr/local/bin/ffprobe
```

## 4. Rebuild + verify

```bash
cd /docker/n8n-i3t9
docker compose up -d --build
docker compose exec n8n node /usr/local/bin/stage2.js          # should print: usage: node stage2.js <page_id>
docker compose exec n8n sh -c 'echo $DROPBOX_REFRESH_TOKEN | head -c 8'   # confirms env is set
```

## 5. Import the workflow

In n8n: **Workflows → Import from File →** `FootageRenamer/n8n/footage-renamer.workflow.json`.
Open each HTTP node and pick your **Notion Bearer** credential (Header Auth: `Authorization` =
`Bearer <notion token>`). Then **Activate** the workflow.

## 6. How it runs

- Strategist hits the Notion **READY?** button → it sets `Status = Queued`.
- Every 2 min the workflow finds Queued rows, sets `Status = Processing`, and runs
  `node stage2.js <pageId>` per row.
- `stage2.js` reads the storyboard + Dropbox link, renames the footage (POV from the actual
  frames), uploads the clean set to `OUTPUT_ROOT/<Client>/<Creator>/{aroll,broll}` + `_report.md`,
  drops the share link in **Output Folder**, posts the report as a row comment, and sets
  `Status = Done` (or `Needs review` if anything's missing/low-confidence).

## Notes

- One job's runtime scales with footage size (it downloads + re-uploads, since the upload folder is
  shared-to-you, not in your account). If big jobs hit a timeout, raise `EXECUTIONS_TIMEOUT` in the
  n8n env.
- To roll back: remove the `COPY`/`environment` lines and `docker compose up -d --build`.
- `stage2.js` mirrors `FootageRenamer/lib/rename.js` (the unit-tested source for the naming logic).
