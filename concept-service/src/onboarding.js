'use strict';
/*
 * Client onboarding intake — the back end for the Onboarding view in the OS.
 *
 * The OS page is one static file with no server of its own, so it cannot talk
 * to Postgres or drop a job in the runner's queue. This module is how it does
 * both:
 *
 *   listIntake()     every brand on file, and how far the agents have got
 *   upsertIntake()   save what somebody typed on the form
 *   uploadLogo()     put a logo file in Storage and hand back its public URL
 *   queueBootstrap() ask the runner to go read the client's documents
 *
 * WHICH STORE, AND WHY. There are three client registries and they are not
 * interchangeable:
 *
 *   jarvis_brand_brain.brand_brain   83 clients, flat JSONB, mirrored FROM
 *                                    Airtable by brand-brain-poller. Every
 *                                    strategist skill reads it. Writing here
 *                                    directly is pointless: the next poll
 *                                    overwrites it. Writes go via Airtable.
 *   public.clients/brands/...        the relational Knowledge Layer, same
 *                                    Postgres, different schema.
 *   the OS app's own `clients` table  portal logins. Nothing to do with this.
 *
 * Onboarding writes to the Knowledge Layer, because the fields the form
 * captures belong on a brand row and everything the agents then produce hangs
 * off brand_snapshots.
 *
 * It deliberately does NOT create a brand_snapshot. A snapshot is what the
 * agents build from real documents; an empty one would satisfy the
 * `is_current` lookup every reader uses while carrying no facts, so they would
 * all believe the brand had been analysed. No snapshot reads as "not analysed
 * yet", which is the truth the day the form is submitted.
 */

const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const KL_URL = process.env.SUPABASE_KNOWLEDGE_LAYER_URL || '';
/* The runner watches this folder. Mounted from the adbundance-os_vault volume
   the hud and runner already share — see docker-compose.yml. */
const VAULT_ROOT = process.env.VAULT_ROOT || '/vault';

const configured = () => Boolean(KL_URL);

/* A short-lived client per call rather than a pool: onboarding is a handful of
   requests a week, and a pool held open against the Supabase pooler is a
   connection this box does not need to keep. */
async function withDb(fn) {
  if (!configured()) {
    const e = new Error('the Knowledge Layer is not configured on this server');
    e.status = 503;
    throw e;
  }
  const c = new Client({ connectionString: KL_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => {});
  }
}

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

/* Anything a person is likely to paste:
     .../drive/folders/<id>            .../drive/u/0/folders/<id>?usp=sharing
     .../open?id=<id>                  or a bare id
   Returns null when there is nothing id-shaped in it, so a typo is caught here
   rather than sent to Drive as a malformed id. Kept in step with
   runner/skills/lib/driveHarvest.js's own copy in the OS repo. */
function folderIdFromUrl(input) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return null;
  const byPath = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byQuery = s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (byQuery) return byQuery[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

/* A single DOCUMENT rather than a folder — the brief, the guidelines, the
   onboarding deck. Covers every shape Google hands out:
     docs.google.com/document|presentation|spreadsheets/d/<id>/edit
     drive.google.com/file/d/<id>/view
     drive.google.com/open?id=<id>
   A folder link is accepted here too and simply comes back as an id; the agent
   works out which it is from Drive's own metadata, so pasting a folder into a
   document box still does something sensible rather than erroring. */
function docIdFromUrl(input) {
  const s = String(input == null ? '' : input).trim();
  if (!s) return null;
  const byD = s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (byD) return byD[1];
  return folderIdFromUrl(s);
}

/* The three documents the form names, in the order the agent should read
   them. `optional` only affects the wording when one is missing — every field
   is optional to SAVE, because half a record now beats no record. */
const SOURCE_DOCS = [
  { key: 'briefUrl',           col: 'brief_url',            label: 'Creative brief' },
  { key: 'brandGuidelinesUrl', col: 'brand_guidelines_url', label: 'Brand guidelines', optional: true },
  { key: 'onboardingUrl',      col: 'onboarding_url',       label: 'Onboarding deck' }
];

/* A bare domain typed without a scheme is the common case and must not be
   rejected — the logo finder and the extraction agent both need a real URL. */
function normalizeWebsite(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes('.')) return null;
    return u.toString().replace(/\/$/, '');
  } catch (e) {
    return null;
  }
}

