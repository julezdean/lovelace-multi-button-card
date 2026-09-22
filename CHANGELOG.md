# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.6.0] - 2026-09-22

### Changed

- **The card renders a real `<ha-card>`.** It used to draw its own surface -
  a plain div with its own background, radius, hairline and shadow - which
  made it the one card on a dashboard that ignored the theme: a
  `card-mod-card` block selecting `ha-card { ... }` had nothing to select
  here, so themes styling every other card left this one untouched.
- Following from that, `appearance.background`, `radius` and `shadow` no
  longer carry defaults of their own. A default would silently beat the theme,
  which is the problem this release fixes. Set them and they override the
  theme as before; leave them out and the theme decides. `padding` keeps its
  default, being the card's own inner spacing with no theme equivalent.
- Visible consequence without a theme: the card picks up Home Assistant's
  corner radius rather than the 24px it used to insist on, and its outline
  comes from `--ha-card-border-color`.

## [1.5.1] - 2026-09-22

### Fixed

- A button with both `background` and `active_background` kept its resting
  colour while switched on. The configured background was written as an inline
  style while the active colour came from the `.btn.active` rule, and inline
  beats every rule - so `active_background` could never take effect. The
  configured value is a custom property now and the cascade does the ordering.
- A button given only a `background` no longer swaps it for the generic active
  tint when it switches on. The configured value is held in a property of its
  own, so the active rule can tell a configured colour from a default one; a
  button with its own colour keeps it and carries the active state on its icon
  and hairline instead.
- Hover replaced a configured background instead of tinting it. It is an
  overlay now, so it works over any colour.

## [1.5.0] - 2026-09-22

### Added

- Presentation fields take JavaScript templates in the `[[[ ... ]]]` form that
  `custom:button-card` established - reusing that syntax rather than inventing
  one means a template written for either card reads the same. Covers `name`,
  `label`, `state_display`, `icon`, `style`, the colour options and
  `show_name` / `show_state`. `entity`, `colspan` and the actions are
  deliberately excluded: the first is what state tracking hangs on, the second
  would rebuild the layout on every update, the third is structure rather than
  appearance.
- A template that throws costs its own field and nothing else; the error goes
  to the console and the button keeps rendering.
- A per-button `style` of CSS declarations, templated like the rest.
- Every button carries `data-entity`, `data-domain`, `data-state`,
  `data-active`, `data-index` and `data-name`, so a single button can be
  addressed from a stylesheet. card-mod injects into this card's shadow root -
  it targets the card element, not an `ha-card` - so those selectors work
  without any per-button support in card-mod itself.
- A `{}` button on each button's page swaps the form for that button's raw
  YAML, the same affordance as elsewhere in Lovelace. Invalid YAML is not
  written back.
- The accent colour, the icon colour, both backgrounds and the extra CSS are
  editable per button, in a Colours section on the button's page. The options
  already worked in YAML; the form only offered them card-wide, which is where
  people looked for them.

### Fixed

- A button's own accent colour reached its icon but not its outline. The
  hairline was mixed from `--mbc-accent` on the host, and a custom property is
  substituted where it is declared - so the mix froze to the card's accent
  before any button could override it. It is mixed on the button now, which is
  also what makes a templated accent colour work.

## [1.4.1] - 2026-09-22

### Fixed

- The visual editor reset the card's size in a section. Home Assistant writes
  `grid_options` itself when the card is resized there, but the editor rebuilt
  the configuration from the fixed set of keys its own form knows about - so
  every edit dropped `grid_options`, and the card fell back to the default
  twelve columns. It now starts from the existing configuration and replaces
  only the keys its form is responsible for, which also covers `view_layout`
  and anything a future Home Assistant version adds.
- The same applies per button, where it replaces the special cases that were
  keeping visibility conditions and state-dependent icon maps alive one by one.

## [1.4.0] - 2026-09-21

### Added

