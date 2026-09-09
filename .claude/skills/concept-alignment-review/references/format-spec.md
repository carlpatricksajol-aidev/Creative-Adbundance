# Format spec

Every visual detail of the concept alignment review deck. If you find yourself guessing a color or size, look here first.

## Layout

- `pres.layout = "LAYOUT_WIDE"` — 13.3" × 7.5"
- Slide margins: 0.5" left, 0.5" right, 0.7" top (below the cyan rule), 0.5" bottom
- The cyan top rule is 0.08" tall, full-width, at y=0

## Palette

```js
const C = {
  navy:   "0A2540",  // primary dark — cover, chart bar 2, headline color, dark cards
  cyan:   "00A3E0",  // accent — top rule, eyebrow labels, info chips, date chips, chart bar 1
  amber:  "F59E0B",  // soft flag — action item chips, cross-batch flag chips
  red:    "DC2626",  // hard flag — action item chips, hold-back chips, zero counts
  green:  "10B981",  // keeper set chips
  white:  "FFFFFF",  // page background, chart plot area, contrast text
  ink:    "0F172A",  // near-black body text
  mute:   "64748B",  // muted body text (subtitles, source citations)
  tint:   "F1F5F9",  // light card fill
  line:   "CBD5E1",  // hairline borders
};
```

**Never use `#` prefix in pptxgenjs color hex.** `color: "0A2540"` is correct; `color: "#0A2540"` corrupts the file.

## Typography

- **Cambria** for headers, chip labels, headlines, big statistic numbers, and any character number chip. Safe-list serif that renders true-to-width in LibreOffice QA and ships with Office.
- **Calibri** for all body text, subtitles, source citations, and card body copy. Safe-list sans.
- **Do not use DM Sans, Inter, Geist Mono, or any non-safe-list font in this deck.** The QA preview will lie about text fit and you will ship overflowing slides.

### Sizes

| Element                       | Font    | Size | Weight | Notes                                     |
|-------------------------------|---------|------|--------|-------------------------------------------|
| Cover eyebrow (CLIENT NAME)   | Cambria | 14   | bold   | `charSpacing: 8`, color cyan              |
| Cover headline                | Cambria | 44   | bold   | color white                               |
| Cover subhead                 | Calibri | 15   | reg    | color `CBD5E1` (light gray on navy)       |
| Cover footer                  | Calibri | 11   | reg    | `charSpacing: 3`, color cyan              |
| Slide eyebrow (section label) | Cambria | 10   | bold   | `charSpacing: 4`, color cyan              |
| Slide title                   | Cambria | 28   | bold   | color navy, height 0.7" — reserve room    |
| Slide subtitle                | Calibri | 13   | italic | color mute                                |
| Card eyebrow (small caps)     | Calibri | 9    | bold   | `charSpacing: 3`, color mute or cyan      |
| Card headline                 | Cambria | 15   | bold   | color navy                                |
| Card body                     | Calibri | 11   | reg    | color ink, `lineSpacing` implicit         |
| Action item headline          | Calibri | 12   | bold   | color navy                                |
| Action item SOURCE line       | Calibri | 8    | italic | `charSpacing: 2`, color mute              |
| Action item fix text          | Calibri | 10.5 | reg    | color ink, `valign: "top"`                |
| Big stat number               | Cambria | 32   | bold   | color navy (or red for zero-count)        |
| Chart title                   | Cambria | 13   | bold   | color navy                                |
| Chart axis labels             | Calibri | 10   | reg    | color mute                                |
| Table header cell             | Calibri | 9    | bold   | `charSpacing: 2`, color white on navy     |
| Table body cell               | Calibri | 10   | reg    | color ink; status column bold, colorized  |
| Date chip (Next Steps)        | Cambria | 15   | bold   | `charSpacing: 3`, color white on cyan     |
| Footer breadcrumb             | Calibri | 9    | reg    | color mute                                |
| Footer page number            | Calibri | 9    | reg    | color mute, `align: "right"`              |

## Chip and shape specs

