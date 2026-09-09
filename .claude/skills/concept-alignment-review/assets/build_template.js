// ============================================================================
// CONCEPT ALIGNMENT REVIEW — BUILD TEMPLATE
// ============================================================================
// Copy this file to your working directory, rename to `build.js`, and fill in
// every `TODO:` marker. Do not delete or rename the helpers — the slide code
// depends on them.
//
// Required BEFORE running:
//   1. Read the client's brand pack, script formula, brief, kickoff notes,
//      concept deck, and website. Every flag needs a source citation.
//   2. Read /mnt/skills/public/pptx/SKILL.md for current pptxgenjs gotchas.
//   3. Confirm the alignment call date with the strategist — it drives the
//      footer text and the Next Steps dates.
//
// Run with:
//   node build.js
//   python /mnt/skills/public/pptx/scripts/office/validate.py <output>.pptx
//   python /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf <output>.pptx
//   rm -f slide-*.jpg && pdftoppm -jpeg -r 100 <output>.pdf slide
// ============================================================================

const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.3" x 7.5"
pres.title = "TODO_CLIENT — Batch TODO_N Concept Alignment Review";

// ============= PALETTE (AdBundance house — do not modify) ====================
const C = {
  navy:   "0A2540",
  cyan:   "00A3E0",
  amber:  "F59E0B",
  red:    "DC2626",
  green:  "10B981",
  white:  "FFFFFF",
  ink:    "0F172A",
  mute:   "64748B",
  tint:   "F1F5F9",
  line:   "CBD5E1",
};

const FONT_H = "Cambria";  // headers, chips, big numbers
const FONT_B = "Calibri";  // body, source lines, cards

// ============= CLIENT / BATCH VARIABLES ======================================
// TODO: fill these in for the client you're building for
const CLIENT_NAME       = "TODO_CLIENT_NAME";       // e.g. "a supplement client" or "an LED-signage client"
const CLIENT_NAME_CAPS  = "TODO_CLIENT_CAPS";        // e.g. "MICROFREE" or "CIRRUS LED"
const BATCH_LABEL       = "Batch TODO_N";            // e.g. "Batch 1" or "Batch 2"
const ALIGNMENT_DATE    = "TODO_MONTH DAY";          // e.g. "Sept 4" or "Oct 7"
const COVER_SUMMARY     = "TODO one-sentence description of the source stack this deck reviews against.";
const OUTPUT_FILENAME   = "TODO_ClientName_BN_Alignment_Review.pptx";

// ============= HELPERS =======================================================

function pageChrome(slide, pageNum, sectionLabel) {
  slide.addShape("rect", { x: 0, y: 0, w: 13.3, h: 0.08, fill: { color: C.cyan }, line: { color: C.cyan } });
  slide.addText(`${CLIENT_NAME}  ·  ${BATCH_LABEL} Concept Alignment Review  ·  For ${ALIGNMENT_DATE} client alignment`,
    { x: 0.5, y: 7.15, w: 8, h: 0.3, fontFace: FONT_B, fontSize: 9, color: C.mute, isTextBox: true, margin: 0 });
  slide.addText(String(pageNum).padStart(2, "0"),
    { x: 12.5, y: 7.15, w: 0.5, h: 0.3, fontFace: FONT_B, fontSize: 9, color: C.mute, align: "right", isTextBox: true, margin: 0 });
  if (sectionLabel) {
    slide.addText(sectionLabel.toUpperCase(),
      { x: 0.5, y: 0.35, w: 8, h: 0.3, fontFace: FONT_H, fontSize: 10, bold: true, color: C.cyan, charSpacing: 4, isTextBox: true, margin: 0 });
  }
}

function slideTitle(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.7, w: 12.3, h: 0.7,
    fontFace: FONT_H, fontSize: 28, bold: true, color: C.navy, isTextBox: true, margin: 0
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 1.4, w: 12.3, h: 0.5,
      fontFace: FONT_B, fontSize: 13, italic: true, color: C.mute, isTextBox: true, margin: 0
    });
  }
}

function pillarChip(slide, x, y, label, color) {
  // Wide chip + tight char spacing so long labels like "AI DYNAMIC MESSAGING" fit on one line.
  slide.addShape("roundRect", {
    x: x - 0.7, y, w: 2.6, h: 0.32, fill: { color }, line: { color }, rectRadius: 0.04,
  });
  slide.addText(label.toUpperCase(), {
    x: x - 0.7, y, w: 2.6, h: 0.32,
    fontFace: FONT_B, fontSize: 9, bold: true, color: C.white, align: "center", valign: "middle",
    charSpacing: 2, isTextBox: true, margin: 0,
  });
}

