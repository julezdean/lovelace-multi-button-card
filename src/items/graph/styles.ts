/**
 * The graph runs full-bleed along the bottom of the cell - to its edges, cut
 * by the cell's own rounded corners - so it reads as part of the surface,
 * not as a picture placed on it.
 */
export const GRAPH_STYLES = `
.btn.graph {
  --mbc-graph-line: 2px;
  --mbc-graph-top: var(--mbc-accent);
}

.graph-area {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(var(--mbc-graph-h, 50%), calc(100% - var(--mbc-graph-head, 0px)));
  pointer-events: none;
}
.graph-area svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.graph-line {
  fill: none;
  stroke-width: var(--mbc-graph-line);
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}
.graph-fill { stroke: none; }
.btn.graph.drawing-off .graph-area { display: none; }
.btn.graph.unavailable .graph-area,
.btn.graph.invalid .graph-area { opacity: 0.4; }

/* --- split: text on top, as a horizontal button ------------------------- */

.btn.graph-split {
  justify-content: flex-start;
  align-items: stretch;
}
.graph-head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.graph-head .icon {
  --mdc-icon-size: calc(var(--mbc-icon-size) * 0.8);
  width: calc(var(--mbc-icon-size) * 0.8);
  height: calc(var(--mbc-icon-size) * 0.8);
}
.graph-head .labels {
  align-items: flex-start;
  text-align: left;
}
.btn.graph .name {
  -webkit-line-clamp: 1;
  line-clamp: 1;
}

/* --- background: a button, with the graph behind it --------------------- */

.btn.graph-background > .icon,
.btn.graph-background > .labels {
  position: relative;
}
/* The line runs behind the text: muted, and the text carries a halo in the
   card's own colour, so it keeps its contrast where it crosses the line.
   Bars are a surface rather than a line and are muted further. */
.btn.graph-background .graph-area { opacity: 0.3; }
.btn.graph-background .graph-fill.bars { opacity: 0.5; }
.btn.graph-background > .labels {
  --mbc-halo: var(--ha-card-background, var(--card-background-color, #1c1c1e));
  text-shadow:
    0 0 2px var(--mbc-halo),
    0 0 3px var(--mbc-halo),
    0 0 5px var(--mbc-halo),
    0 0 8px var(--mbc-halo),
    0 0 12px var(--mbc-halo);
}
`;
