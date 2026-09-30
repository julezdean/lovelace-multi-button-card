# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.9.0-beta.11] - 2026-09-30

### Changed

- `icon_size`, `icon_color` and `show_name` belong to the cell, as
  `label_size` already did: they apply to every item type, set in `item:`,
  a type's block or on the item. Each type's page in the editor has the
  sizes and the icon colour.
- The card's editor shows one **Item defaults** section instead of item and
  button defaults side by side. The arrangement of icon and text, which only
  buttons have, is there as *Icon and text (buttons)* and still stored
  under `button:`.

### Fixed

- The four seconds to confirm a hold ran from the moment it armed, while the
  finger was still down. Holding on used them up, and the tap that followed
  ran the tap action. They now start when the finger comes off - also when a
  touch screen ends the long press with a cancel rather than a release.

## [1.9.0-beta.10] - 2026-09-30

### Added

- `active_when`, for every item type: a template that decides when the item
  counts as active, instead of the type's own rule.
- `show_drawing`, for the progress types and the graph: `always`, `active`
  or a template. Without its drawing an item looks like a button, and its
  row does not move when the drawing comes and goes.

### Changed

- A tap confirms whatever armed an item. An item armed by a hold now shows
  `Tap to confirm`, and the tap runs the hold action; holding again only
  arms it anew. Before, only the gesture that armed it could confirm.

### Fixed

- Adding a visibility condition in the editor seemed to do nothing, though
  the condition reached the YAML. Home Assistant's conditions editor only
  shows what it is handed back, and the card never handed it back. This was
  there since the visibility editor was added in 1.4.0.

## [1.9.0-beta.9] - 2026-09-30

### Added

- `y_axis: secondary` on a graph's line gives it a scale of its own, with
  `lower_bound_secondary`, `upper_bound_secondary` and
  `min_bound_range_secondary`, as mini-graph-card has it. On one shared
  scale a humidity next to a temperature flattened the temperature to a
  straight line.

## [1.9.0-beta.8] - 2026-09-30

A sensor's history as an item type, modelled on mini-graph-card.

### Added

- `graph`: the last hours of a sensor, full-bleed along the bottom of the
  cell. `graph_layout: split` puts the text on top, as a horizontal button
  has it; `background` keeps a button's arrangement with the graph behind
  it, muted, and the text on a halo. `graph_height` sets the share of the
  cell, 50 % by default.
- The options of mini-graph-card that make sense in a cell: `hours_to_show`,
  `points_per_hour`, `aggregate_func` (with the same `delta` and `diff`),
  `line` or `bar`, `fill` (`fade` by default), `smoothing`, `line_width`,
  hard and soft (`~`) bounds, `min_bound_range`, `logarithmic`, `attribute`
  with dotted paths, `state_map`, `value_factor`, and thresholds as
  `colors.thresholds` or `color_thresholds`, blended or hard.
- More lines under `lines:`, coloured from the theme's palette unless given
  a colour.
- `label` for graphs knows `{{min}}`, `{{max}}` and `{{avg}}` of what is
  drawn, shown in the entity's own precision.
- The history comes from `history/stream`, as Home Assistant's own history
  graphs do: once, then live, and again after a reconnect - without a cache
  in the browser. The graph redraws when a bucket is full, not every second.
- A graph never counts as active, so a wall of temperatures does not light up.

## [1.9.0-beta.7] - 2026-09-30

Four new item types that draw a proportion - a timer running down, the time a
machine has left, a battery - in the same cell as a button.

### Added

- `ring`, `bar`, `segments` and `digits`. They read a `timer`, a timestamp, a
  sensor reporting the time left, a percentage, a number on a scale, an
  attribute or a `[[[ template ]]]`, and share every option but the drawing:
  `progress` (`window`, `start`, `end`, `min`, `max`, `direction`),
  `format`, `on_complete`, `colors` with thresholds or a gradient, `label`
  with `{{placeholders}}`, and `animation` with two more moments,
  `finishing` and `finished`. Adapted from the countdown and progress card
  `lovelace-advanced-countdown-card`.
- A sensor that reports the time left as a number (`23` min) counts down on
  its own between reports, in the sensor's own unit, and draws its proportion
  from `progress.window` - a span or an entity holding one.
- A running countdown ticks once a second on one clock shared by every card,
  at the millisecond its digits change, and only the item that ticks is
  redrawn. Nothing ticks while the tab is hidden or once a countdown is over.
- A row holding a ring or digits gives every cell the same room above the
  name, so names still line up across the row.