// Concept slide factory — do not modify. Feed it the concept data + a flags array.
function conceptSlide(page, num, name, vehicle, vehicleColor, currentSummary, flags) {
  const s = pres.addSlide();
  pageChrome(s, page, `Concept ${num} · Action Items`);

  s.addText(`Concept ${num}`, {
    x: 0.5, y: 0.7, w: 2.0, h: 0.5,
    fontFace: FONT_H, fontSize: 14, bold: true, color: C.cyan, isTextBox: true, margin: 0, charSpacing: 3,
  });
  s.addText(name, {
    x: 0.5, y: 1.05, w: 10, h: 0.7,
    fontFace: FONT_H, fontSize: 24, bold: true, color: C.navy, isTextBox: true, margin: 0,
  });
  pillarChip(s, 10.9, 1.15, vehicle, vehicleColor);

  s.addShape("roundRect", {
    x: 0.5, y: 1.95, w: 4.2, h: 5.05,
    fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08,
  });
  s.addText("CURRENT CONCEPT", {
    x: 0.7, y: 2.1, w: 3.8, h: 0.3,
    fontFace: FONT_B, fontSize: 9, bold: true, color: C.mute, charSpacing: 3, isTextBox: true, margin: 0,
  });
  s.addText(currentSummary, {
    x: 0.7, y: 2.45, w: 3.8, h: 4.4,
    fontFace: FONT_B, fontSize: 11, color: C.ink, valign: "top", isTextBox: true, margin: 0, paraSpaceAfter: 6,
  });

  s.addText("ACTION ITEMS", {
    x: 4.9, y: 2.1, w: 8, h: 0.3,
    fontFace: FONT_B, fontSize: 9, bold: true, color: C.mute, charSpacing: 3, isTextBox: true, margin: 0,
  });

  const rightX = 4.9, rightW = 7.9;
  let cy = 2.45;
  flags.forEach((f, i) => {
    const numChipColor = f.level === "hard" ? C.red : f.level === "soft" ? C.amber : C.cyan;
    s.addShape("roundRect", {
      x: rightX, y: cy, w: 0.4, h: 0.4,
      fill: { color: numChipColor }, line: { color: numChipColor }, rectRadius: 0.05,
    });
    s.addText(String(i + 1), {
      x: rightX, y: cy, w: 0.4, h: 0.4,
      fontFace: FONT_H, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(f.head, {
      x: rightX + 0.55, y: cy - 0.02, w: rightW - 0.55, h: 0.32,
      fontFace: FONT_B, fontSize: 12, bold: true, color: C.navy, isTextBox: true, margin: 0,
    });
    s.addText(`SOURCE  ·  ${f.source}`, {
      x: rightX + 0.55, y: cy + 0.28, w: rightW - 0.55, h: 0.24,
      fontFace: FONT_B, fontSize: 8, italic: true, color: C.mute, charSpacing: 2, isTextBox: true, margin: 0,
    });
    s.addText(f.fix, {
      x: rightX + 0.55, y: cy + 0.5, w: rightW - 0.55, h: f.h || 0.7,
      fontFace: FONT_B, fontSize: 10.5, color: C.ink, valign: "top", isTextBox: true, margin: 0,
    });
    cy += (f.h || 0.7) + 0.6;
  });
}

// ============================================================================
// SLIDE 1 — COVER
// ============================================================================
{
  const s = pres.addSlide();
  s.background = { color: C.navy };
  s.addShape("rect", { x: 0, y: 0, w: 0.4, h: 7.5, fill: { color: C.cyan }, line: { color: C.cyan } });
  s.addText(CLIENT_NAME_CAPS, {
    x: 1.0, y: 2.4, w: 11, h: 0.6,
    fontFace: FONT_H, fontSize: 14, bold: true, color: C.cyan, charSpacing: 8, isTextBox: true, margin: 0,
  });
  s.addText(`${BATCH_LABEL} Concept Alignment Review`, {
    x: 1.0, y: 3.0, w: 11, h: 1.2,
    fontFace: FONT_H, fontSize: 44, bold: true, color: C.white, isTextBox: true, margin: 0,
  });
  s.addText(COVER_SUMMARY, {
    x: 1.0, y: 4.3, w: 10.5, h: 1.2,
    fontFace: FONT_B, fontSize: 15, color: "CBD5E1", isTextBox: true, margin: 0,
  });
  s.addText(`Prepared by Creative AdBundance  ·  For ${ALIGNMENT_DATE} client alignment call`, {
    x: 1.0, y: 6.5, w: 11, h: 0.4,
    fontFace: FONT_B, fontSize: 11, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0,
  });
}

// ============================================================================
// SLIDE 2 — EXECUTIVE SUMMARY
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, 2, "Executive Summary");
  slideTitle(s, "TODO: Short punchy exec summary title.",
    "TODO: Grounded in [list of source materials].");

  // TODO: Fill in 3–5 findings. Use severity colors:
  //   hard = C.red, soft = C.amber, info = C.cyan
  const findings = [
    { n: "01", color: C.red,   head: "TODO: Hard flag headline.",  body: "TODO: One paragraph with source citation baked into the copy." },
    { n: "02", color: C.amber, head: "TODO: Soft flag headline.",  body: "TODO: One paragraph." },
    { n: "03", color: C.amber, head: "TODO: Soft flag headline.",  body: "TODO: One paragraph." },
    { n: "04", color: C.cyan,  head: "TODO: Info flag headline.",  body: "TODO: One paragraph." },
  ];

  const yStart = 2.0, rowH = 1.22;
  findings.forEach((f, i) => {
    const y = yStart + i * rowH;
    s.addShape("roundRect", { x: 0.5, y, w: 0.9, h: 0.9, fill: { color: f.color }, line: { color: f.color }, rectRadius: 0.06 });
    s.addText(f.n, {
      x: 0.5, y, w: 0.9, h: 0.9,
      fontFace: FONT_H, fontSize: 22, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0,
    });
    s.addText(f.head, {
      x: 1.6, y, w: 11.2, h: 0.35,
      fontFace: FONT_H, fontSize: 15, bold: true, color: C.navy, isTextBox: true, margin: 0,
    });
    s.addText(f.body, {
      x: 1.6, y: y + 0.36, w: 11.2, h: 0.8,
      fontFace: FONT_B, fontSize: 11, color: C.ink, isTextBox: true, margin: 0,
    });
  });
}

