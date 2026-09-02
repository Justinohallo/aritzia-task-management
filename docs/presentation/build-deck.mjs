#!/usr/bin/env node
/*
 * Renders slides.js to aritzia-task-management.pptx with pptxgenjs.
 *
 * pptxgenjs is not a dependency of the application (CLAUDE.md rule 4 covers
 * runtime dependencies; this is a docs tool), so it is not in package.json.
 * Install it without recording it, then run from the repo root:
 *
 *   npm install --no-save pptxgenjs@3
 *   node docs/presentation/build-deck.mjs
 *
 * The output is committed beside index.html so the "Download .pptx" link
 * works from a file:// open of the deck with no build step.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import PptxGenJS from "pptxgenjs";
import DECK from "./slides.js";

const { slides } = DECK;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const INK = "1A1A1A", INK2 = "555555", INK3 = "8A8A8A", PAPER2 = "F5F5F5", LINE = "D0D0D0", ACCENT = "E8630A", WHITE = "FFFFFF", DARK = "1A1A1A", ONDARK2 = "B8B8B8";
const FONT = "Arial";

const pres = new PptxGenJS();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
pres.author = "Justin O'Halloran";
pres.title = "Aritzia Task Management: approach, rationale, AI workflow";

const W = 13.333, H = 7.5, M = 0.8; // margins
const CW = W - 2 * M;

function text(slide, str, opts) {
  slide.addText(str, Object.assign({ fontFace: FONT, isTextBox: true, margin: 0, valign: "top" }, opts));
}
function section(slide, s, dark) {
  if (!s.section) return;
  text(slide, s.section.toUpperCase(), { x: M, y: 0.45, w: CW, h: 0.3, fontSize: 11, color: dark ? ONDARK2 : INK3, charSpacing: 2 });
}
function heading(slide, s, opts) {
  text(slide, s.title, Object.assign({ x: M, y: 0.8, w: CW, h: 0.8, fontSize: s.title.length > 52 ? 25 : 30, bold: true, color: INK, valign: "middle" }, opts || {}));
}
function lead(slide, s, y) {
  if (!s.lead) return y;
  text(slide, s.lead, { x: M, y: y, w: CW - 1.5, h: 0.75, fontSize: 14, color: INK2, valign: "top" });
  return y + 0.85;
}
function pageNum(slide, i, dark) {
  text(slide, `${i + 1} / ${slides.length}`, { x: W - M - 1.5, y: H - 0.55, w: 1.5, h: 0.3, fontSize: 10, color: dark ? ONDARK2 : INK3, align: "right" });
}
function bullets(items, fontSize, color) {
  return items.map((t, i) => ({ text: t, options: { bullet: { indent: 12 }, breakLine: i < items.length - 1, paraSpaceAfter: 6, fontSize, color } }));
}

const L = {
  title(slide, s) {
    slide.background = { color: DARK };
    text(slide, s.title, { x: M, y: 1.6, w: CW - 1, h: 1.8, fontSize: 44, bold: true, color: WHITE, valign: "bottom" });
    text(slide, s.subtitle, { x: M, y: 3.55, w: CW - 2, h: 0.9, fontSize: 18, color: ONDARK2 });
    text(slide, s.meta.map((m, i) => ({ text: m, options: { breakLine: i < s.meta.length - 1, color: i === 0 ? WHITE : ONDARK2, fontFace: i === 0 ? FONT : "Courier New", fontSize: 13, paraSpaceAfter: 4 } })),
      { x: M, y: 5.6, w: CW, h: 1.2, valign: "bottom" });
  },
  close(slide, s) {
    slide.background = { color: DARK };
    text(slide, s.title, { x: M, y: 1.8, w: CW, h: 1.4, fontSize: 40, bold: true, color: WHITE, valign: "bottom" });
    text(slide, s.lines.map((m, i) => ({ text: m, options: { breakLine: i < s.lines.length - 1, color: i === 0 ? WHITE : ONDARK2, fontFace: i === 0 ? FONT : "Courier New", fontSize: i === 0 ? 18 : 14, paraSpaceAfter: 6 } })),
      { x: M, y: 3.5, w: CW, h: 1.6 });
  },
  statement(slide, s) {
    heading(slide, s, { y: 1.1, h: 1.3, fontSize: 34, valign: "bottom" });
    const runs = s.lines.map((l, i) => ({ text: l, options: { breakLine: i < s.lines.length - 1, paraSpaceAfter: 12, fontSize: 16, color: i === s.lines.length - 1 ? INK : INK2, bold: i === s.lines.length - 1 } }));
    text(slide, runs, { x: M, y: 2.7, w: CW - 1.5, h: 3.6 });
  },
  cards(slide, s) {
    heading(slide, s);
    let y = lead(slide, s, 1.7);
    const gap = 0.25, cw = (CW - gap) / 2, ch = (H - y - 0.7 - gap) / 2;
    s.cards.forEach((c, i) => {
      const x = M + (i % 2) * (cw + gap), yy = y + Math.floor(i / 2) * (ch + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y: yy, w: cw, h: ch, fill: { color: PAPER2 }, line: { color: PAPER2 }, rectRadius: 0.1 });
      text(slide, c.h, { x: x + 0.25, y: yy + 0.2, w: cw - 0.5, h: 0.4, fontSize: 15, bold: true, color: INK });
      text(slide, c.p, { x: x + 0.25, y: yy + 0.62, w: cw - 0.5, h: ch - 0.8, fontSize: 12.5, color: INK2 });
    });
  },
  table(slide, s) {
    heading(slide, s);
    const y = lead(slide, s, 1.7);
    const three = s.columns.length === 3;
    const colW = three ? [2.2, (CW - 2.2) / 2, (CW - 2.2) / 2] : [CW * 0.34, CW * 0.66];
    const head = s.columns.map((c) => ({ text: c.toUpperCase(), options: { bold: true, color: WHITE, fill: { color: DARK }, fontSize: 10, charSpacing: 1 } }));
    const body = s.rows.map((r, ri) => r.map((c, ci) => ({ text: c, options: { bold: ci === 0, color: ci === 0 ? INK : INK2, fill: { color: ri % 2 ? PAPER2 : WHITE }, fontSize: s.rows.length > 6 ? 11 : 12 } })));
    slide.addTable([head, ...body], { x: M, y, w: CW, colW, fontFace: FONT, border: { type: "solid", pt: 0.5, color: LINE }, margin: 0.08, valign: "top", autoPage: false });
  },
  trace(slide, s) {
    heading(slide, s);
    let y = 1.85;
    const rowH = (H - y - 0.7) / s.steps.length;
    s.steps.forEach((st) => {
      text(slide, st.label.toUpperCase(), { x: M, y: y + 0.12, w: 1.7, h: 0.4, fontSize: 10.5, bold: true, color: ACCENT, charSpacing: 2 });
      slide.addShape(pres.ShapeType.roundRect, { x: M + 1.9, y: y, w: CW - 1.9, h: rowH - 0.18, fill: { color: PAPER2 }, line: { color: PAPER2 }, rectRadius: 0.08 });
      text(slide, st.text, { x: M + 2.1, y: y + 0.1, w: CW - 2.3, h: rowH - 0.38, fontSize: st.mono ? 11.5 : 13.5, fontFace: st.mono ? "Courier New" : FONT, color: INK, valign: "middle" });
      y += rowH;
    });
  },
  diagram(slide, s) {
    heading(slide, s);
    let y = lead(slide, s, 1.7);
    const arrowW = 0.5, nw = (CW - 2 * arrowW) / 3, nh = 2.6;
    s.nodes.forEach((n, i) => {
      const x = M + i * (nw + arrowW);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: nw, h: nh, fill: { color: PAPER2 }, line: { color: PAPER2 }, rectRadius: 0.1 });
      text(slide, n.h, { x: x + 0.25, y: y + 0.2, w: nw - 0.5, h: 0.4, fontSize: 16, bold: true, color: INK });
      text(slide, bullets(n.lines, 12, INK2), { x: x + 0.25, y: y + 0.7, w: nw - 0.5, h: nh - 0.9 });
      if (i < s.nodes.length - 1) text(slide, "→", { x: x + nw, y: y + nh / 2 - 0.3, w: arrowW, h: 0.6, fontSize: 24, color: ACCENT, align: "center", valign: "middle" });
    });
    y += nh + 0.35;
    const aw = (CW - 0.4) / 2;
    s.aside.forEach((a, i) => {
      const x = M + i * (aw + 0.4);
      slide.addShape(pres.ShapeType.line, { x, y, w: aw, h: 0, line: { color: INK, width: 1.5 } });
      text(slide, a, { x, y: y + 0.12, w: aw, h: 1.0, fontSize: 12.5, color: INK2 });
    });
  },
  columns(slide, s) {
    heading(slide, s);
    const y = lead(slide, s, 1.7);
    const n = s.cols.length, gap = 0.4, cw = (CW - gap * (n - 1)) / n;
    s.cols.forEach((c, i) => {
      const x = M + i * (cw + gap);
      text(slide, c.h, { x, y, w: cw, h: 0.4, fontSize: 16, bold: true, color: INK });
      slide.addShape(pres.ShapeType.line, { x, y: y + 0.45, w: cw, h: 0, line: { color: INK, width: 1.5 } });
      text(slide, bullets(c.items, n === 3 ? 12 : 12.5, INK2), { x, y: y + 0.6, w: cw, h: H - y - 1.3 });
    });
  },
  stats(slide, s) {
    heading(slide, s);
    const y = lead(slide, s, 1.7);
    const gap = 0.3, sw = (CW - 3 * gap) / 4, sh = 2.5;
    s.stats.forEach((st, i) => {
      const x = M + i * (sw + gap);
      slide.addShape(pres.ShapeType.roundRect, { x, y, w: sw, h: sh, fill: { color: PAPER2 }, line: { color: PAPER2 }, rectRadius: 0.1 });
      text(slide, st.n, { x: x + 0.25, y: y + 0.3, w: sw - 0.5, h: 1.0, fontSize: 44, bold: true, color: INK, valign: "middle" });
      text(slide, st.l, { x: x + 0.25, y: y + 1.4, w: sw - 0.5, h: sh - 1.6, fontSize: 12, color: INK2 });
    });
    text(slide, s.foot, { x: M, y: y + sh + 0.4, w: CW - 1, h: 0.8, fontSize: 11.5, color: INK3 });
  },
  chart(slide, s) {
    heading(slide, s);
    const y = lead(slide, s, 1.7);
    const c = s.chart;
    if (c.kind === "bars") {
      slide.addChart(pres.ChartType.bar, [{ name: "API-equivalent cost, USD", labels: c.values.map((v) => v.label), values: c.values.map((v) => v.value) }], {
        x: M, y, w: CW, h: H - y - 1.3, barDir: "col", chartColors: c.values.map((v) => (v.label === "T-08" ? ACCENT : INK)),
        showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: "$0.00", dataLabelFontSize: 11, dataLabelColor: INK,
        catAxisLabelColor: INK2, catAxisLabelFontSize: 11, valAxisLabelColor: INK3, valAxisLabelFontSize: 10, valAxisNumFmt: "$0",
        valGridLine: { color: "E5E5E5", size: 0.5 }, catGridLine: { style: "none" }, showLegend: false, showTitle: false, barGapWidthPct: 60,
      });
      const note = c.values.find((v) => v.note);
      if (note) text(slide, `* ${note.label}: ${note.note}. Orange marks the join-point task.`, { x: M, y: H - 1.15, w: CW, h: 0.35, fontSize: 10.5, color: INK3 });
    } else if (c.kind === "dots") {
      // Left: the dot strip drawn with shapes. Right: the points.
      const lw = CW * 0.52, rx = M + lw + 0.4, rw = CW - lw - 0.4;
      text(slide, c.caption, { x: M, y, w: lw, h: 0.4, fontSize: 13, bold: true, color: INK });
      const stripX = M + 2.3, stripW = lw - 2.5;
      c.series.forEach((ser, r) => {
        const yy = y + 0.8 + r * 1.2;
        text(slide, ser.label, { x: M, y: yy - 0.15, w: 2.2, h: 0.35, fontSize: 11.5, color: INK2, valign: "middle" });
        slide.addShape(pres.ShapeType.line, { x: stripX, y: yy, w: stripW, h: 0, line: { color: LINE, width: 1 } });
        ser.values.forEach((v) => {
          const d = r === 0 ? 0.22 : 0.18;
          slide.addShape(pres.ShapeType.ellipse, { x: stripX + v * stripW - d / 2, y: yy - d / 2, w: d, h: d, fill: { color: r === 0 ? INK : ACCENT, transparency: r === 0 ? 80 : 5 }, line: { color: r === 0 ? INK : ACCENT, transparency: r === 0 ? 80 : 5 } });
        });
        if (r === 0) text(slide, "10 clients, one instant", { x: stripX, y: yy - 0.5, w: stripW, h: 0.3, fontSize: 10, color: INK3, align: "right" });
      });
      const ya = y + 0.8 + c.series.length * 1.2 - 0.3;
      slide.addShape(pres.ShapeType.line, { x: stripX, y: ya, w: stripW, h: 0, line: { color: INK, width: 1 } });
      text(slide, "0", { x: stripX, y: ya + 0.05, w: 1, h: 0.3, fontSize: 10, color: INK3 });
      text(slide, "backoff ceiling", { x: stripX + stripW - 2, y: ya + 0.05, w: 2, h: 0.3, fontSize: 10, color: INK3, align: "right" });
      text(slide, c.axis, { x: stripX, y: ya + 0.35, w: stripW, h: 0.3, fontSize: 10, color: INK3 });
      text(slide, bullets(s.points, 12, INK2), { x: rx, y, w: rw, h: H - y - 1.2 });
    }
  },
};

slides.forEach((s, i) => {
  const slide = pres.addSlide();
  const dark = s.layout === "title" || s.layout === "close";
  section(slide, s, dark);
  L[s.layout](slide, s);
  pageNum(slide, i, dark);
  if (s.notes) slide.addNotes(s.notes);
});

const out = path.join(__dirname, "aritzia-task-management.pptx");
pres.writeFile({ fileName: out }).then(() => console.log("wrote", out));
