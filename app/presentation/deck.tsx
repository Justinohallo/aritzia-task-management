"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

import styles from "./deck.module.css";
import { PPTX_PATH, SLIDES, type Chart, type Slide } from "./slides";

/**
 * `/presentation` — the deck, served by the app.
 *
 * A 1280 × 720 stage scaled to the viewport. Keyboard: arrows / Space /
 * PageUp / PageDown move, Home / End jump, N toggles speaker notes, Esc
 * toggles the overview, T resets the clock. The hash carries the slide
 * number so a link lands on a slide. Printing yields one slide per page.
 *
 * Outside the protected layout on purpose: the deck is presented before
 * anyone logs in, and it reads nothing from storage.
 */

const W = 1280;
const H = 720;

// The URL hash is the source of truth for the current slide: a link lands on
// a slide, and the back button steps back through the ones visited.
function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function readHash(): number {
  const n = parseInt(window.location.hash.slice(1), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(SLIDES.length - 1, n - 1)) : 0;
}
const serverSlide = () => 0;

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Deck() {
  const cur = useSyncExternalStore(subscribeHash, readHash, serverSlide);
  const [notesOn, setNotesOn] = useState(false);
  const [overview, setOverview] = useState(false);
  const [scale, setScale] = useState(1);
  const [notesHeight, setNotesHeight] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const notesRef = useRef<HTMLDivElement>(null);

  const go = useCallback((i: number) => {
    window.location.hash = `#${Math.max(0, Math.min(SLIDES.length - 1, i)) + 1}`;
  }, []);

  useEffect(() => {
    startRef.current = Date.now();
  }, []);

  // Fit the stage to the viewport, minus the notes panel when it is open.
  useLayoutEffect(() => {
    const fit = () => {
      const nh = notesOn && notesRef.current ? notesRef.current.offsetHeight : 0;
      setNotesHeight(nh);
      setScale(Math.min(window.innerWidth / W, (window.innerHeight - nh) / H) * 0.96);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [notesOn, cur]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Step from the hash, not from `cur`: hashchange is delivered after
      // this handler returns, so two quick presses (a clicker) would
      // otherwise both step from the same stale slide.
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        go(readHash() + 1);
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(readHash() - 1);
      } else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else if (e.key === "n" || e.key === "N") setNotesOn((v) => !v);
      else if (e.key === "Escape") setOverview((v) => !v);
      else if (e.key === "t" || e.key === "T") {
        startRef.current = Date.now();
        setElapsed(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const cols = Math.max(1, Math.floor((typeof window === "undefined" ? W : window.innerWidth - 48) / (W * 0.25 + 16)));
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div className={cx(styles.root, overview && styles.overview)}>
      <div className={styles.stage}>
        {SLIDES.map((s, i) => {
          const dark = s.layout === "title" || s.layout === "close";
          const style = overview
            ? { left: 24 + (i % cols) * (W * 0.25 + 16), top: 24 + Math.floor(i / cols) * (H * 0.25 + 16) }
            : { transform: `scale(${scale})`, marginTop: notesOn ? -notesHeight : 0 };
          return (
            <section
              key={i}
              aria-label={`Slide ${i + 1} of ${SLIDES.length}: ${s.title}`}
              aria-hidden={!overview && i !== cur}
              className={cx(styles.slide, dark && styles.dark, i === cur && styles.active)}
              style={style}
              onClick={() => {
                if (overview) {
                  go(i);
                  setOverview(false);
                }
              }}
            >
              {s.section ? <div className={styles.section}>{s.section}</div> : null}
              <SlideBody slide={s} />
              <div className={styles.num}>
                {i + 1} / {SLIDES.length}
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.bar} style={{ width: `${((cur + 1) / SLIDES.length) * 100}%` }} />

      <div className={styles.hud}>
        <span className={styles.clock} aria-label="Elapsed time">
          {mm}:{ss}
        </span>
        <Button variant="outline" size="sm" className={styles.ghost} onClick={() => setNotesOn((v) => !v)} aria-pressed={notesOn}>
          Notes
        </Button>
        <Button variant="outline" size="sm" className={styles.ghost} onClick={() => setOverview((v) => !v)} aria-pressed={overview}>
          Overview
        </Button>
        <Button asChild size="sm" className={styles.download}>
          <a href={PPTX_PATH} download>
            Download .pptx
          </a>
        </Button>
      </div>

      {notesOn ? (
        <div ref={notesRef} className={styles.notes} role="note" aria-label="Speaker notes">
          <div className={styles.t}>Speaker notes</div>
          <div>{SLIDES[cur].notes}</div>
        </div>
      ) : null}

      {notesOn ? null : <div className={styles.help}>← → navigate · N notes · Esc overview · T reset timer</div>}
    </div>
  );
}

// --- One renderer per layout ---

function SlideBody({ slide: s }: { slide: Slide }) {
  switch (s.layout) {
    case "title":
      return (
        <div className={styles.titleSlide}>
          <h1>{s.title}</h1>
          <div className={styles.sub}>{s.subtitle}</div>
          <div className={styles.meta}>
            {s.meta.map((m, i) => (
              <div key={m} className={i === 0 ? styles.first : styles.mono}>
                {m}
              </div>
            ))}
          </div>
        </div>
      );
    case "close":
      return (
        <div className={styles.closeSlide}>
          <h1>{s.title}</h1>
          <div className={styles.lines}>
            {s.lines.map((m, i) => (
              <div key={m} className={i === 0 ? styles.first : styles.mono}>
                {m}
              </div>
            ))}
          </div>
        </div>
      );
    case "statement":
      return (
        <div className={styles.statement}>
          <h1>{s.title}</h1>
          {s.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      );
    case "cards":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <div className={styles.cards}>
            {s.cards.map((c) => (
              <div key={c.h} className={styles.card}>
                <h3>{c.h}</h3>
                <p>{c.p}</p>
              </div>
            ))}
          </div>
        </>
      );
    case "table":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <table className={cx(styles.table, s.columns.length === 3 && styles.three)}>
            <thead>
              <tr>
                {s.columns.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, ci) => (
                    <td key={ci}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case "trace":
      return (
        <>
          <h1>{s.title}</h1>
          <div className={styles.trace}>
            {s.steps.map((st) => (
              <div key={st.label} className={styles.step}>
                <div className={styles.label}>{st.label}</div>
                <div className={cx(styles.text, st.mono && styles.mono)}>{st.text}</div>
              </div>
            ))}
          </div>
        </>
      );
    case "diagram":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <div className={styles.flow}>
            {s.nodes.map((n, i) => (
              <Fragments key={n.h}>
                {i > 0 ? (
                  <div className={styles.arrow} aria-hidden="true">
                    →
                  </div>
                ) : null}
                <div className={styles.node}>
                  <h3>{n.h}</h3>
                  <ul>
                    {n.lines.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              </Fragments>
            ))}
          </div>
          <div className={styles.aside}>
            {s.aside.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        </>
      );
    case "columns":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <div className={cx(styles.cols, s.cols.length === 3 ? styles.n3 : styles.n2)}>
            {s.cols.map((c) => (
              <div key={c.h} className={styles.col}>
                <h3>{c.h}</h3>
                <ul>
                  {c.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      );
    case "stats":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <div className={styles.stats}>
            {s.stats.map((st) => (
              <div key={st.l} className={styles.stat}>
                <div className={styles.n}>{st.n}</div>
                <div className={styles.l}>{st.l}</div>
              </div>
            ))}
          </div>
          <p className={styles.foot}>{s.foot}</p>
        </>
      );
    case "chart":
      return (
        <>
          <h1>{s.title}</h1>
          <p className={styles.lead}>{s.lead}</p>
          <div className={cx(styles.chartWrap, s.points.length === 0 && styles.solo)}>
            <div>
              <ChartView chart={s.chart} />
            </div>
            {s.points.length ? (
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      );
  }
}

function Fragments({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// --- Inline SVG charts, drawn to one scale each ---

function ChartView({ chart }: { chart: Chart }) {
  return chart.kind === "bars" ? <Bars chart={chart} /> : <Dots chart={chart} />;
}

function Bars({ chart: c }: { chart: Extract<Chart, { kind: "bars" }> }) {
  const W = 1120,
    H = 360,
    padL = 20,
    padB = 44,
    padT = 30;
  const max = Math.max(...c.values.map((v) => v.value)) * 1.15;
  const n = c.values.length,
    slot = (W - padL) / n,
    bw = slot * 0.62;
  const note = c.values.find((v) => v.note);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="API-equivalent cost per builder task, in dollars">
        {[5, 10, 15].map((g) => {
          const y = padT + (H - padT - padB) * (1 - g / max);
          return (
            <g key={g}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="#e5e5e5" />
              <text x={padL} y={y - 4} fontSize="12" fill="#8a8a8a">
                {c.unit}
                {g}
              </text>
            </g>
          );
        })}
        {c.values.map((v, i) => {
          const h = (H - padT - padB) * (v.value / max),
            x = padL + i * slot + (slot - bw) / 2,
            y = H - padB - h;
          return (
            <g key={v.label}>
              <rect x={x} y={y} width={bw} height={h} rx="3" fill={v.label === "T-08" ? "#e8630a" : "#1a1a1a"} />
              <text x={x + bw / 2} y={y - 8} textAnchor="middle" fontSize="15" fontWeight="600" fill="#1a1a1a">
                {c.unit}
                {v.value.toFixed(2)}
              </text>
              <text x={x + bw / 2} y={H - padB + 20} textAnchor="middle" fontSize="14" fill="#555">
                {v.label}
              </text>
            </g>
          );
        })}
      </svg>
      {note ? (
        <div className={styles.caption}>
          * {note.label}: {note.note}. Orange marks the join-point task.
        </div>
      ) : null}
    </>
  );
}

function Dots({ chart: c }: { chart: Extract<Chart, { kind: "dots" }> }) {
  const W = 640,
    H = 300,
    padL = 200,
    padR = 24,
    rowH = 90,
    top = 60;
  const yA = top + c.series.length * rowH + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={c.caption}>
      <text x="0" y="24" fontSize="15" fontWeight="600" fill="#1a1a1a">
        {c.caption}
      </text>
      {c.series.map((s, r) => {
        const y = top + r * rowH + 30;
        const fill = r === 0 ? "#1a1a1a" : "#e8630a";
        return (
          <g key={s.label}>
            <text x="0" y={y + 5} fontSize="14" fill="#555">
              {s.label}
            </text>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="#d0d0d0" />
            {s.values.map((v, i) => (
              <circle key={i} cx={padL + v * (W - padL - padR)} cy={y} r={r === 0 ? 9 : 7} fill={fill} opacity={r === 0 ? 0.18 : 0.9} />
            ))}
            {r === 0 ? (
              <text x={W - padR} y={y - 16} textAnchor="end" fontSize="12" fill="#8a8a8a">
                10 clients, one instant
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={padL} x2={W - padR} y1={yA} y2={yA} stroke="#1a1a1a" />
      <text x={padL} y={yA + 18} fontSize="12" fill="#8a8a8a">
        0
      </text>
      <text x={W - padR} y={yA + 18} textAnchor="end" fontSize="12" fill="#8a8a8a">
        backoff ceiling
      </text>
      <text x={padL} y={yA + 36} fontSize="12" fill="#8a8a8a">
        {c.axis}
      </text>
    </svg>
  );
}