async function listIntake() {
  return withDb(async (c) => {
    const { rows } = await c.query(
      `select cl.name as client_name, b.name as brand_name, b.slug as brand_slug,
              b.website, b.drive_folder_url, b.logo_url,
              b.brief_url, b.brand_guidelines_url, b.onboarding_url,
              s.updated_at as snapshot_at,
              (mp.id is not null) as has_plan
         from brands b
         join clients cl on cl.id = b.client_id
         left join brand_snapshots s on s.brand_id = b.id and s.is_current = true
         left join marketing_plans mp on mp.brand_id = b.id and mp.is_current = true
        order by cl.name, b.name`
    );
    return rows.map((r) => ({
      clientName: r.client_name,
      brandName: r.brand_name,
      brandSlug: r.brand_slug,
      website: r.website,
      driveFolderUrl: r.drive_folder_url,
      briefUrl: r.brief_url,
      brandGuidelinesUrl: r.brand_guidelines_url,
      onboardingUrl: r.onboarding_url,
      /* what the agent will actually have to read, so the table can say
         "2 of 3" without the page recounting it */
      docCount: [r.brief_url, r.brand_guidelines_url, r.onboarding_url].filter(Boolean).length,
      logoUrl: r.logo_url,
      snapshotAt: r.snapshot_at ? new Date(r.snapshot_at).toISOString() : null,
      hasMarketingPlan: Boolean(r.has_plan),
    }));
  });
}

/* One transaction: a client row with no brand under it is worse than a
   failure. Fields coalesce rather than overwrite — re-submitting the form with
   the logo box empty must not wipe a logo the discovery agent already found. */
async function upsertIntake(input) {
  const clientName = String(input.clientName || '').trim();
  if (!clientName) { const e = new Error('client name is required'); e.status = 400; throw e; }
  const brandName = String(input.brandName || '').trim() || clientName;

  const website = normalizeWebsite(input.website);
  const driveFolderUrl = String(input.driveFolderUrl || '').trim() || null;
  const driveFolderId = folderIdFromUrl(driveFolderUrl);
  if (driveFolderUrl && !driveFolderId) {
    const e = new Error('That does not look like a Google Drive folder link — it should contain /folders/<id>.');
    e.status = 400;
    throw e;
  }
  /* Each named document is validated the same way the folder link is: a link
     with no id in it is a typo, and catching it here beats handing the agent
     something it cannot open. */
  const docs = {};
  for (const d of SOURCE_DOCS) {
    const raw = String(input[d.key] || '').trim() || null;
    if (raw && !docIdFromUrl(raw)) {
      const e = new Error('The ' + d.label.toLowerCase() + ' link does not look like a Google Drive or Docs link.');
      e.status = 400;
      throw e;
    }
    docs[d.col] = raw;
  }

  const logoUrl = String(input.logoUrl || '').trim() || null;
  const clientSlug = slugify(clientName);
  const brandSlug = slugify(brandName);

  return withDb(async (c) => {
    await c.query('BEGIN');
    try {
      const { rows: clientRows } = await c.query(
        `insert into clients (slug, name) values ($1, $2)
         on conflict (slug) do update set name = excluded.name, updated_at = now()
         returning id`,
        [clientSlug, clientName]
      );
      const clientId = clientRows[0].id;

      const { rows: existing } = await c.query('select id from brands where slug = $1', [brandSlug]);
      const created = existing.length === 0;

      const { rows: brandRows } = await c.query(
        `insert into brands (client_id, slug, name, website, drive_folder_url, logo_url,
                             brief_url, brand_guidelines_url, onboarding_url)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (slug) do update set
           name                 = excluded.name,
           client_id            = excluded.client_id,
           website              = coalesce(excluded.website, brands.website),
           drive_folder_url     = coalesce(excluded.drive_folder_url, brands.drive_folder_url),
           logo_url             = coalesce(excluded.logo_url, brands.logo_url),
           brief_url            = coalesce(excluded.brief_url, brands.brief_url),
           brand_guidelines_url = coalesce(excluded.brand_guidelines_url, brands.brand_guidelines_url),
           onboarding_url       = coalesce(excluded.onboarding_url, brands.onboarding_url),
           updated_at           = now()
         returning id, website, drive_folder_url, logo_url,
                   brief_url, brand_guidelines_url, onboarding_url`,
        [clientId, brandSlug, brandName, website, driveFolderUrl, logoUrl,
         docs.brief_url, docs.brand_guidelines_url, docs.onboarding_url]
      );
      await c.query('COMMIT');

      const b = brandRows[0];
      const docUrls = [b.brief_url, b.brand_guidelines_url, b.onboarding_url].filter(Boolean);
      return {
        clientId, clientSlug, clientName,
        brandId: b.id, brandSlug, brandName,
        website: b.website,
        driveFolderUrl: b.drive_folder_url,
        driveFolderId: folderIdFromUrl(b.drive_folder_url),
        briefUrl: b.brief_url,
        brandGuidelinesUrl: b.brand_guidelines_url,
        onboardingUrl: b.onboarding_url,
        docUrls,
        /* the agent has something to read if EITHER named documents or a
           whole folder came through */
        hasSource: docUrls.length > 0 || Boolean(folderIdFromUrl(b.drive_folder_url)),
        logoUrl: b.logo_url,
        created,
      };
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    }
  });
}

