PASTE-READY JSON BODIES FOR THE N8N HTTP REQUEST NODES
=======================================================

Why the error happened: the master prompts contain quotes and line
breaks, so pasting them raw into the JSON field breaks the JSON.
These files have everything pre-escaped. Paste each file's ENTIRE
content into the node's JSON field (expression mode ON - the field
must show the green {{ }} highlighting).

1. "Content Analyzer - JSON body.txt"
   -> HTTP Request node #1 (POST https://openrouter.ai/api/v1/chat/completions)
   - Prompt pulled clean from the live MaxFusion Analyzer flow via API
     (not from the .md copy, which had broken characters).
   - The image expression assumes webhook data is under "body"
     ($json.body.product_images_base64[0]) and that this node runs
     right after the Webhook node.

2. "Assistant - JSON body.txt"
   -> HTTP Request node #2 (same URL)
   - System prompt = the designer's ECOM PERFORMANCE UGC prompt,
     pulled clean from the "ugc 15 seconds" flow, PLUS an adaptation
     block: since no reference video is attached at generation time,
     it embeds the analyzer's product description into every scene
     prompt, and outputs machine-readable JSON:
       [{"scene":1, "duration":8, "prompt":"..."}]
   - IMPORTANT: node names must match. The expressions reference
     $('Webhook') and $('Content Analyzer'). If your nodes are named
     differently, edit those two names inside the expression.

After the Assistant node:
  - Parse choices[0].message.content (it's a JSON array of scenes)
  - One POST https://api.maxfusion.ai/api/v1/videos per scene:
      {"video_model":"seedance-2.0","prompt":"<scene prompt>",
       "duration":<scene duration>,"aspect_ratio":"9_16","resolution":"1080p"}
  - Poll GET https://api.maxfusion.ai/api/v1/jobs/{job_id}
  - Respond to Webhook with the video URLs
