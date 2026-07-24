# Create KIE AI Task — switch to nano-banana-pro

The pipeline's prompt is engineered for **nano-banana-pro** (positional multi-image
compositing), but the live node was calling `gpt-image-2-image-to-image`, which handles
reference images differently. That mismatch is why the template layout and the product
were not respected.

This is the **"Create KIE AI Task"** HTTP Request node (not a Code node).

## What stays the same
- Method: `POST`
- URL: `https://api.kie.ai/api/v1/jobs/createTask`
- Header `Authorization: Bearer <your KIE key>` (unchanged — keep your live key)

## What changes: the JSON body

nano-banana-pro uses `model: "nano-banana-pro"` and the images field is **`image_input`**
(an array), NOT `input_urls`. It also takes `resolution` and `output_format`.

Replace the node's **JSON body** with exactly this:

```
={
  "model": "nano-banana-pro",
  "input": {
    "prompt": {{ JSON.stringify($json.prompt) }},
    "image_input": {{ JSON.stringify($json.input_urls) }},
    "aspect_ratio": {{ JSON.stringify($json.aspect_ratio || '1:1') }},
    "resolution": "2K",
    "output_format": "png"
  }
}
```

Notes:
- `$json.input_urls` is what the Build KIE AI Prompt node emits (template first, then
  product/screenshot images, then the logo last). We map that array into `image_input`.
- nano-banana-pro accepts at most **8** images; Build already caps the array at 8.
- `resolution: "2K"` + `output_format: "png"` match the v6.1 spec and give crisp output.
- Poll node (`Poll Task Status`) and `Extract Image URL` do not change — nano-banana-pro
  returns the same `data.resultJson -> resultUrls[0]` shape gpt-image-2 did.
