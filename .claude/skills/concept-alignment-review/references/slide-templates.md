# Slide templates

Copy-pasteable pptxgenjs snippets for every slide type in the review deck. Assumes the palette and helpers from `assets/build_template.js` are already declared.

## Cover slide

```js
const s = pres.addSlide();
s.background = { color: C.navy };
s.addShape("rect", { x: 0, y: 0, w: 0.4, h: 7.5, fill: { color: C.cyan }, line: { color: C.cyan } });
s.addText("CLIENT NAME", {
  x: 1.0, y: 2.4, w: 11, h: 0.6,
  fontFace: "Cambria", fontSize: 14, bold: true, color: C.cyan, charSpacing: 8, isTextBox: true, margin: 0,
});
s.addText("Batch N Concept Alignment Review", {
  x: 1.0, y: 3.0, w: 11, h: 1.2,
  fontFace: "Cambria", fontSize: 44, bold: true, color: C.white, isTextBox: true, margin: 0,
});
s.addText("One-sentence summary of what this deck contains — brand pack, script formula, brief, meeting notes.", {
  x: 1.0, y: 4.3, w: 10.5, h: 1.2,
  fontFace: "Calibri", fontSize: 15, color: "CBD5E1", isTextBox: true, margin: 0,
});
s.addText("Prepared by Creative AdBundance  ·  For [Date] client alignment call", {
  x: 1.0, y: 6.5, w: 11, h: 0.4,
  fontFace: "Calibri", fontSize: 11, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0,
});
```

## Executive summary