/* The runner picks any JSON file dropped here up within seconds. Exactly the
   intent shape the OS app's own writeIntent() produces, so the runner cannot
   tell the difference and nothing there needs changing. */
function queueBootstrap({ clientName, driveFolderUrl, docUrls, website, requestedBy }) {
  const dir = path.join(VAULT_ROOT, 'system', 'queue');
  if (!fs.existsSync(dir)) {
    const e = new Error('the runner queue is not mounted on this server');
    e.status = 503;
    throw e;
  }
  const id = randomUUID();
  const intent = {
    id,
    skill: 'brand-brain-bootstrap',
    /* docUrls is a JSON-stringified array, the same convention static-ads
       already uses for its own list args — the OS app's queue whitelist only
       lets plain strings through. */
    args: Object.assign(
      { client: clientName },
      driveFolderUrl ? { driveFolderUrl } : {},
      docUrls && docUrls.length ? { docUrls: JSON.stringify(docUrls) } : {},
      website ? { website } : {}
    ),
    ts: new Date().toISOString(),
    source: 'onboarding-form',
    userId: requestedBy || null,
  };
  /* Written to a temp name and renamed, so the runner never reads a file that
     is still being written. */
  const tmp = path.join(dir, '.' + id + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(intent, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, path.join(dir, id + '.json'));
  return id;
}

const queueMounted = () => fs.existsSync(path.join(VAULT_ROOT, 'system', 'queue'));

/* ---- logo upload ----------------------------------------------------------
   The same bucket and path shape the OS app's own uploader writes to
   (lib/adReferencesStorage.ts, bucket `ad-references`, prefix `brand-logo/`),
   so a logo uploaded here is indistinguishable from one uploaded there and the
   existing public URLs keep working. Storage lives in the static-ads Supabase
   project this service is already configured against — a different project
   from the Knowledge Layer, which is why only the URL is stored in `brands`. */
const STORAGE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const STORAGE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const BUCKET = 'ad-references';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const LOGO_TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif'
};

const storageReady = () => Boolean(STORAGE_URL && STORAGE_KEY);

async function uploadLogo(bytes, contentType, originalName) {
  if (!storageReady()) {
    const e = new Error('file storage is not configured on this server');
    e.status = 503;
    throw e;
  }
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const ext = LOGO_TYPES[type];
  if (!ext) {
    const e = new Error('That file type is not an image we can store. Use PNG, JPG, WEBP, SVG or GIF.');
    e.status = 400;
    throw e;
  }
  if (!bytes || !bytes.length) { const e = new Error('the file was empty'); e.status = 400; throw e; }
  if (bytes.length > MAX_LOGO_BYTES) {
    const e = new Error('That file is over 5 MB. A logo should be far smaller.');
    e.status = 400;
    throw e;
  }

  /* A random name, never the uploaded one: two clients both sending logo.png
     would otherwise overwrite each other, and an attacker-chosen path has no
     business reaching the bucket. */
  const objectPath = 'brand-logo/' + randomUUID() + '.' + ext;
  const res = await fetch(STORAGE_URL + '/storage/v1/object/' + BUCKET + '/' + objectPath, {
    method: 'POST',
    headers: { apikey: STORAGE_KEY, authorization: 'Bearer ' + STORAGE_KEY, 'content-type': type },
    body: bytes,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const e = new Error('Upload failed (HTTP ' + res.status + '): ' + text.slice(0, 160));
    e.status = 502;
    throw e;
  }
  return {
    url: STORAGE_URL + '/storage/v1/object/public/' + BUCKET + '/' + objectPath,
    bytes: bytes.length,
    type,
    name: String(originalName || '').slice(0, 120) || null,
  };
}

module.exports = {
  configured, queueMounted, storageReady,
  listIntake, upsertIntake, queueBootstrap, uploadLogo,
  folderIdFromUrl, docIdFromUrl, normalizeWebsite,
  SOURCE_DOCS, MAX_LOGO_BYTES,
};