// ============================================================================
// SLIDE 3 — SCOPE & DELIVERY MIX (native chart + interpretation card)
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, 3, "Scope & Delivery Mix");
  slideTitle(s, "TODO: Short delivery-mix headline.",
    "TODO: One-line subtitle explaining what the chart shows.");

  const chartData = [
    // TODO: Fill in the pillar/vehicle/angle grouping that matches this batch.
    { name: "Delivered",   labels: ["TODO_A", "TODO_B", "TODO_C"], values: [0, 0, 0] },
    { name: "Recommended", labels: ["TODO_A", "TODO_B", "TODO_C"], values: [0, 0, 0] },
  ];
  s.addChart(pres.ChartType.bar, chartData, {
    x: 0.5, y: 2.1, w: 7.5, h: 4.6,
    barDir: "col", barGrouping: "clustered",
    chartColors: [C.cyan, C.navy],
    showTitle: true, title: "TODO chart title", titleFontFace: FONT_H, titleFontSize: 13, titleColor: C.navy,
    showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: FONT_B, dataLabelFontSize: 10, dataLabelColor: C.ink,
    catAxisLabelFontFace: FONT_B, catAxisLabelFontSize: 10, catAxisLabelColor: C.ink,
    valAxisLabelFontFace: FONT_B, valAxisLabelFontSize: 10, valAxisLabelColor: C.mute,
    valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
    showLegend: true, legendPos: "b", legendFontFace: FONT_B, legendFontSize: 10, legendColor: C.ink,
    valAxisMinVal: 0, valAxisMaxVal: 6, valAxisMajorUnit: 1,
  });

  s.addShape("roundRect", {
    x: 8.4, y: 2.1, w: 4.4, h: 4.6,
    fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08,
  });
  s.addText("How to read this", {
    x: 8.6, y: 2.25, w: 4.0, h: 0.35,
    fontFace: FONT_H, fontSize: 13, bold: true, color: C.navy, isTextBox: true, margin: 0,
  });
  // TODO: 3–4 short notes stacked vertically
  const readNotes = [
    { t: "TODO note title", d: "TODO one-line detail." },
    { t: "TODO note title", d: "TODO one-line detail." },
    { t: "TODO note title", d: "TODO one-line detail." },
    { t: "TODO note title", d: "TODO one-line detail." },
  ];
  let ny = 2.7;
  readNotes.forEach(n => {
    s.addText(n.t, {
      x: 8.6, y: ny, w: 4.0, h: 0.28,
      fontFace: FONT_B, fontSize: 11, bold: true, color: C.navy, isTextBox: true, margin: 0,
    });
    s.addText(n.d, {
      x: 8.6, y: ny + 0.28, w: 4.0, h: 0.6,
      fontFace: FONT_B, fontSize: 10, color: C.ink, isTextBox: true, margin: 0,
    });
    ny += 0.95;
  });
}

