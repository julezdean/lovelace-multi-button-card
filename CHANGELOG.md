# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