- Per-button visibility conditions, using Home Assistant's own condition
  grammar rather than a format invented here: `state`, `numeric_state`,
  `screen`, `user` and the `and`/`or`/`not` combinators, written under
  `visibility:` (or `conditions:`, the conditional card's spelling). A list
  means all of them must hold.
- Hiding a button re-runs the layout, so the remaining buttons are re-balanced
  instead of leaving a hole where one used to be.
- A card whose buttons are all hidden removes itself from the dashboard, the
  way a conditional card does, rather than leaving an empty surface.
- `screen` conditions are watched with a media query listener, one per distinct
  query, so rotating a tablet re-evaluates them without a reload.

- Conditions are editable in the visual editor, on a button's page under
  Visibility. `ha-form` cannot express nested structures, so this mounts Home
  Assistant's own `ha-card-conditions-editor` - the control the conditional
  card and section visibility use. It is defined lazily by HA, so it is pulled
  in on demand via `loadCardHelpers`; if that fails the section falls back to a
  note and YAML still works.

### Notes

- An unknown condition type counts as met. A typo should leave the button where
  it is, not make it vanish with no clue as to why.
- Removing the last condition drops the `visibility` key entirely rather than
  leaving an empty list behind.
- The editor carries through anything it cannot model - conditions, and
  state-dependent icon maps - instead of dropping them on save.

## [1.3.0] - 2026-09-21

### Changed

- **`mode: grid` now keeps the raster it was given.** It used to treat
  `columns` as a capacity and then balance the rows within it, so
  `columns: 5` with five buttons and one `colspan: 2` came out as rows of
  three and three rather than five and one. Balancing is what `auto` is for -
  it is how a leftover button avoids sitting alone beside empty space - but
  where the column count is stated outright, "five columns" has to mean five
  columns. Rows are now filled to capacity and the last one stays left-aligned
  in the same raster. Cards using `mode: auto`, the default, are unaffected.
- `max_columns` applies to `auto` only, and the editor now shows it only
  there; `columns` and `column_width` likewise appear only in the mode where
  they do something. An explicit column count is capped at 12 instead of being
  unbounded.

### Added

- Icon size and icon colour per button in the visual editor, and icon and
  label size among the card-wide button defaults.

### Removed

- `layout.rows`, which was carried in the defaults from the original sketch
  but never read by anything.

## [1.2.0] - 2026-09-21

### Added

- Icon size is editable in the visual editor, both as a card-wide default and
  per button. The option already existed in YAML; it was simply not offered by
  the form, which is where people looked for it.
- Per-button icon colour in the editor, next to the size.

### Fixed

- A button with `colspan: 2` was not as wide as two single buttons plus the gap
  between them - it came out one gap too narrow, and its neighbour one gap too
  wide. Rows shared their width with flexbox, which distributes only the FREE
  space by weight, and a row holding two elements has one gap where a row of
  three has two. Correcting that through `flex-basis` does nothing, because
  with `box-sizing: border-box` a basis below the button's padding and border
  is silently raised to it. Rows are now a CSS grid of equal tracks and a wide
  button spans two of them, which is the property that was meant all along.

## [1.1.0] - 2026-09-21

### Added

- A visual editor, so the card no longer says "no visual editor available".
  Card options are an `ha-form`; the buttons get their own list, because
  `ha-form` has no concept of one. A button opens its own page with entity,
  icon, name, width, the three actions and its animation. Buttons can be
  added, deleted and reordered.
- What the editor writes is pruned of anything equal to a default, so opening
  it does not rewrite a short YAML config into a long one.

### Fixed

- The card overflowed its cell in the sections view. The host element had no
  height of its own, so it always took its content height and ignored the cell
  entirely -- overflowing a short one and leaving a gap in a tall one. It now
  takes the height it is given; with no constraint from the parent that still
  resolves to the content height, so masonry and panel views are unchanged.
- The grid footprint was guessed as two rows per row of buttons, which gave two
  buttons 120px for the 200px they want. It is now computed from the same
  layout the card actually renders, and `getGridOptions` is provided alongside
  `getLayoutOptions` so recent Home Assistant versions use the new API.
- A card dragged down to its own `min_rows` clipped its buttons. Rows were
  pinned to the height derived from the measured width, so the card could not
  render at the size it advertised as its minimum. Rows now shrink to the
  touch-target floor (`min_button_size`) instead.

## [1.0.0] - 2026-09-21

First release.

### Added

- Multi-button control card for wall-mounted dashboards, as a single file with
  no dependencies and no build step.
- Layout engine that derives the column count from the measured width and then
  splits the buttons into rows of near-equal size. A leftover button becomes a
  full-width button at the bottom instead of a lonely cell beside empty space,
  so three buttons read as `[2, 1]` and seven as `[3, 2, 2]` rather than
  `[3, 3, 1]`. Button height is clamped at both ends, which is why a single
  button does not become a huge tile and twelve stay tappable.
- `colspan` as a weight in that same calculation, so spanning and balancing are
  one mechanism rather than two.
- Home Assistant's action grammar: `tap_action`, `hold_action` and
  `double_tap_action` with `toggle`, `more-info`, `call-service`, `navigate`,
  `url`, `assist` and `fire-dom-event`. `toggle` handles the domains that have
  no `toggle` service - locks follow their state, buttons are pressed, scenes
  and scripts are turned on.
- Two-step confirmation instead of a modal: the first tap arms the button, a
  second within four seconds runs the action.
- Icon animations in CSS - `pulse`, `breathe`, `bounce`, `spin`, `shake`,
  `glow`, `blink`, `wobble` - with conditions on entity state, including
  numeric thresholds. `prefers-reduced-motion` is honoured.
- State-dependent icons, `show_state: auto` that only shows the state line for
  domains whose state carries a value, and a small placeholder syntax for
  `state_display`.

### Notes

- The accent colour sits on the icon and a hairline rather than on the button
  surface. A tinted surface turns muddy with a warm accent, and with most
  buttons active it dominates the card.
- Within a row, every button reserves room for the state line as soon as one of
  them uses it. Otherwise neighbouring icons and names sit at different heights,
  which is what makes a card look restless.