// ============================================================================
// SLIDE 4 — CONCEPT MAP (table)
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, 4, "Concept Map");
  slideTitle(s, "TODO: The N concepts at a glance.",
    "TODO: Vehicle × angle × talent × review status. Numbering matches slides X–Y of the concept deck.");

  // TODO: One row per concept. Status must start with Keep / Reposition / Rewrite / Rebuild / Drop.
  const rows = [
    ["#", "CONCEPT", "VEHICLE", "ANGLE", "TALENT", "STATUS"],
    ["1", "TODO name", "TODO vehicle", "TODO angle", "TODO talent", "Keep, TODO"],
    // ... one row per concept
  ];

  const colW = [0.4, 3.6, 1.9, 2.6, 2.4, 2.4];
  const startX = 0.5, startY = 2.0, headerH = 0.4, rowH = 0.46;

  let x = startX;
  for (let c = 0; c < rows[0].length; c++) {
    s.addShape("rect", { x, y: startY, w: colW[c], h: headerH, fill: { color: C.navy }, line: { color: C.navy } });
    s.addText(rows[0][c], {
      x: x + 0.08, y: startY, w: colW[c] - 0.16, h: headerH,
      fontFace: FONT_B, fontSize: 9, bold: true, color: C.white, valign: "middle", isTextBox: true, margin: 0,
      charSpacing: 2,
    });
    x += colW[c];
  }
  for (let r = 1; r < rows.length; r++) {
    x = startX;
    const y = startY + headerH + (r - 1) * rowH;
    const bandColor = r % 2 === 0 ? C.tint : C.white;
    for (let c = 0; c < rows[r].length; c++) {
      s.addShape("rect", { x, y, w: colW[c], h: rowH, fill: { color: bandColor }, line: { color: C.line, width: 0.5 } });
      let textColor = C.ink, bold = false;
      if (c === 5) {
        const st = rows[r][c].toLowerCase();
        if (st.startsWith("keep")) textColor = C.green;
        else if (st.startsWith("reposition") || st.startsWith("rewrite")) textColor = C.amber;
        else if (st.startsWith("rebuild") || st.startsWith("drop")) textColor = C.red;
        bold = true;
      }
      if (c === 0) { bold = true; textColor = C.navy; }
      s.addText(rows[r][c], {
        x: x + 0.08, y, w: colW[c] - 0.16, h: rowH,
        fontFace: FONT_B, fontSize: 10, bold, color: textColor, valign: "middle", isTextBox: true, margin: 0,
      });
      x += colW[c];
    }
  }
}

// ============================================================================
// SLIDES 5–N — PER-CONCEPT ACTION ITEMS
// ============================================================================
// Repeat conceptSlide() once per concept in the batch. Each concept gets
// exactly 3 action items. Vehicle chip color is C.cyan by default; use
// C.navy for a different pillar, C.amber for a pillar you're flagging, C.red
// for a pillar you're recommending to drop.

// TODO: Uncomment and fill in one conceptSlide() call per concept:
/*
conceptSlide(
  5, "01", "TODO Concept Title", "TODO Vehicle", C.cyan,
  "TODO Full current concept summary paragraph.",
  [
    { level: "hard", head: "TODO flag headline.", source: "TODO source citation", fix: "TODO fix paragraph.", h: 1.0 },
    { level: "soft", head: "TODO flag headline.", source: "TODO source citation", fix: "TODO fix paragraph.", h: 1.0 },
    { level: "info", head: "TODO flag headline.", source: "TODO source citation", fix: "TODO fix paragraph.", h: 0.9 },
  ]
);
conceptSlide(
  6, "02", "TODO Concept Title", "TODO Vehicle", C.cyan,
  "TODO summary.",
  [ ... ]
);
// ... etc for each concept
*/