Numbered chips + headline + body, in a vertical stack. Use N=3 or N=4 findings (5 max — beyond that it's not an executive summary).

```js
const findings = [
  { n: "01", color: C.red,   head: "Hard-flag headline sentence.",  body: "One paragraph with source citation baked into the copy." },
  { n: "02", color: C.amber, head: "Soft-flag headline sentence.",  body: "One paragraph with source citation baked into the copy." },
  { n: "03", color: C.amber, head: "Soft-flag headline sentence.",  body: "One paragraph with source citation baked into the copy." },
  { n: "04", color: C.cyan,  head: "Info-flag headline sentence.",  body: "One paragraph with source citation baked into the copy." },
];

const yStart = 2.0, rowH = 1.22;
findings.forEach((f, i) => {
  const y = yStart + i * rowH;
  s.addShape("roundRect", { x: 0.5, y, w: 0.9, h: 0.9, fill: { color: f.color }, line: { color: f.color }, rectRadius: 0.06 });
  s.addText(f.n, {
    x: 0.5, y, w: 0.9, h: 0.9,
    fontFace: "Cambria", fontSize: 22, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0,
  });
  s.addText(f.head, {
    x: 1.6, y, w: 11.2, h: 0.35,
    fontFace: "Cambria", fontSize: 15, bold: true, color: C.navy, isTextBox: true, margin: 0,
  });
  s.addText(f.body, {
    x: 1.6, y: y + 0.36, w: 11.2, h: 0.8,
    fontFace: "Calibri", fontSize: 11, color: C.ink, isTextBox: true, margin: 0,
  });
});
```

## Delivery mix (chart + card)

Native chart on the left, interpretation card on the right.

```js
const chartData = [
  { name: "Delivered",   labels: ["Group A", "Group B", "Group C"], values: [3, 3, 2] },
  { name: "Recommended", labels: ["Group A", "Group B", "Group C"], values: [3, 2, 1] },
];
s.addChart(pres.ChartType.bar, chartData, {
  x: 0.5, y: 2.1, w: 7.5, h: 4.6,
  barDir: "col", barGrouping: "clustered",
  chartColors: [C.cyan, C.navy],
  showTitle: true, title: "Concepts by group", titleFontFace: "Cambria", titleFontSize: 13, titleColor: C.navy,
  showValue: true, dataLabelPosition: "outEnd", dataLabelFontFace: "Calibri", dataLabelFontSize: 10, dataLabelColor: C.ink,
  catAxisLabelFontFace: "Calibri", catAxisLabelFontSize: 10, catAxisLabelColor: C.ink,
  valAxisLabelFontFace: "Calibri", valAxisLabelFontSize: 10, valAxisLabelColor: C.mute,
  valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
  showLegend: true, legendPos: "b", legendFontFace: "Calibri", legendFontSize: 10, legendColor: C.ink,
  valAxisMinVal: 0, valAxisMaxVal: 4, valAxisMajorUnit: 1,
});

// Interpretation card
s.addShape("roundRect", { x: 8.4, y: 2.1, w: 4.4, h: 4.6, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
s.addText("How to read this", { x: 8.6, y: 2.25, w: 4.0, h: 0.35, fontFace: "Cambria", fontSize: 13, bold: true, color: C.navy, isTextBox: true, margin: 0 });
// Then 3–4 short notes stacked vertically inside the card.
```

## Concept-to-pillar map (table)

```js
const rows = [
  ["#", "CONCEPT", "PILLAR", "ANGLE", "TALENT", "STATUS"],
  ["1", "Concept name",   "Group A", "Angle desc", "Real 55+", "Keep, minor tweaks"],
  // ... one row per concept
];
const colW = [0.4, 3.6, 1.9, 2.6, 2.4, 2.4]; // sums to 13.3
const startX = 0.5, startY = 2.0, headerH = 0.4, rowH = 0.46;

// Header row
let x = startX;
for (let c = 0; c < rows[0].length; c++) {
  s.addShape("rect", { x, y: startY, w: colW[c], h: headerH, fill: { color: C.navy }, line: { color: C.navy } });
  s.addText(rows[0][c], {
    x: x + 0.08, y: startY, w: colW[c] - 0.16, h: headerH,
    fontFace: "Calibri", fontSize: 9, bold: true, color: C.white, valign: "middle", charSpacing: 2, isTextBox: true, margin: 0,
  });
  x += colW[c];
}

// Data rows with status color-coding
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
      fontFace: "Calibri", fontSize: 10, bold, color: textColor, valign: "middle", isTextBox: true, margin: 0,
    });
    x += colW[c];
  }
}
```

## Per-concept action items slide

Use the `conceptSlide()` factory from `assets/build_template.js`. It handles the layout — you only supply the concept data and the flags array.

```js
conceptSlide(
  pageNumber,
  "01",                                    // concept number as 2-digit string
  "Concept Title",                          // headline
  "Vehicle Name",                           // pillar chip label
  C.cyan,                                   // pillar chip color
  "Full current concept summary paragraph.", // left card body
  [
    {
      level: "hard",                        // "hard" | "soft" | "info"
      head: "One-sentence flag headline.",
      source: "Source citation string (see sourcing-cheatsheet.md)",
      fix: "Concrete fix paragraph — specific enough that the strategist could act on it in 24 hours.",
      h: 1.0,                               // optional height override for the fix block
    },
    // 2–3 more flags
  ]
);
```

Each concept slide has **3 action items** by default. Two is too few (looks half-finished), four is too many (slide gets cramped and the strategist can't hold all four in memory during the call).

## Cross-batch flag slide (two-column)

Evidence on the left (tint background), recommendation on the right (navy background).

```js
// Left: evidence card
s.addShape("roundRect", { x: 0.5, y: 2.0, w: 6.0, h: 4.8, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
s.addText("EVIDENCE LABEL", { x: 0.7, y: 2.15, w: 5.6, h: 0.3, fontFace: "Calibri", fontSize: 9, bold: true, color: C.mute, charSpacing: 3, isTextBox: true, margin: 0 });
// Content varies by flag type: bulleted list, big-stat rows, or quote block

// Right: recommendation card
s.addShape("roundRect", { x: 6.8, y: 2.0, w: 6.0, h: 4.8, fill: { color: C.navy }, line: { color: C.navy }, rectRadius: 0.08 });
s.addText("RECOMMENDATION", { x: 7.0, y: 2.15, w: 5.6, h: 0.3, fontFace: "Calibri", fontSize: 9, bold: true, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0 });
s.addText("Big Cambria recommendation headline.", { x: 7.0, y: 2.5, w: 5.6, h: 0.9, fontFace: "Cambria", fontSize: 22, bold: true, color: C.white, isTextBox: true, margin: 0 });
s.addText("Full paragraph explaining the recommendation.", { x: 7.0, y: 3.5, w: 5.6, h: 2.7, fontFace: "Calibri", fontSize: 12, color: C.white, isTextBox: true, margin: 0 });
s.addText("Source: <citation>", { x: 7.0, y: 6.35, w: 5.6, h: 0.3, fontFace: "Calibri", fontSize: 9, italic: true, color: C.cyan, isTextBox: true, margin: 0 });
```

## Keeper set + hold back (two-column)

Left card (8" wide) = KEEP with green chips. Right card (4.1" wide) = HOLD BACK with red chips.

```js
// Keepers card
s.addShape("roundRect", { x: 0.5, y: 2.0, w: 8.0, h: 4.9, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
s.addText("KEEP (N)", { x: 0.7, y: 2.15, w: 7.6, h: 0.3, fontFace: "Calibri", fontSize: 9, bold: true, color: C.green, charSpacing: 3, isTextBox: true, margin: 0 });

// Each keeper: green number chip + title + one-line why
const keepers = [
  { n: "1", t: "Concept Name (Vehicle)", note: "One-line why this stays." },
  // ...
];
let ky = 2.55;
keepers.forEach(k => {
  s.addShape("roundRect", { x: 0.7, y: ky, w: 0.42, h: 0.42, fill: { color: C.green }, line: { color: C.green }, rectRadius: 0.04 });
  s.addText(k.n, { x: 0.7, y: ky, w: 0.42, h: 0.42, fontFace: "Cambria", fontSize: 13, bold: true, color: C.white, align: "center", valign: "middle", isTextBox: true, margin: 0 });
  s.addText(k.t, { x: 1.25, y: ky - 0.02, w: 7.0, h: 0.32, fontFace: "Calibri", fontSize: 12, bold: true, color: C.navy, isTextBox: true, margin: 0 });
  s.addText(k.note, { x: 1.25, y: ky + 0.3, w: 7.0, h: 0.32, fontFace: "Calibri", fontSize: 10, italic: true, color: C.mute, isTextBox: true, margin: 0 });
  ky += 0.7;
});

// Hold-back card — same shape, red chips, navy background, 4.1" wide at x=8.7
```

## Path A / Path B (two-column)

Two side-by-side cards. Path A on the left (tint), Path B on the right (navy). Each card follows the same content shape:

- Label
- Bold headline
- "What ships" section
- "What's held" or optional beat
- "Trade-offs" section

```js
// Path A card
s.addShape("roundRect", { x: 0.5, y: 2.0, w: 6.0, h: 4.9, fill: { color: C.tint }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
s.addText("PATH A  ·  SHORT DESCRIPTOR", { x: 0.7, y: 2.15, w: 5.6, h: 0.3, fontFace: "Calibri", fontSize: 9, bold: true, color: C.cyan, charSpacing: 3, isTextBox: true, margin: 0 });
s.addText("Big Cambria headline sentence.", { x: 0.7, y: 2.5, w: 5.6, h: 1.1, fontFace: "Cambria", fontSize: 16, bold: true, color: C.navy, isTextBox: true, margin: 0 });
s.addText([
  { text: "What ships  ", options: { bold: true, color: C.navy } },
  { text: "specifics here.", options: { color: C.ink } },
  { text: "\n\n" },
  { text: "Trade-offs  ", options: { bold: true, color: C.navy } },
  { text: "specifics here.", options: { color: C.ink } },
], { x: 0.7, y: 3.7, w: 5.6, h: 3.1, fontFace: "Calibri", fontSize: 11, isTextBox: true, margin: 0, paraSpaceAfter: 6 });
```

## Next Steps

Vertical stack of 4 dated rows. Each row = date chip (cyan) + title + one-line body + owner.

```js
const steps = [
  { d: "MONTH D",  title: "Action title.",             body: "One-line detail.", who: "Owner: Name(s)" },
  // ...
];
let sy = 2.0;
steps.forEach(st => {
  s.addShape("roundRect", { x: 0.5, y: sy, w: 1.6, h: 0.9, fill: { color: C.cyan }, line: { color: C.cyan }, rectRadius: 0.06 });
  s.addText(st.d, {
    x: 0.5, y: sy, w: 1.6, h: 0.9,
    fontFace: "Cambria", fontSize: 15, bold: true, color: C.white, align: "center", valign: "middle", charSpacing: 3, isTextBox: true, margin: 0,
  });
  s.addText(st.title, { x: 2.3, y: sy - 0.02, w: 10.5, h: 0.35, fontFace: "Cambria", fontSize: 15, bold: true, color: C.navy, isTextBox: true, margin: 0 });
  s.addText(st.body,  { x: 2.3, y: sy + 0.32, w: 10.5, h: 0.55, fontFace: "Calibri", fontSize: 11, color: C.ink, isTextBox: true, margin: 0 });
  s.addText(st.who,   { x: 2.3, y: sy + 0.82, w: 10.5, h: 0.25, fontFace: "Calibri", fontSize: 9.5, italic: true, color: C.mute, charSpacing: 1, isTextBox: true, margin: 0 });
  sy += 1.22;
});
```
