SAMPLE AD VIDEOS
================

How it works now:

1. Drop your raw mp4 files anywhere in this folder (any filename).
2. They get compressed for web into the "web/" subfolder
   (the site only loads videos from videos/web/).
3. The carousel list lives in ../index.html near the top of the
   <script>, in the MOCKUPS array: one line per video with its
   label. Add / remove / reorder lines there.

To compress a new video yourself (PowerShell or Git Bash):

  ffmpeg -y -i "YOUR RAW FILE.mp4" -vf "scale=-2:'min(1280,ih)'" ^
    -c:v libx264 -crf 27 -preset veryfast -movflags +faststart ^
    -c:a aac -b:a 96k "web/short-name.mp4"

Or just drop the raw file here and ask Claude to "add the new video
to the carousel" - it will compress, wire it in, and redeploy.

Note: raw files in this folder are NOT uploaded to Vercel
(excluded via ../.vercelignore). Only videos/web/ deploys.

Redeploy after changes (from the "Creative OS" folder):

  vercel deploy --prod --yes
