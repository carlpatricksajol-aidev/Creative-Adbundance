# VPS setup for the captions step (ffmpeg + font + Whisper key)

Goal: make three things available to n8n on the Hostinger VPS so the caption-burn nodes can run:
1. `ffmpeg` / `ffprobe` that the **Execute Command** node can call
2. `Montserrat-ExtraBold.ttf` for the caption style
3. A **Groq** API key (Whisper word timestamps), stored as an n8n credential

Total time: ~15 minutes. Everything is copy-paste.

---

## Step 0 - Get a terminal on the VPS

Two options:
- **Hostinger hPanel** -> VPS -> your server (srv1486031) -> **Browser terminal** (easiest, no setup)
- Or SSH from your PC: `ssh root@<your VPS IP>` (IP is on the same hPanel page)

## Step 1 - Find out how n8n runs (30 seconds)

```bash
docker ps
```

- **You see a container with `n8n` in the image name** -> you are on the **Docker path** (expected on Hostinger). Note the container NAME from the last column (examples: `n8n`, `root-n8n-1`). Continue with Step 2A.
- **`docker: command not found` or empty list** -> n8n runs directly on the host. Skip to Step 2B (the easy path).

## Step 2A - Docker path (expected)

### Find n8n's data folder on the host

```bash
docker inspect -f '{{range .Mounts}}{{.Source}}  ->  {{.Destination}}{{println}}{{end}}' <CONTAINER_NAME>
```

Look for the line ending in `-> /home/node/.n8n`. The left side is the folder on the VPS (often something like `/var/lib/docker/volumes/n8n_data/_data` or `/root/n8n/.n8n`). Call it `<DATA>` below.

Why here: this folder is shared between host and container, so anything we place in it survives n8n image updates and container restarts. (Installing ffmpeg inside the container with `apk add` would be wiped on every update - do not do that.)

### Install static ffmpeg + the font into it

```bash
uname -m        # x86_64 -> use amd64 below ; aarch64 -> replace amd64 with arm64
cd <DATA>
mkdir -p bin fonts

wget -O /tmp/ff.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
tar -xf /tmp/ff.tar.xz -C /tmp
cp /tmp/ffmpeg-*-static/ffmpeg /tmp/ffmpeg-*-static/ffprobe bin/

wget -O fonts/Montserrat-ExtraBold.ttf "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-ExtraBold.ttf"

chmod +x bin/ffmpeg bin/ffprobe
chown -R 1000:1000 bin fonts     # 1000 = the 'node' user inside the n8n container
rm -rf /tmp/ff.tar.xz /tmp/ffmpeg-*-static
```

### Verify from inside the container

```bash
docker exec -u node <CONTAINER_NAME> /home/node/.n8n/bin/ffmpeg -version
docker exec -u node <CONTAINER_NAME> ls /home/node/.n8n/fonts
```

First command should print `ffmpeg version 7.x`; second should list the font.

**Paths to use in n8n nodes later (inside-container paths):**
- ffmpeg: `/home/node/.n8n/bin/ffmpeg`
- ffprobe: `/home/node/.n8n/bin/ffprobe`
- fonts dir: `/home/node/.n8n/fonts`

## Step 2B - No-Docker path (only if Step 1 showed no container)

```bash
apt update && apt install -y ffmpeg fontconfig
mkdir -p /usr/share/fonts/truetype/montserrat
wget -O /usr/share/fonts/truetype/montserrat/Montserrat-ExtraBold.ttf "https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-ExtraBold.ttf"
fc-cache -f
ffmpeg -version
```

Paths in n8n are then just `ffmpeg` / `ffprobe`, fonts dir `/usr/share/fonts/truetype/montserrat`.

## Step 3 - Test from n8n itself (1 minute)

In n8n, create a throwaway workflow with one **Execute Command** node:

- Command: `/home/node/.n8n/bin/ffmpeg -version` (or `ffmpeg -version` on the no-Docker path)

Execute it. You should see the version text in the output. If the node itself is missing from the node picker, Execute Command has been disabled via the `NODES_EXCLUDE` env var in the Docker compose file - tell Claude and we will re-enable it.

## Step 4 - Groq key for Whisper (2 minutes)

1. Go to **console.groq.com** -> sign in (Google works)
2. Left menu **API Keys** -> **Create API Key** -> name it `n8n-captions` -> copy the `gsk_...` key
3. In n8n: **Credentials -> New -> Header Auth**
   - Name: `groq`
   - Header name: `Authorization`
   - Header value: `Bearer gsk_...`

The caption step will call `POST https://api.groq.com/openai/v1/audio/transcriptions` with model `whisper-large-v3-turbo` (word timestamps). Pricing is $0.04 per HOUR of audio - a 15s ad costs about $0.0002, and the free tier covers testing entirely.

Key rules: the key lives ONLY in that n8n credential. Never in the website, never in a pasted JSON body, never committed to the repo.

## Step 5 - Tell Claude it's done

Report back with:
1. Docker or no-Docker (and the container name if Docker)
2. The `<DATA>` host path
3. "ffmpeg -version worked from the Execute Command node: yes/no"
4. "Groq credential created: yes/no"

Then the caption-burn nodes (download -> transcribe -> align -> AI placement -> ASS build -> ffmpeg burn -> S3 host -> respond) get built and delivered as paste-ready node configs, wired between IF success and Respond.

---

## Troubleshooting

- **`wget: command not found`** -> `apt install -y wget` first (or use `curl -L -o`).
- **johnvansickle.com slow/down** -> mirror: `https://www.johnvansickle.com/ffmpeg/old-releases/` or use the BtbN build: `https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-linux64-gpl.tar.xz` (binaries are in the `bin/` subfolder of that archive).
- **`Permission denied` when the node runs ffmpeg** -> re-run the `chown -R 1000:1000` and `chmod +x` lines from Step 2A.
- **aarch64 machine** -> the amd64 binary will not run; use `ffmpeg-release-arm64-static.tar.xz` instead.
- **Disk space check** -> `df -h /` ; the static ffmpeg is ~80MB, each working video ~10-20MB in /tmp (cleaned after each run).
