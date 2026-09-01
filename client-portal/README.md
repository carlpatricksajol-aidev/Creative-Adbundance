# Client Portal (external view)

The client-facing side of the OS. Single file, no build step, demo data only
(Ello, seeded batches) - safe for this public repo. The INTERNAL view
(20-internal.html) is deliberately NOT in this repo: it carries a baked-in run
token and lives outside git.

Run it locally:

    python -m http.server 3211

then open http://127.0.0.1:3211/21-external.html

Deep links: ?view=batch&b=b6 · ?view=concepts&b=b6 · ?view=scripts&b=b4

The STAGES array inside is the shared contract with the internal file - same
ids, ext labels and blurbs. Edit both together.
