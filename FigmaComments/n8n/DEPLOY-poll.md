# Deploy the Figma Comment Digest poller (VPS)

Mirrors how the Footage Renamer's `stage2.js` is deployed: the engine runs **inside the
existing n8n Docker container** (which already has Node), bind-mounted from the host and
triggered by a host **cron** via `docker exec`. No image rebuild, no npm install (the engine
has zero runtime deps).

- VPS: `root@187.77.154.60` (Hostinger `srv1486031`)
- n8n container: `n8n-i3t9-n8n-1`
- n8n compose dir: `/docker/n8n-i3t9/`

---

## 1. Copy the engine up (run in your LOCAL PowerShell)

`scp` sends exact bytes (the Hostinger browser console corrupts large pastes, so use scp):

```powershell
scp -r -i $HOME\.ssh\hostinger_vps `
  "c:\Clients\Creative Adbundance\Creative-Adbundance\FigmaComments\engine" `
  root@187.77.154.60:/docker/n8n-i3t9/figma-comments
```

That puts the engine at `/docker/n8n-i3t9/figma-comments/` on the host.

## 2. SSH in (LOCAL PowerShell)

```powershell
ssh -i $HOME\.ssh\hostinger_vps root@187.77.154.60
```

## 3. Bind-mount the folder into the n8n container (on the VPS)

Edit `/docker/n8n-i3t9/docker-compose.override.yml` and add, under the n8n service, a volume
and the env vars (the Footage Renamer already stores keys here the same way):

```yaml
services:
  n8n:
    volumes:
      - ./figma-comments:/opt/figma-comments:ro
    environment:
      - FIGMA_TOKEN=figd_<your_ROTATED_token>
      - OPENROUTER_API_KEY=sk-or-v1-<key>          # may already be set for the renamer
      - SUPABASE_URL=https://xakngjsybyytldyqfsmi.supabase.co
      - SUPABASE_SERVICE_KEY=<service_role key from Supabase > Project Settings > API>
      - DASHBOARD_URL=https://<your-static-ads-form>.vercel.app
      - SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
      - INTERNAL_HANDLES=Alex,Kristen               # your team handles, comma-separated
```

Apply it (fast, no registry pull):

```bash
cd /docker/n8n-i3t9 && docker compose up -d
```

## 4. Smoke-test it once, by hand (on the VPS)

```bash
docker exec -e SKIP_THUMBS=  n8n-i3t9-n8n-1 node /opt/figma-comments/poll.js
```

You should see `[poll] ... change detected -> regenerating` then `brief <id> ...`, a new row
in Supabase `figma_briefs`, and (if the webhook is set) a Slack message. Re-running it right
after should print `no change` (the cursor caught up).

## 5. Install the cron (on the VPS)

`crontab -e`, then add (every 10 min, single instance via flock):

```
*/10 * * * * /usr/bin/flock -n /tmp/figd.lock docker exec n8n-i3t9-n8n-1 node /opt/figma-comments/poll.js >> /var/log/figd.log 2>&1
```

Check it's running: `tail -f /var/log/figd.log`.

---

## Notes
- **Secrets live only here** (the compose env), never in the repo (it is public).
- To update the engine later: re-run the step-1 `scp` (the `:ro` bind-mount picks up the new
  files immediately; no rebuild needed).
- If the host has Node installed directly (`which node`), you can skip the container and run
  `node /docker/n8n-i3t9/figma-comments/poll.js` from cron with the env in the crontab or an
  env file instead. The container route is recommended because it matches the renamer and the
  container definitely has Node.
- Thumbnails: the poller renders + uploads a PNG per commented frame on each change. If that
  makes runs slow, set `POLL_SKIP_THUMBS=1` in the compose env (the board shows labeled
  placeholders instead).
