/** The icon, the compact arrangement and the icon animations of a button. */
export const BUTTON_STYLES = `
.btn.active .icon { color: var(--mbc-accent); }
.btn.invalid .icon { color: var(--mbc-warn); }
.btn.armed .icon { color: var(--mbc-warn); }

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  color: var(--mbc-icon-color, var(--mbc-text-dim));
  --mdc-icon-size: var(--mbc-icon-size);
  width: var(--mbc-icon-size);
  height: var(--mbc-icon-size);
  transition: color 180ms ease;
  will-change: transform;
}

/* Compact cells flip to a horizontal arrangement instead of squeezing text. */
.btn.compact {
  flex-direction: row;
  justify-content: flex-start;
  gap: 10px;
  padding: 8px 12px;
}
.btn.compact .labels { align-items: flex-start; text-align: left; }
.btn.compact .name { width: 100%; }
.btn.compact .state { width: 100%; }

/* Hide the name when there is genuinely no room for it. */
.btn.icon-only .labels { display: none; }

/* --- Animations --------------------------------------------------------- */
/* One keyframe set per type; --mbc-anim-i scales the amplitude so a single
   definition covers every intensity without generating CSS at runtime.       */

.icon.anim { animation-duration: var(--mbc-anim-d); animation-iteration-count: infinite; }

.icon.anim-pulse   { animation-name: mbc-pulse;   animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1); }
.icon.anim-breathe { animation-name: mbc-breathe; animation-timing-function: ease-in-out; }
.icon.anim-bounce  { animation-name: mbc-bounce;  animation-timing-function: cubic-bezier(0.3, 0, 0.4, 1); }
.icon.anim-spin    { animation-name: mbc-spin;    animation-timing-function: linear; }
.icon.anim-shake   { animation-name: mbc-shake;   animation-timing-function: ease-in-out; }
.icon.anim-glow    { animation-name: mbc-glow;    animation-timing-function: ease-in-out; }
.icon.anim-blink   { animation-name: mbc-blink;   animation-timing-function: steps(1, end); }
.icon.anim-wobble  { animation-name: mbc-wobble;  animation-timing-function: ease-in-out; }

@keyframes mbc-pulse {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(calc(1 + 0.11 * var(--mbc-anim-i))); }
}
@keyframes mbc-breathe {
  0%, 100% { transform: scale(1);                                   opacity: calc(1 - 0.28 * var(--mbc-anim-i)); }
  50%      { transform: scale(calc(1 + 0.06 * var(--mbc-anim-i)));  opacity: 1; }
}
@keyframes mbc-bounce {
  0%, 55%, 100% { transform: translateY(0); }
  25%           { transform: translateY(calc(-14% * var(--mbc-anim-i))); }
  40%           { transform: translateY(calc(-5% * var(--mbc-anim-i))); }
}
@keyframes mbc-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
@keyframes mbc-shake {
  0%, 100%      { transform: translateX(0); }
  20%, 60%      { transform: translateX(calc(-9% * var(--mbc-anim-i))); }
  40%, 80%      { transform: translateX(calc(9% * var(--mbc-anim-i))); }
}
@keyframes mbc-glow {
  0%, 100% { filter: drop-shadow(0 0 0 transparent); }
  50%      { filter: drop-shadow(0 0 calc(7px * var(--mbc-anim-i)) currentColor); }
}
@keyframes mbc-blink {
  0%, 49%   { opacity: 1; }
  50%, 100% { opacity: calc(1 - 0.75 * var(--mbc-anim-i)); }
}
@keyframes mbc-wobble {
  0%, 100% { transform: rotate(0deg); }
  25%      { transform: rotate(calc(-7deg * var(--mbc-anim-i))); }
  75%      { transform: rotate(calc(7deg * var(--mbc-anim-i))); }
}


/* --- Reduced motion ----------------------------------------------------- */

@media (prefers-reduced-motion: reduce) {
  .icon.anim { animation: none !important; }
}
`;