- **Round rect radius:** `rectRadius: 0.06` for large cards, `0.05` for number chips, `0.04` for pill chips
- **Number chip (action items):** 0.4" × 0.4", `rectRadius: 0.05`, filled color = severity
- **Big number chip (exec summary):** 0.9" × 0.9", `rectRadius: 0.06`
- **Pillar / vehicle chip:** 2.4" × 0.32" (width chosen to fit "AI DYNAMIC MESSAGING" or similar long labels on one line), `rectRadius: 0.04`, `charSpacing: 2`
- **Date chip (Next Steps):** 1.6" × 0.9", `rectRadius: 0.06`

## Card layouts

- **Large content card:** `roundRect`, fill=tint OR fill=navy, line=`{ color: C.line, width: 0.75 }` on tint cards, no line on navy cards
- **Two-column split:** 6.0" wide each, 0.3" gutter → left card at x=0.5, right card at x=6.8
- **Left card = evidence / current state**, right card = recommendation. This is directional — do not flip it.

## Chart defaults (`pres.addChart`)

Always a clustered column bar chart for delivery mix.

```js
{
  barDir: "col",
  barGrouping: "clustered",
  chartColors: [C.cyan, C.navy],       // delivered first, recommended second
  showTitle: true,
  titleFontFace: "Cambria",
  titleFontSize: 13,
  titleColor: C.navy,
  showValue: true,
  dataLabelPosition: "outEnd",         // never "outEnd" on stacked; but clustered is fine
  dataLabelFontFace: "Calibri",
  dataLabelFontSize: 10,
  dataLabelColor: C.ink,
  catAxisLabelFontFace: "Calibri",
  catAxisLabelFontSize: 10,
  catAxisLabelColor: C.ink,
  valAxisLabelFontFace: "Calibri",
  valAxisLabelFontSize: 10,
  valAxisLabelColor: C.mute,
  valGridLine: { color: C.line, size: 0.5 },
  catGridLine: { style: "none" },
  showLegend: true,
  legendPos: "b",
  legendFontFace: "Calibri",
  legendFontSize: 10,
  legendColor: C.ink,
  valAxisMinVal: 0,
  valAxisMaxVal: <max data value + 1>,
  valAxisMajorUnit: 1,
}
```

## Known QA fixes

Every one of these has bitten a real build. Check them before shipping.

- **Title overflow on 2 lines:** Slide title box is 0.7" tall. If your headline wraps to 2 lines it visually reads OK but pushes the subtitle underneath the title. Rewrite the headline shorter or drop the title `fontSize` to 26.
- **`+100%` big stat number clipped on the right:** Bump the stat box width from 3.5 → 5.0 and drop `fontSize` from 54 → 48. Big numbers with "%" run wider than they look.
- **Concept map STATUS column too narrow:** Longest string is "Reposition or hold" or similar. Give the status column at least 2.4" of width; adjust the other columns down to compensate.
- **Pillar chip too narrow for long labels:** Widen the chip to 2.4" and set `charSpacing: 2` (down from 3) so "AI DYNAMIC MESSAGING" fits on one line.
- **Card body text vertically centered in a big card:** Add `valign: "top"` to any text block whose card has a lot of vertical room. Without it, pptxgenjs centers the body block and it floats in the middle.
- **Card title wrapping to 2 lines overlaps note underneath:** In the concept-overview grid (small cards), if any concept title is long, either grow the card height by ~0.15" or drop title `fontSize` from 12.5 to 11.5 and use `lineSpacingMultiple: 1.1`.
- **SOURCE line crashes into fix text:** SOURCE line is 8pt italic. If it wraps to 2 lines, either shorten the source (drop the specific quote — link the section instead) or add 0.05" to the vertical spacing between the SOURCE line and the fix block.

## Rebuild and validate every time

```bash
node build.js
python /mnt/skills/public/pptx/scripts/office/validate.py output.pptx
python /mnt/skills/public/pptx/scripts/office/soffice.py --headless --convert-to pdf output.pptx
rm -f slide-*.jpg
pdftoppm -jpeg -r 100 output.pdf slide
```

Then view every slide-NN.jpg and check for the QA fixes above.