// ============================================================================
// CROSS-BATCH FLAG SLIDES (2–4 slides)
// ============================================================================
// Two-column layout: evidence card (tint) on left, recommendation card (navy) on right.
// See references/slide-templates.md for the full snippet.

// TODO: Add 2–4 cross-batch flag slides. Common patterns:
//   - Missing audience / vertical / angle (with delivery-mix breakdown on left)
//   - Contradicting client statements (with two quote cards side by side)
//   - Voice guardrail pattern across multiple concepts (with brand-pack quote at top + concept rows below)
//   - Production overload / timeline risk

// ============================================================================
// KEEPER SET + HOLD BACK
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, /* TODO: page number */ 17, "Recommended Selection");
  slideTitle(s, "TODO: Recommended N concepts to advance — with M held back.",
    "TODO: One-line justification for the split.");

  // Keepers card
  s.addShape("roundRect", { x: 0.5, y: 2.0, w: 8.0, h: 4.9, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  s.addText("KEEP (TODO)", { x: 0.7, y: 2.15, w: 7.6, h: 0.3, fontFace: FONT_B, fontSize: 9, bold: true, color: C.green, charSpacing: 3, isTextBox: true, margin: 0 });

  const keepers = [
    // TODO: one row per keeper
    { n: "1", t: "TODO Concept Name (Vehicle)", note: "TODO one-line why." },
  ];
  let ky = 2.55;
  keepers.forEach(k => {
    s.addShape("roundRect", { x: 0.7, y: ky, w: 0.42, h: 0.42, fill: { color: C.green }, line: { color: C.green }, rectRadius: 0.04 });
    s.addText(k.n, { x: 0.7, y: ky, w: 0.42, h: 0.42, fontFace: FONT_H, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    s.addText(k.t, { x: 1.25, y: ky - 0.02, w: 7.0, h: 0.32, fontFace: FONT_B, fontSize: 12, bold: true, color: C.navy, isTextBox: true, margin: 0 });
    s.addText(k.note, { x: 1.25, y: ky + 0.3, w: 7.0, h: 0.32, fontFace: FONT_B, fontSize: 10, italic: true, color: C.mute, isTextBox: true, margin: 0 });
    ky += 0.7;
  });

  // Hold-back card
  s.addShape("roundRect", { x: 8.7, y: 2.0, w: 4.1, h: 4.9, fill: { color: C.navy }, line: { color: C.navy }, rectRadius: 0.08 });
  s.addText("HOLD BACK (TODO)", { x: 8.9, y: 2.15, w: 3.7, h: 0.3, fontFace: FONT_B, fontSize: 9, bold: true, color: C.red, charSpacing: 3, isTextBox: true, margin: 0 });

  const drops = [
    // TODO: one row per hold-back
    { n: "N", t: "TODO Concept Name", why: "TODO one- or two-line reason." },
  ];
  let dy = 2.55;
  drops.forEach(d => {
    s.addShape("roundRect", { x: 8.9, y: dy, w: 0.42, h: 0.42, fill: { color: C.red }, line: { color: C.red }, rectRadius: 0.04 });
    s.addText(d.n, { x: 8.9, y: dy, w: 0.42, h: 0.42, fontFace: FONT_H, fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0 });
    s.addText(d.t, { x: 9.45, y: dy - 0.02, w: 3.15, h: 0.4, fontFace: FONT_B, fontSize: 11, bold: true, color: C.white, isTextBox: true, margin: 0 });
    s.addText(d.why, { x: 9.45, y: dy + 0.4, w: 3.15, h: 1.0, fontFace: FONT_B, fontSize: 10, color: C.white, valign: "top", isTextBox: true, margin: 0 });
    dy += 1.45;
  });
}

// ============================================================================
// PATH A / PATH B
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, /* TODO */ 18, "Recommendation Paths");
  slideTitle(s, `TODO: Two paths into [selection date] — pick one on the ${ALIGNMENT_DATE} call.`,
    "TODO: One-line summary of what each path optimizes for.");

  // Path A card (tint)
  s.addShape("roundRect", { x: 0.5, y: 2.0, w: 6.0, h: 4.9, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  s.addText("PATH A  ·  TODO SHORT DESCRIPTOR", { x: 0.7, y: 2.15, w: 5.6, h: 0.3, fontFace: FONT_B, fontSize: 9, bold: true, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0 });
  s.addText("TODO Big Cambria Path A headline.", { x: 0.7, y: 2.5, w: 5.6, h: 1.1, fontFace: FONT_H, fontSize: 16, bold: true, color: C.navy, isTextBox: true, margin: 0 });
  s.addText([
    { text: "What ships  ", options: { bold: true, color: C.navy } },
    { text: "TODO specifics.", options: { color: C.ink } },
    { text: "\n\n" },
    { text: "What's held  ", options: { bold: true, color: C.navy } },
    { text: "TODO specifics.", options: { color: C.ink } },
    { text: "\n\n" },
    { text: "Trade-offs  ", options: { bold: true, color: C.navy } },
    { text: "TODO specifics.", options: { color: C.ink } },
  ], { x: 0.7, y: 3.7, w: 5.6, h: 3.1, fontFace: FONT_B, fontSize: 11, isTextBox: true, margin: 0, paraSpaceAfter: 6 });

  // Path B card (navy)
  s.addShape("roundRect", { x: 6.8, y: 2.0, w: 6.0, h: 4.9, fill: { color: C.navy }, line: { color: C.navy }, rectRadius: 0.08 });
  s.addText("PATH B  ·  TODO SHORT DESCRIPTOR", { x: 7.0, y: 2.15, w: 5.6, h: 0.3, fontFace: FONT_B, fontSize: 9, bold: true, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0 });
  s.addText("TODO Big Cambria Path B headline.", { x: 7.0, y: 2.5, w: 5.6, h: 1.3, fontFace: FONT_H, fontSize: 15, bold: true, color: C.white, isTextBox: true, margin: 0 });
  s.addText([
    { text: "What ships  ", options: { bold: true, color: C.cyan } },
    { text: "TODO specifics.", options: { color: C.white } },
    { text: "\n\n" },
    { text: "Trade-offs  ", options: { bold: true, color: C.cyan } },
    { text: "TODO specifics.", options: { color: C.white } },
  ], { x: 7.0, y: 3.9, w: 5.6, h: 3.0, fontFace: FONT_B, fontSize: 11, isTextBox: true, margin: 0, paraSpaceAfter: 6 });
}

// ============================================================================
// NEXT STEPS
// ============================================================================
{
  const s = pres.addSlide();
  pageChrome(s, /* TODO */ 19, "Next Steps");
  slideTitle(s, `TODO: Next steps out of the ${ALIGNMENT_DATE} alignment.`,
    "TODO: Owner in bold. Dates assume Path A; add N days on each date for Path B.");

  const steps = [
    // TODO: usually 4 rows spanning alignment date → script handoff
    { d: "TODO",  title: "TODO action title.", body: "TODO one-line detail.", who: "Owner: TODO" },
  ];

  let sy = 2.0;
  steps.forEach(st => {
    s.addShape("roundRect", { x: 0.5, y: sy, w: 1.6, h: 0.9, fill: { color: C.cyan }, line: { color: C.cyan }, rectRadius: 0.06 });
    s.addText(st.d, {
      x: 0.5, y: sy, w: 1.6, h: 0.9,
      fontFace: FONT_H, fontSize: 15, bold: true, color: C.white, align: "center", valign: "middle", charSpacing: 3, isTextBox: true, margin: 0,
    });
    s.addText(st.title, { x: 2.3, y: sy - 0.02, w: 10.5, h: 0.35, fontFace: FONT_H, fontSize: 15, bold: true, color: C.navy, isTextBox: true, margin: 0 });
    s.addText(st.body,  { x: 2.3, y: sy + 0.32, w: 10.5, h: 0.55, fontFace: FONT_B, fontSize: 11, color: C.ink, isTextBox: true, margin: 0 });
    s.addText(st.who,   { x: 2.3, y: sy + 0.82, w: 10.5, h: 0.25, fontFace: FONT_B, fontSize: 9.5, italic: true, color: C.mute, charSpacing: 1, isTextBox: true, margin: 0 });
    sy += 1.22;
  });
}

// ============================================================================
// WRITE FILE
// ============================================================================
pres.writeFile({ fileName: OUTPUT_FILENAME })
  .then(fn => console.log("Wrote:", fn));