- The editor asks for the type under **+ Add item**, and an item's page can
  change it. What only the old type had is kept while the editor is open.
- Defaults blocks per type: `ring:`, `bar:`, `segments:`, `digits:`.
- Each cell carries `data-type`, for card_mod.

### Fixed

- `variables` in a template was always empty. The card's `variables:` block,
  which the README describes, never reached the templates.

## [1.9.0-beta.6] - 2026-09-30

The groundwork for other kinds of item than buttons. Nothing looks or behaves
differently: every screenshot renders pixel for pixel as in 1.8.0.

### Added

- `items:` is the name of the list now, and every entry can carry a `type`.
  An entry without one is a `button`, which is the only type so far. An entry
  with a type the card does not know shows as a dashed cell with the reason,
  instead of taking the card down.
- `item:` sets the cell every item sits in - corner radius, background,
  active background, accent colour, name size and press effect - for all
  items at once, whatever their type. `button:` and the item itself still
  override it.

### Changed

- The visual editor lists **Items** and adds them with **+ Add item**. It
  writes `items:` instead of `buttons:`, and moves cell options from
  `button:` to `item:` when it saves the card options.
- The card is now written in TypeScript and built into the single file Home
  Assistant loads. That file is no longer in the repository; each release
  carries it as an asset, which is where HACS takes it from. Manual installs
  download it from the release page.

### Deprecated

- `buttons:` is the older spelling of `items:`, and cell options under
  `button:` are the older place for `item:`. Both keep working.

## [1.8.0] - 2026-09-29

### Added

- Confirmation for every gesture, not just the tap. `tap_action`,
  `hold_action` and `double_tap_action` each take `confirmation: true` or
  `confirmation: { text }`, the key Home Assistant's own actions use. The
  button is confirmed by repeating the gesture that armed it, and the built-in
  prompt says which one (`Hold again to confirm`).
- The visual editor has a confirmation switch below each action instead of a
  single one under Display.

### Fixed

- `button`, `input_button`, `scene` and `event` entities were always drawn as
  active. Their state is the timestamp of the last press, which the card read
  as "doing something" from the first press on. They are now inactive and
  light up for one second when the timestamp changes - so a press shows,
  also one made from another device. The flash is timed on the tablet's own
  clock from when the change arrives, since a drifting wall-tablet clock
  would otherwise eat it. Returning from `unavailable` after a restart does
  not count as a press.
- A button that had never been pressed, state `unknown`, was drawn dimmed as
  unavailable although it works.

### Changed

- The button-level `confirmation` is now the older spelling of
  `tap_action.confirmation`. It keeps working and still covers the tap only;
  the editor moves it onto the tap action when the button is edited.

## [1.7.2] - 2026-09-22

### Fixed

- A `todo` button was always drawn as active. Whether a numeric state counts
  as "doing something" is decided from a list of domains, and `todo` was not
  on it - so an empty shopping list, state `0`, fell through to active. The
  button now lights up exactly while items are on the list. Same list, same
  effect for the second line: a `todo` button without a label now shows its
  state there, the way a counter does.

## [1.7.1] - 2026-09-22

### Fixed

- `mode: auto` did nothing once a column count had ever been set. A bare
  `columns: 3` is meant to be shorthand for grid mode, but the rule also
  applied on top of an explicit `mode: auto` - and the editor keeps `columns`
  in the configuration when you switch back to automatic. Switching to
  automatic therefore kept the grid, and which grid depended on the number
  left behind: five columns put a sixth button on its own row, six columns
  kept it in the first. The shorthand now applies only when no mode is given.
- The editor drops a column count when the mode is set to automatic, so the
  configuration no longer carries a number that has no effect.

## [1.7.0] - 2026-09-22

### Added

- `button.layout`, `vertical` or `horizontal`, deciding whether the icon sits
  above or beside the text. Settable per card and per button.

### Changed

- **The inner arrangement no longer switches by itself.** A button used to flip
  to icon-beside-text once it fell below 96px tall, which is why the same
  configuration looked different on two screens. The guess was usually wrong as
  well: beside a 26px icon a narrow button leaves the label a fraction of its
  width, where stacking gives it all of it. Horizontal earns its place on
  buttons that are wide *and* flat, and the card cannot tell those apart -
  the height it works from is derived from the width, so the two are never
  distinguishable, and reading the rendered height instead would feed the
  layout back into itself. The default is `vertical`; `auto` is still accepted
  and means the same.
- Names wrap onto a second line instead of being cut off. A clipped "Ha..."
  says less than a wrapped name, and hiding the name entirely is already
  available through `show_name: false`.

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
