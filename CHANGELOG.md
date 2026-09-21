# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
