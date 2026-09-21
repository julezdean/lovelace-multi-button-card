/**
 * Multi Button Card
 * A multi-button control card for Home Assistant, tuned for wall-mounted dashboards.
 *
 * Single file, no dependencies, no build step.
 *
 * Structure of this file:
 *   1. Constants
 *   2. Configuration        - normalisation, inheritance, validation
 *   3. State helpers        - active detection, icon/text resolution
 *   4. Layout engine        - column count, weighted row partitioning, cell height
 *   5. Animations           - condition evaluation
 *   6. Actions              - action dispatch and gesture recognition
 *   7. Styles               - the complete stylesheet
 *   8. Element              - MultiButtonCard
 *   9. Registration
 */

const CARD_VERSION = '1.0.1';

/**
 * The repository is prefixed, the card tag is not: the prefix groups the repo
 * among Lovelace cards, while `type: custom:...` is typed by every user and
 * stays as short as it can be. The CSS custom properties use a shorter prefix
 * again (--mbc-), which keeps the stylesheet readable.
 *
 * CARD_VERSION is duplicated in package.json because a single-file card has no
 * build step to inject it. test/version.test.js fails if the two drift apart.
 */
const CARD_TAG = 'multi-button-card';
const REPO_URL = 'https://github.com/julezdean/lovelace-multi-button-card';

/* -------------------------------------------------------------------------- */
/* 1. Constants                                                               */
/* -------------------------------------------------------------------------- */

/** States that count as "off" for visual feedback purposes. */
const INACTIVE_STATES = new Set([
  'off',
  'closed',
  'locked',
  'idle',
  'standby',
  'docked',
  'not_home',
  'disarmed',
  'unavailable',
  'unknown',
  'none',
  '',
]);

const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

/**
 * Domains whose state carries a *value* worth reading from across the room.
 * For pure on/off domains the colour already tells the story, so the extra
 * text line is noise - see resolveShowState().
 */
const VALUE_DOMAINS = new Set([
  'sensor',
  'binary_sensor',
  'number',
  'input_number',
  'climate',
  'water_heater',
  'humidifier',
  'cover',
  'media_player',
  'person',
  'device_tracker',
  'weather',
  'vacuum',
  'lock',
  'alarm_control_panel',
  'counter',
  'input_select',
  'select',
  'update',
  'timer',
]);

/**
 * Domains that need something other than homeassistant.toggle.
 * homeassistant.toggle only works where the domain implements turn_on/turn_off
 * or its own toggle - locks, buttons and scenes do not.
 */
const TOGGLE_OVERRIDES = {
  lock: (stateObj) => ['lock', stateObj && stateObj.state === 'locked' ? 'unlock' : 'lock'],
  cover: () => ['cover', 'toggle'],
  valve: () => ['valve', 'toggle'],
  scene: () => ['scene', 'turn_on'],
  script: () => ['script', 'turn_on'],
  button: () => ['button', 'press'],
  input_button: () => ['input_button', 'press'],
  vacuum: (stateObj) => ['vacuum', isActiveState(stateObj) ? 'return_to_base' : 'start'],
  alarm_control_panel: null, // no sensible toggle - handled as a warning
};

const VALID_ANIMATIONS = new Set([
  'none',
  'pulse',
  'bounce',
  'spin',
  'shake',
  'glow',
  'breathe',
  'blink',
  'wobble',
]);

const HOLD_DELAY_MS = 500;
const DOUBLE_TAP_WINDOW_MS = 250;
const CONFIRM_TIMEOUT_MS = 4000;

/* -------------------------------------------------------------------------- */
/* 2. Configuration                                                           */
/* -------------------------------------------------------------------------- */

const DEFAULT_LAYOUT = {
  mode: 'auto', // auto | grid | fixed
  columns: 'auto',
  rows: null,
  gap: 12,
  min_button_size: 88, // minimum cell height in px
  max_button_size: 170, // maximum cell height in px
  column_width: 172, // target column width the auto mode aims for
  max_columns: 6,
};

const DEFAULT_APPEARANCE = {
  background: null, // null -> HA card background
  radius: 24,
  padding: 14,
  shadow: true,
};

const DEFAULT_BUTTON = {
  radius: 18,
  background: null,
  active_background: null,
  color: null,
  active_color: null,
  icon_color: null,
  icon_size: null,
  label_size: null,
  show_name: true,
  show_state: 'auto',
  press_effect: 'scale', // scale | fade | none
};

const DEFAULT_ANIMATION = {
  enabled: true,
  type: 'none',
  duration: '2s',
  intensity: 1,
  when: 'active',
};

/**
 * Turn whatever the user wrote into a fully resolved object.
 * Everything downstream may assume defaults are already applied.
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('multi-button-card: invalid configuration');
  }
  if (!Array.isArray(raw.buttons) || raw.buttons.length === 0) {
    throw new Error('multi-button-card: "buttons" must be a non-empty list');
  }

  const layout = { ...DEFAULT_LAYOUT, ...(raw.layout || {}) };
  const appearance = { ...DEFAULT_APPEARANCE, ...(raw.appearance || {}) };
  const buttonDefaults = { ...DEFAULT_BUTTON, ...(raw.button || {}) };
  const animationDefaults = normalizeAnimation(raw.animation, DEFAULT_ANIMATION);

  // "columns: 3" at card level is a convenient shorthand for grid mode.
  if (layout.mode === 'auto' && typeof layout.columns === 'number') {
    layout.mode = 'grid';
  }

  const buttons = raw.buttons.map((button, index) =>
    normalizeButton(button, index, buttonDefaults, animationDefaults),
  );

  return {
    title: raw.title || null,
    layout,
    appearance,
    button: buttonDefaults,
    animation: animationDefaults,
    buttons,
  };
}

function normalizeButton(raw, index, buttonDefaults, animationDefaults) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const error = raw && typeof raw === 'object' ? null : 'Button configuration must be a mapping';

  const button = {
    index,
    error,
    entity: typeof src.entity === 'string' ? src.entity : null,
    name: src.name ?? null,
    label: src.label ?? null,
    icon: src.icon ?? null,
    // Per-button overrides fall back to the card-level button defaults.
    radius: src.radius ?? buttonDefaults.radius,
    background: src.background ?? buttonDefaults.background,
    active_background: src.active_background ?? buttonDefaults.active_background,
    color: src.color ?? buttonDefaults.color,
    active_color: src.active_color ?? src.color ?? buttonDefaults.active_color,
    icon_color: src.icon_color ?? buttonDefaults.icon_color,
    icon_size: src.icon_size ?? buttonDefaults.icon_size,
    label_size: src.label_size ?? buttonDefaults.label_size,
    press_effect: src.press_effect ?? buttonDefaults.press_effect,
    show_name: src.show_name ?? buttonDefaults.show_name,
    show_state: src.show_state ?? buttonDefaults.show_state,
    state_display: src.state_display ?? null,
    confirmation: src.confirmation ?? false,
    weight: resolveWeight(src),
    animation: normalizeAnimation(src.animation ?? src.icon_animation, animationDefaults),
    tap_action: normalizeAction(src.tap_action ?? src.action, src.entity, 'default'),
    hold_action: normalizeAction(src.hold_action, src.entity, 'more-info'),
    double_tap_action: normalizeAction(src.double_tap_action, src.entity, 'none'),
  };

  // A button without any explicit tap action but with an entity toggles it;
  // without an entity it does nothing rather than throwing.
  if (button.tap_action.action === 'default') {
    button.tap_action = button.entity
      ? { action: 'toggle', entity: button.entity }
      : { action: 'none' };
  }
  if (button.hold_action.action === 'more-info' && !button.hold_action.entity && !button.entity) {
    button.hold_action = { action: 'none' };
  }

  return button;
}

/** `colspan: 2` and `size: large` are two spellings of the same idea. */
function resolveWeight(src) {
  if (Number.isFinite(src.colspan)) return Math.max(1, Math.min(6, Math.round(src.colspan)));
  if (src.size === 'large') return 2;
  if (src.size === 'wide') return 2;
  if (src.size === 'full') return 99; // clamped against the column count later
  return 1;
}

/**
 * Animation config accepts a bare string (`animation: pulse`) or a mapping.
 * `state:` and `when:` are aliases - both spellings appear in the wild.
 */
function normalizeAnimation(raw, fallback) {
  const base = { ...fallback };
  if (raw === undefined || raw === null) return base;

  if (typeof raw === 'string') {
    return { ...base, type: raw, enabled: raw !== 'none' };
  }
  if (typeof raw !== 'object') return base;

  const merged = { ...base };
  if (raw.enabled !== undefined) merged.enabled = !!raw.enabled;
  if (raw.type !== undefined) merged.type = String(raw.type);
  if (raw.duration !== undefined) merged.duration = normalizeDuration(raw.duration);
  if (raw.intensity !== undefined) {
    const value = Number(raw.intensity);
    merged.intensity = Number.isFinite(value) ? Math.max(0, Math.min(3, value)) : 1;
  }
  // when / state / above / below all describe the same condition object.
  if (raw.when !== undefined) merged.when = raw.when;
  else if (raw.state !== undefined) merged.when = raw.state;
  if (raw.above !== undefined || raw.below !== undefined) {
    merged.when = { above: raw.above, below: raw.below };
  }

  if (!VALID_ANIMATIONS.has(merged.type)) merged.type = 'none';
  return merged;
}

function normalizeDuration(value) {
  if (typeof value === 'number') return `${value}s`;
  const text = String(value).trim();
  return /^[\d.]+$/.test(text) ? `${text}s` : text;
}

/**
 * Bring every action spelling onto one shape.
 * Supported: toggle, more-info, call-service / perform-action, navigate, url,
 * assist, none - plus the bare `{ service, target }` shorthand.
 */
function normalizeAction(raw, entityFallback, fallbackAction) {
  if (raw === undefined || raw === null) {
    return { action: fallbackAction, entity: entityFallback || undefined };
  }
  if (typeof raw === 'string') {
    return { action: raw, entity: entityFallback || undefined };
  }
  if (typeof raw !== 'object') {
    return { action: 'none' };
  }

  const action = { ...raw };

  // Shorthand: no `action:` key, but a service was given.
  if (!action.action) {
    if (action.service || action.perform_action) action.action = 'call-service';
    else if (action.navigation_path) action.action = 'navigate';
    else if (action.url_path || action.url) action.action = 'url';
    else action.action = fallbackAction;
  }

  // HA renamed call-service to perform-action; accept both, store one.
  if (action.action === 'perform-action') action.action = 'call-service';
  if (!action.service && action.perform_action) action.service = action.perform_action;

  if (!action.entity && entityFallback) action.entity = entityFallback;
  return action;
}

/* -------------------------------------------------------------------------- */
/* 3. State helpers                                                           */
/* -------------------------------------------------------------------------- */

function domainOf(entityId) {
  return typeof entityId === 'string' ? entityId.split('.')[0] : '';
}

function isUnavailable(stateObj) {
  return !stateObj || UNAVAILABLE_STATES.has(stateObj.state);
}

/** HA's notion of "this thing is doing something right now". */
function isActiveState(stateObj) {
  if (!stateObj) return false;
  const state = String(stateObj.state).toLowerCase();
  if (UNAVAILABLE_STATES.has(state)) return false;
  if (INACTIVE_STATES.has(state)) return false;
  // Numeric entities: any non-zero value counts as active.
  if (VALUE_DOMAINS.has(domainOf(stateObj.entity_id)) && !Number.isNaN(Number(state))) {
    return Number(state) !== 0;
  }
  return true;
}

/**
 * Icon resolution, in order:
 *   1. explicit string
 *   2. state map: { on: ..., off: ..., default: ... }
 *   3. entity icon / device class icon supplied by HA
 *   4. null -> caller renders <ha-state-icon> or a neutral fallback
 */
function resolveIcon(button, stateObj) {
  const icon = button.icon;
  if (typeof icon === 'string') return icon;

  if (icon && typeof icon === 'object') {
    const state = stateObj ? String(stateObj.state) : 'unknown';
    if (icon[state] !== undefined) return icon[state];
    // YAML turns bare on/off into booleans, so check those too.
    if (state === 'on' && icon.true !== undefined) return icon.true;
    if (state === 'off' && icon.false !== undefined) return icon.false;
    if (icon.default !== undefined) return icon.default;
    return null;
  }

  if (stateObj && stateObj.attributes && stateObj.attributes.icon) {
    return stateObj.attributes.icon;
  }
  return null;
}

function resolveName(button, stateObj) {
  if (button.name === false) return '';
  if (button.name) return String(button.name);
  if (stateObj && stateObj.attributes && stateObj.attributes.friendly_name) {
    return stateObj.attributes.friendly_name;
  }
  if (button.entity) return button.entity.split('.').slice(1).join('.');
  return '';
}

/**
 * Decide whether the secondary line is worth its space.
 * 'auto' -> only for domains whose state is a value, not a lamp switch.
 */
function resolveShowState(button, stateObj) {
  if (button.show_state === true) return true;
  if (button.show_state === false) return false;
  if (button.label) return true;
  if (!button.entity || !stateObj) return false;
  return VALUE_DOMAINS.has(domainOf(button.entity));
}

/** Prefer HA's own localisation; fall back to raw state plus unit. */
function formatState(hass, stateObj) {
  if (!stateObj) return '';
  try {
    if (typeof hass.formatEntityState === 'function') {
      return hass.formatEntityState(stateObj);
    }
  } catch (err) {
    /* fall through to the manual path */
  }
  const unit = stateObj.attributes && stateObj.attributes.unit_of_measurement;
  return unit ? `${stateObj.state} ${unit}` : String(stateObj.state);
}

/** `state_display: "{{state}} in {{name}}"` - deliberately tiny, no Jinja. */
function applyStateTemplate(template, hass, stateObj, name) {
  const state = stateObj ? String(stateObj.state) : '';
  const formatted = formatState(hass, stateObj);
  const attributes = (stateObj && stateObj.attributes) || {};
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    if (key === 'state') return formatted;
    if (key === 'raw_state') return state;
    if (key === 'name') return name;
    if (key.startsWith('attributes.')) {
      const value = attributes[key.slice('attributes.'.length)];
      return value === undefined ? '' : String(value);
    }
    const value = attributes[key];
    return value === undefined ? '' : String(value);
  });
}

/* -------------------------------------------------------------------------- */
/* 4. Layout engine                                                           */
/* -------------------------------------------------------------------------- */

/**
 * How many columns fit, given the measured width.
 * The result is clamped by the total weight so three buttons never spread
 * across six columns just because the screen is wide.
 */
function computeColumns(config, totalWeight, width) {
  const { layout } = config;
  const hardMax = Math.max(1, Math.min(layout.max_columns, totalWeight));

  if (layout.mode === 'grid' || layout.mode === 'fixed') {
    const requested = Number(layout.columns);
    if (Number.isFinite(requested) && requested > 0) {
      return Math.max(1, Math.round(requested));
    }
  }

  if (!width || width <= 0) return Math.min(2, hardMax);

  const target = Math.max(80, Number(layout.column_width) || DEFAULT_LAYOUT.column_width);
  const gap = Number(layout.gap) || 0;
  // Solve width = cols * target + (cols - 1) * gap for cols.
  const raw = (width + gap) / (target + gap);
  return Math.max(1, Math.min(hardMax, Math.round(raw)));
}

/**
 * Split the buttons into rows so that every row is as full as the others.
 *
 * Weights (from colspan) participate directly: a weight-2 button occupies two
 * slots in its row and gets flex-grow 2, so one mechanism covers both the
 * balancing and the spanning.
 *
 * 3 buttons / 2 columns -> [[0,1],[2]]            (the last one spans the row)
 * 5 buttons / 2 columns -> [[0,1],[2,3],[4]]
 * 7 buttons / 3 columns -> [[0,1,2],[3,4],[5,6]]   (never [3,3,1])
 */
function partitionRows(weights, columns) {
  const total = weights.reduce((sum, weight) => sum + Math.min(weight, columns), 0);
  const rowCount = Math.max(1, Math.ceil(total / columns));

  const rows = [];
  let index = 0;
  let remainingWeight = total;
  let remainingRows = rowCount;

  while (index < weights.length && remainingRows > 0) {
    // Front-heavy: ceil() puts the extra slot in the earlier rows.
    const capacity = Math.max(1, Math.min(columns, Math.ceil(remainingWeight / remainingRows)));
    const row = [];
    let used = 0;

    while (index < weights.length) {
      const weight = Math.min(weights[index], columns);
      if (row.length > 0 && used + weight > capacity) break;
      row.push(index);
      used += weight;
      index += 1;
      if (used >= capacity) break;
    }

    rows.push(row);
    remainingWeight -= used;
    remainingRows -= 1;
  }

  // Safety net: anything left over (possible only with odd weight mixes)
  // becomes its own rows rather than overflowing the last one.
  while (index < weights.length) {
    const row = [];
    let used = 0;
    while (index < weights.length) {
      const weight = Math.min(weights[index], columns);
      if (row.length > 0 && used + weight > columns) break;
      row.push(index);
      used += weight;
      index += 1;
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Cell height from column width: square-ish, but clamped at both ends so a
 * single button does not become a giant tile and twelve buttons stay tappable.
 */
function computeCellHeight(config, columns, width) {
  const { layout } = config;
  const gap = Number(layout.gap) || 0;
  const columnWidth = width > 0 ? (width - gap * (columns - 1)) / columns : 160;
  const min = Number(layout.min_button_size) || DEFAULT_LAYOUT.min_button_size;
  const max = Number(layout.max_button_size) || DEFAULT_LAYOUT.max_button_size;
  return Math.round(Math.max(min, Math.min(max, columnWidth / 1.25)));
}

/**
 * Home Assistant's sections view lays cards out on a grid of fixed rows, so a
 * card has to say how many rows it needs. These two numbers come from HA's own
 * grid (2024.11+) and are the one place here that depends on HA internals -
 * if they ever change, the card is merely sized generously or tightly, never
 * broken.
 */
const HA_GRID_ROW_HEIGHT = 56;
const HA_GRID_ROW_GAP = 8;

/**
 * The width of a full-width section column, used only to guess a sensible row
 * count before the card has ever been measured. Being wrong here costs some
 * slack above or below, not a broken layout: the host takes whatever height
 * the cell gives it and the rows flex into it.
 */
const HA_SECTION_WIDTH = 480;

/** Height in px that the card needs for `count` buttons at a given width. */
function computeContentHeight(config, width) {
  const padding = toNumber(config.appearance.padding, 14);
  const gap = toNumber(config.layout.gap, 12);
  const innerWidth = Math.max(0, width - padding * 2 - 2);

  const weights = config.buttons.map((button) => button.weight);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const columns = computeColumns(config, totalWeight, innerWidth);
  const rows = partitionRows(weights, columns).length;
  const cellHeight = computeCellHeight(config, columns, innerWidth);

  const title = config.title ? 33 : 0; // font-size 15 * 1.2 + margins
  return rows * cellHeight + (rows - 1) * gap + padding * 2 + 2 + title;
}

/** Translate a pixel height into whole sections-grid rows. */
function pixelsToGridRows(height) {
  return Math.max(1, Math.ceil((height + HA_GRID_ROW_GAP) / (HA_GRID_ROW_HEIGHT + HA_GRID_ROW_GAP)));
}

/**
 * A button card wants room, so it asks for the full width of the section and
 * for as many rows as its buttons actually need. The previous version guessed
 * `rows * 2`, which gave two buttons 120px for the 200px they want - the card
 * then overflowed its cell.
 */
function computeGridOptions(config) {
  const needed = computeContentHeight(config, HA_SECTION_WIDTH);
  // The floor uses min_button_size: below that the buttons stop being tappable,
  // so the user should not be able to drag the card smaller than that either.
  const floorConfig = {
    ...config,
    layout: { ...config.layout, max_button_size: config.layout.min_button_size },
  };
  const minimum = computeContentHeight(floorConfig, HA_SECTION_WIDTH);

  return {
    columns: 12,
    rows: pixelsToGridRows(needed),
    min_rows: pixelsToGridRows(minimum),
  };
}

/* -------------------------------------------------------------------------- */
/* 5. Animations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Does the animation condition hold right now?
 *
 * when: "always"            -> always
 * when: "active"            -> HA's active semantics (default)
 * when: "on" / 42 / "heat"  -> exact state match
 * when: ["on", "heat"]      -> any of
 * when: { above: 30 }       -> numeric comparison
 * when: { state: "on" }     -> same as the bare string
 */
function animationActive(animation, stateObj) {
  if (!animation || !animation.enabled || animation.type === 'none') return false;

  const condition = animation.when;
  if (condition === undefined || condition === null) return true;
  if (condition === 'always' || condition === true) return true;
  if (condition === 'never' || condition === false) return false;
  if (condition === 'active') return isActiveState(stateObj);
  if (condition === 'inactive') return !!stateObj && !isActiveState(stateObj);
  if (condition === 'unavailable') return isUnavailable(stateObj);

  if (!stateObj) return false;
  const state = String(stateObj.state);

  if (Array.isArray(condition)) {
    return condition.some((value) => String(value) === state);
  }

  if (typeof condition === 'object') {
    if (condition.state !== undefined) return String(condition.state) === state;
    const numeric = Number(state);
    if (Number.isNaN(numeric)) return false;
    if (condition.above !== undefined && !(numeric > Number(condition.above))) return false;
    if (condition.below !== undefined && !(numeric < Number(condition.below))) return false;
    return condition.above !== undefined || condition.below !== undefined;
  }

  // YAML unquoted `on:` arrives as boolean true - already handled above,
  // but `state: on` inside a mapping may arrive as the string "true".
  if (condition === 'true') return state === 'on';
  if (condition === 'false') return state === 'off';

  return String(condition) === state;
}

/* -------------------------------------------------------------------------- */
/* 6. Actions                                                                 */
/* -------------------------------------------------------------------------- */

function fireEvent(node, type, detail = {}) {
  const event = new Event(type, { bubbles: true, cancelable: false, composed: true });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
}

/**
 * Execute one action. Every branch is defensive: a broken action must not take
 * the rest of the card down with it.
 */
function performAction(hass, action, sourceNode) {
  if (!action || action.action === 'none') return;
  if (!hass) return;

  try {
    switch (action.action) {
      case 'more-info': {
        const entityId = action.entity || action.entity_id;
        if (entityId) fireEvent(sourceNode, 'hass-more-info', { entityId });
        break;
      }

      case 'toggle': {
        const entityId = action.entity || action.entity_id;
        if (!entityId) break;
        const domain = domainOf(entityId);

        if (domain in TOGGLE_OVERRIDES) {
          const override = TOGGLE_OVERRIDES[domain];
          if (!override) {
            console.warn(`${CARD_TAG}: "${domain}" cannot be toggled - use call-service instead`);
            break;
          }
          const [serviceDomain, service] = override(hass.states[entityId]);
          hass.callService(serviceDomain, service, { entity_id: entityId });
          break;
        }

        hass.callService('homeassistant', 'toggle', { entity_id: entityId });
        break;
      }

      case 'call-service': {
        const service = action.service || action.perform_action;
        if (!service || !service.includes('.')) {
          console.warn(`${CARD_TAG}: call-service without a valid "service"`, action);
          break;
        }
        const [domain, name] = service.split('.', 2);
        const data = { ...(action.data || action.service_data || {}) };
        const target = action.target || undefined;
        hass.callService(domain, name, data, target);
        break;
      }

      case 'navigate': {
        const path = action.navigation_path;
        if (!path) break;
        if (/^https?:\/\//.test(path)) {
          window.location.href = path;
          break;
        }
        window.history.pushState(null, '', path);
        fireEvent(window, 'location-changed', { replace: false });
        break;
      }

      case 'url': {
        const url = action.url_path || action.url;
        if (url) window.open(url, action.new_tab === false ? '_self' : '_blank');
        break;
      }

      case 'assist': {
        fireEvent(sourceNode, 'show-dialog', {
          dialogTag: 'ha-voice-command-dialog',
          dialogImport: () => Promise.resolve(),
          dialogParams: { pipeline_id: action.pipeline_id, start_listening: !!action.start_listening },
        });
        break;
      }

      case 'fire-dom-event': {
        fireEvent(sourceNode, 'll-custom', action);
        break;
      }

      default:
        console.warn(`${CARD_TAG}: unknown action "${action.action}"`);
    }
  } catch (err) {
    console.error(`${CARD_TAG}: action failed`, action, err);
  }
}

/** Short haptic cue - HA listens for this globally on supported devices. */
function haptic(node, type = 'light') {
  fireEvent(node, 'haptic', type);
}

/* -------------------------------------------------------------------------- */
/* 7. Styles                                                                  */
/* -------------------------------------------------------------------------- */

const STYLES = `
:host {
  display: block;
  /* The host must take the height it is given, or it silently falls back to
     its content height: in a sections grid cell that makes the card overflow
     a short cell and leave a gap in a tall one. With no constraint from the
     parent -- masonry, a panel -- 100% resolves to auto and nothing changes. */
  height: 100%;

  /* Surfaces - all derived from HA theme variables so themes keep working. */
  --mbc-card-bg: var(--ha-card-background, var(--card-background-color, #1c1c1e));
  /* Each pair: a plain rgba fallback first, then the color-mix refinement.
     Wall tablets often run old webviews, where the second line is dropped. */
  --mbc-btn-bg: rgba(255, 255, 255, 0.06);
  --mbc-btn-bg: color-mix(in srgb, var(--primary-text-color, #fff) 6%, transparent);
  --mbc-btn-bg-hover: rgba(255, 255, 255, 0.1);
  --mbc-btn-bg-hover: color-mix(in srgb, var(--primary-text-color, #fff) 10%, transparent);
  --mbc-btn-border: rgba(255, 255, 255, 0.09);
  --mbc-btn-border: color-mix(in srgb, var(--primary-text-color, #fff) 9%, transparent);

  /* Accent - one colour, used sparingly. The tint stays low on purpose: with
     most buttons active the card must not turn into a block of colour. The
     icon carries the state; the surface only hints at it. */
  --mbc-accent: var(--state-active-color, var(--primary-color, #4a9eff));
  /* The active surface stays almost neutral - a tinted surface turns muddy
     once the accent is warm, and with many buttons on it dominates the card.
     Colour lives on the icon and the hairline, which is where it informs. */
  --mbc-accent-soft: rgba(255, 255, 255, 0.14);
  --mbc-accent-soft: color-mix(in srgb, var(--primary-text-color, #fff) 14%, transparent);
  --mbc-accent-line: rgba(255, 255, 255, 0.22);
  --mbc-accent-line: color-mix(in srgb, var(--mbc-accent) 30%, transparent);

  --mbc-text: var(--primary-text-color, #f5f5f7);
  --mbc-text-dim: var(--secondary-text-color, #a1a1a6);
  --mbc-warn: var(--error-color, #ff5f56);

  /* Written by the layout engine. */
  --mbc-gap: 12px;
  --mbc-cell-h: 120px;
  --mbc-radius: 24px;
  --mbc-btn-radius: 18px;
  --mbc-icon-size: 30px;
  --mbc-label-size: 14px;
  --mbc-anim-i: 1;
  --mbc-anim-d: 2s;
}

.card {
  box-sizing: border-box;
  background: var(--mbc-card-bg);
  border-radius: var(--mbc-radius);
  padding: var(--mbc-pad, 14px);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* A single hairline instead of a heavy border - reads as glass, not as a box. */
  border: 1px solid color-mix(in srgb, var(--mbc-text) 7%, transparent);
}
.card.with-shadow {
  box-shadow: var(--ha-card-box-shadow, 0 2px 16px rgba(0, 0, 0, 0.22));
}

.title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--mbc-text);
  margin: 2px 4px 12px;
  flex: 0 0 auto;
}

/* --- Layout ------------------------------------------------------------- */

.grid {
  display: flex;
  flex-direction: column;
  gap: var(--mbc-gap);
  height: 100%;          /* resolves to auto in an unconstrained parent */
  justify-content: center;
  min-height: 0;
}

.row {
  display: flex;
  flex-direction: row;
  gap: var(--mbc-gap);
  /* Basis is the height the width suggests; the row may grow into a taller
     cell and shrink into a shorter one, but never below the touch-target
     floor. Pinning min-height to the cell height instead made the card unable
     to render at the size its own min_rows advertises. */
  flex: 1 1 var(--mbc-cell-h);
  min-height: var(--mbc-row-min, 88px);
  /* Cap the growth so a very tall container does not stretch buttons into slabs. */
  max-height: calc(var(--mbc-cell-h) * 1.45);
}

/* --- Button ------------------------------------------------------------- */

.btn {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 12px;

  box-sizing: border-box;
  border: 1px solid var(--mbc-btn-border);
  border-radius: var(--mbc-btn-radius);
  background: var(--mbc-btn-bg);
  color: var(--mbc-text);

  font-family: inherit;
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  user-select: none;

  transition:
    background-color 180ms cubic-bezier(0.2, 0, 0.2, 1),
    border-color 180ms cubic-bezier(0.2, 0, 0.2, 1),
    transform 120ms cubic-bezier(0.2, 0, 0.2, 1),
    box-shadow 220ms cubic-bezier(0.2, 0, 0.2, 1);
}

.btn:focus-visible {
  outline: 2px solid var(--mbc-accent);
  outline-offset: 2px;
}

/* Pointer devices only - the wall tablet must not depend on hover. */
@media (hover: hover) {
  .btn:hover { background: var(--mbc-btn-bg-hover); }
}

/* Press feedback: fast in, slightly slower out. */
.btn.pressed { transition-duration: 70ms; }
.btn.pressed.effect-scale { transform: scale(0.968); }
.btn.pressed.effect-fade { filter: brightness(1.18); }

/* Active state: tinted surface, accent hairline, a whisper of glow. */
.btn.active {
  background: var(--mbc-btn-active-bg, var(--mbc-accent-soft));
  border-color: var(--mbc-accent-line);
}
.btn.active .icon { color: var(--mbc-accent); }
.btn.active .name { color: var(--mbc-text); }

.btn.unavailable {
  opacity: 0.42;
  cursor: default;
}
.btn.invalid {
  border-style: dashed;
  border-color: color-mix(in srgb, var(--mbc-warn) 55%, transparent);
}
.btn.invalid .icon { color: var(--mbc-warn); }

/* Two-step confirmation: the armed state must be unmistakable. */
.btn.armed {
  border-color: var(--mbc-warn);
  background: color-mix(in srgb, var(--mbc-warn) 14%, transparent);
}
.btn.armed .icon { color: var(--mbc-warn); }

/* --- Button contents ---------------------------------------------------- */

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

.labels {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
  width: 100%;
}

.name {
  font-size: var(--mbc-label-size);
  font-weight: 550;
  line-height: 1.2;
  letter-spacing: 0.005em;
  color: var(--mbc-text);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* When any button in a row shows a state line, every button in THAT row
   reserves the space for it - otherwise icons and names of neighbouring
   buttons sit at different heights and the row reads as ragged. Rows without
   a state line stay vertically centred, so nothing is padded for nothing. */
.row.reserve-state .state {
  display: block !important;
  min-height: 1.2em;
}

.state {
  font-size: calc(var(--mbc-label-size) - 2px);
  line-height: 1.2;
  color: var(--mbc-text-dim);
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  .btn { transition-duration: 1ms; }
  .btn.pressed.effect-scale { transform: none; filter: brightness(1.2); }
}

/* --- Error card --------------------------------------------------------- */

.error {
  box-sizing: border-box;
  background: var(--mbc-card-bg);
  border: 1px solid var(--mbc-warn);
  border-radius: var(--mbc-radius);
  padding: 16px;
  color: var(--mbc-text);
  font-size: 14px;
  line-height: 1.5;
}
.error code { color: var(--mbc-warn); }
`;

/* -------------------------------------------------------------------------- */
/* 8. Element                                                                 */
/* -------------------------------------------------------------------------- */

/* Importable outside a browser (for tests) without dragging in a DOM shim. */
const BaseElement = typeof HTMLElement !== 'undefined' ? HTMLElement : class {};

class MultiButtonCard extends BaseElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    this._hass = null;
    this._config = null;
    this._configError = null;

    /** @type {Array<{root:HTMLElement,icon:HTMLElement,name:HTMLElement,state:HTMLElement}>} */
    this._cells = [];
    /** Per-button render signature; a hass update that changes nothing writes nothing. */
    this._signatures = [];

    this._gridEl = null;
    this._cardEl = null;
    this._rowEls = null;
    this._rowGroups = null;

    this._lastWidth = 0;
    this._lastColumns = 0;
    this._lastCellHeight = 0;
    this._resizeObserver = null;

    this._gestures = new Map();
    this._armedIndex = -1;
    this._armedTimer = null;
  }

  /* --- Lovelace contract ------------------------------------------------ */

  static getStubConfig() {
    return {
      type: `custom:${CARD_TAG}`,
      buttons: [
        { name: 'Button 1', icon: 'mdi:lightbulb', tap_action: { action: 'none' } },
        { name: 'Button 2', icon: 'mdi:power', tap_action: { action: 'none' } },
      ],
    };
  }

  setConfig(config) {
    try {
      this._config = normalizeConfig(config);
      this._configError = null;
    } catch (err) {
      this._config = null;
      this._configError = err.message || String(err);
    }

    this._signatures = [];
    this._lastWidth = 0;
    this._lastColumns = 0;
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    this._sync();
  }

  get hass() {
    return this._hass;
  }

  /** Height in Lovelace's 50px units - used by the masonry view. */
  getCardSize() {
    if (!this._config) return 1;
    const width = this._lastWidth || HA_SECTION_WIDTH;
    return Math.max(1, Math.ceil(computeContentHeight(this._config, width) / 50));
  }

  /**
   * Sections view: how much of the grid the card asks for. HA calls
   * getGridOptions on recent versions and getLayoutOptions before that, so
   * both are provided from the same calculation.
   */
  getGridOptions() {
    if (!this._config) return { columns: 12, rows: 3, min_rows: 2 };
    return computeGridOptions(this._config);
  }

  getLayoutOptions() {
    const { columns, rows, min_rows: minRows } = this.getGridOptions();
    return { grid_columns: columns, grid_rows: rows, grid_min_rows: minRows };
  }

  /* --- Lifecycle -------------------------------------------------------- */

  connectedCallback() {
    if (!this._resizeObserver && typeof ResizeObserver !== 'undefined') {
      // Width only. Observing height would feed the layout back into itself.
      this._resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0] ? entries[0].contentRect.width : 0;
        this._onWidth(width);
      });
    }
    if (this._resizeObserver) this._resizeObserver.observe(this);
    // First measurement before the observer's initial callback arrives.
    this._onWidth(this.clientWidth);
  }

  disconnectedCallback() {
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._clearArmed();
    this._gestures.forEach((gesture) => this._cancelGesture(gesture));
    this._gestures.clear();
  }

  /* --- Build ------------------------------------------------------------ */

  _build() {
    const root = this.shadowRoot;
    root.textContent = '';
    this._cells = [];
    this._gridEl = null;
    this._cardEl = null;

    const style = document.createElement('style');
    style.textContent = STYLES;
    root.appendChild(style);

    if (this._configError) {
      const error = document.createElement('div');
      error.className = 'error';
      error.innerHTML = `<b>Multi Button Card</b><br>${escapeHtml(this._configError)}`;
      root.appendChild(error);
      return;
    }
    if (!this._config) return;

    const { appearance, layout } = this._config;

    const card = document.createElement('div');
    card.className = 'card' + (appearance.shadow ? ' with-shadow' : '');
    if (appearance.background) card.style.setProperty('--mbc-card-bg', appearance.background);
    card.style.setProperty('--mbc-radius', cssLength(appearance.radius, '24px'));
    card.style.setProperty('--mbc-pad', cssLength(appearance.padding, '14px'));
    card.style.setProperty('--mbc-gap', cssLength(layout.gap, '12px'));
    this._cardEl = card;

    if (this._config.title) {
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = this._config.title;
      card.appendChild(title);
    }

    const grid = document.createElement('div');
    grid.className = 'grid';
    this._gridEl = grid;
    card.appendChild(grid);
    root.appendChild(card);

    this._config.buttons.forEach((button, index) => {
      this._cells.push(this._buildButton(button, index));
    });

    this._lastColumns = 0; // force a layout pass
    this._applyLayout(this._lastWidth || this.clientWidth);
    this._sync(true);
  }

  _buildButton(button, index) {
    const el = document.createElement('button');
    el.className = 'btn';
    el.type = 'button';
    el.dataset.index = String(index);
    el.setAttribute('role', 'button');

    if (button.press_effect && button.press_effect !== 'none') {
      el.classList.add(`effect-${button.press_effect}`);
    }
    el.style.setProperty('--mbc-btn-radius', cssLength(button.radius, '18px'));
    if (button.background) el.style.background = button.background;
    if (button.active_background) el.style.setProperty('--mbc-btn-active-bg', button.active_background);
    if (button.active_color) el.style.setProperty('--mbc-accent', button.active_color);
    if (button.icon_color) el.style.setProperty('--mbc-icon-color', button.icon_color);
    if (button.icon_size) el.style.setProperty('--mbc-icon-size', cssLength(button.icon_size, '30px'));
    if (button.label_size) el.style.setProperty('--mbc-label-size', cssLength(button.label_size, '14px'));

    const icon = document.createElement('ha-icon');
    icon.className = 'icon';

    const labels = document.createElement('div');
    labels.className = 'labels';
    const name = document.createElement('div');
    name.className = 'name';
    const state = document.createElement('div');
    state.className = 'state';
    labels.append(name, state);

    el.append(icon, labels);
    this._gridEl.appendChild(el); // the layout pass moves it into a row
    this._bindGestures(el, index);

    return { root: el, icon, name, state, iconTag: 'ha-icon' };
  }

  /* --- Layout ----------------------------------------------------------- */

  _onWidth(width) {
    if (!this._config || !this._gridEl) return;
    // Sub-pixel churn must not trigger work.
    if (Math.abs(width - this._lastWidth) < 1) return;
    this._lastWidth = width;
    this._applyLayout(width);
  }

  _applyLayout(outerWidth) {
    if (!this._config || !this._gridEl) return;

    const { layout, appearance } = this._config;
    const padding = toNumber(appearance.padding, 14);
    const innerWidth = Math.max(0, (outerWidth || 0) - padding * 2 - 2);

    const weights = this._config.buttons.map((button) => button.weight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const columns = computeColumns(this._config, totalWeight, innerWidth);
    const cellHeight = computeCellHeight(this._config, columns, innerWidth);

    // Nothing changed -> no DOM writes at all.
    if (columns === this._lastColumns && cellHeight === this._lastCellHeight) return;
    this._lastColumns = columns;
    this._lastCellHeight = cellHeight;

    const rows = partitionRows(weights, columns);

    this._gridEl.style.setProperty('--mbc-cell-h', `${cellHeight}px`);
    this._gridEl.style.setProperty(
      '--mbc-row-min',
      `${toNumber(layout.min_button_size, DEFAULT_LAYOUT.min_button_size)}px`,
    );
    // Icon and label scale with the cell, within sane bounds.
    this._gridEl.style.setProperty('--mbc-icon-size', `${clamp(Math.round(cellHeight * 0.3), 24, 44)}px`);
    this._gridEl.style.setProperty('--mbc-label-size', `${clamp(Math.round(cellHeight * 0.115), 12, 17)}px`);

    // Rebuild the row containers and re-home the (already existing) buttons.
    const rowElements = [];
    this._rowGroups = rows;
    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      row.forEach((buttonIndex) => {
        const cell = this._cells[buttonIndex];
        if (!cell) return;
        const weight = Math.min(weights[buttonIndex], columns);
        cell.root.style.flexGrow = String(weight);
        rowEl.appendChild(cell.root);
      });
      rowElements.push(rowEl);
    });
    this._gridEl.replaceChildren(...rowElements);
    this._rowEls = rowElements;
    this._updateStateReservation();

    // Cell geometry decides the inner arrangement - deterministic, so no jitter.
    const columnWidth = columns > 0 ? innerWidth / columns : innerWidth;
    const compact = cellHeight < 96;
    const iconOnly = columnWidth < 74;
    this._cells.forEach((cell) => {
      cell.root.classList.toggle('compact', compact);
      cell.root.classList.toggle('icon-only', iconOnly);
    });
  }

  /* --- State sync ------------------------------------------------------- */

  _sync(force = false) {
    if (!this._config || !this._hass || this._cells.length === 0) return;

    this._config.buttons.forEach((button, index) => {
      const cell = this._cells[index];
      if (!cell) return;

      const stateObj = button.entity ? this._hass.states[button.entity] : undefined;
      const missing = !!button.entity && !stateObj;
      const unavailable = !!button.entity && isUnavailable(stateObj);
      const active = isActiveState(stateObj);
      const icon = resolveIcon(button, stateObj);
      const name = resolveName(button, stateObj);

      let secondary = '';
      if (resolveShowState(button, stateObj)) {
        if (button.state_display) {
          secondary = applyStateTemplate(button.state_display, this._hass, stateObj, name);
        } else if (button.label) {
          secondary = String(button.label);
        } else {
          secondary = formatState(this._hass, stateObj);
        }
      } else if (button.label) {
        secondary = String(button.label);
      }

      const animate = animationActive(button.animation, stateObj);
      const signature = [
        icon || '',
        name,
        secondary,
        active ? 1 : 0,
        unavailable ? 1 : 0,
        missing ? 1 : 0,
        animate ? button.animation.type : '',
      ].join('');

      if (!force && this._signatures[index] === signature) return;
      this._signatures[index] = signature;

      this._renderCell(cell, button, {
        icon,
        name,
        secondary,
        active,
        unavailable,
        missing,
        animate,
        stateObj,
      });
    });

    this._updateStateReservation();
  }

  /** A row reserves room for the state line as soon as one of its buttons uses it. */
  _updateStateReservation() {
    if (!this._rowEls || !this._rowGroups) return;
    this._rowGroups.forEach((group, rowIndex) => {
      const rowEl = this._rowEls[rowIndex];
      if (!rowEl) return;
      const needed = group.some((buttonIndex) => {
        const cell = this._cells[buttonIndex];
        return cell && cell.state.textContent;
      });
      rowEl.classList.toggle('reserve-state', needed);
    });
  }

  _renderCell(cell, button, data) {
    const { root } = cell;

    root.classList.toggle('active', data.active);
    root.classList.toggle('unavailable', data.unavailable && !data.missing);
    root.classList.toggle('invalid', data.missing || !!button.error);

    // Icon: explicit icon wins; otherwise let HA pick the domain icon.
    this._renderIcon(cell, button, data);

    const showName = button.show_name !== false && !!data.name;
    cell.name.textContent = showName ? data.name : '';
    cell.name.style.display = showName ? '' : 'none';

    cell.state.textContent = data.secondary;
    cell.state.style.display = data.secondary ? '' : 'none';

    // Animation: only class toggles, no style recalculation per frame.
    const animation = button.animation;
    cell.icon.className = 'icon';
    if (data.animate) {
      cell.icon.classList.add('anim', `anim-${animation.type}`);
      cell.icon.style.setProperty('--mbc-anim-d', animation.duration);
      cell.icon.style.setProperty('--mbc-anim-i', String(animation.intensity));
    } else {
      cell.icon.style.removeProperty('--mbc-anim-d');
      cell.icon.style.removeProperty('--mbc-anim-i');
    }

    const label = [data.name, data.secondary].filter(Boolean).join(', ');
    root.setAttribute('aria-label', label || 'Button');
    if (button.entity) {
      root.setAttribute('aria-pressed', data.active ? 'true' : 'false');
    }
    root.title = data.missing ? `Unknown entity: ${button.entity}` : '';
  }

  /**
   * Swap between <ha-icon> and <ha-state-icon> only when the kind actually
   * changes - element creation is the expensive part of an update.
   */
  _renderIcon(cell, button, data) {
    const wantsStateIcon = !data.icon && !!data.stateObj;
    const wantedTag = wantsStateIcon ? 'ha-state-icon' : 'ha-icon';

    if (cell.iconTag !== wantedTag) {
      const next = document.createElement(wantedTag);
      next.className = cell.icon.className;
      cell.icon.replaceWith(next);
      cell.icon = next;
      cell.iconTag = wantedTag;
    }

    if (wantsStateIcon) {
      cell.icon.hass = this._hass;
      cell.icon.stateObj = data.stateObj;
    } else {
      const fallback = data.missing ? 'mdi:alert-circle-outline' : 'mdi:card-outline';
      cell.icon.icon = data.icon || fallback;
    }
  }

  /* --- Gestures --------------------------------------------------------- */

  /**
   * Pointer-first gesture handling.
   *
   * A plain tap fires on pointerup with no delay. The 250 ms double-tap window
   * is only opened when a double_tap_action actually exists - responsiveness on
   * a wall tablet matters more than universal double-tap support.
   */
  _bindGestures(el, index) {
    const gesture = {
      index,
      holdTimer: null,
      tapTimer: null,
      held: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      lastPointerUp: 0,
    };
    this._gestures.set(el, gesture);

    el.addEventListener('pointerdown', (event) => {
      if (event.button !== undefined && event.button > 0) return;
      gesture.pointerId = event.pointerId;
      gesture.held = false;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      el.classList.add('pressed');

      const button = this._config.buttons[index];
      if (button.hold_action.action !== 'none') {
        gesture.holdTimer = window.setTimeout(() => {
          gesture.held = true;
          gesture.holdTimer = null;
          el.classList.remove('pressed');
          haptic(el, 'medium');
          this._dispatch(index, 'hold', el);
        }, HOLD_DELAY_MS);
      }
    });

    el.addEventListener('pointermove', (event) => {
      if (gesture.pointerId !== event.pointerId) return;
      // A scroll gesture is not a tap.
      if (Math.abs(event.clientX - gesture.startX) > 12 || Math.abs(event.clientY - gesture.startY) > 12) {
        this._cancelGesture(gesture);
        el.classList.remove('pressed');
      }
    });

    el.addEventListener('pointerup', (event) => {
      if (gesture.pointerId !== event.pointerId) return;
      el.classList.remove('pressed');
      gesture.pointerId = null;
      gesture.lastPointerUp = Date.now();

      if (gesture.holdTimer) {
        window.clearTimeout(gesture.holdTimer);
        gesture.holdTimer = null;
      }
      if (gesture.held) {
        gesture.held = false;
        return;
      }

      const button = this._config.buttons[index];
      if (button.double_tap_action.action === 'none') {
        this._dispatch(index, 'tap', el);
        return;
      }

      if (gesture.tapTimer) {
        window.clearTimeout(gesture.tapTimer);
        gesture.tapTimer = null;
        this._dispatch(index, 'double_tap', el);
        return;
      }
      gesture.tapTimer = window.setTimeout(() => {
        gesture.tapTimer = null;
        this._dispatch(index, 'tap', el);
      }, DOUBLE_TAP_WINDOW_MS);
    });

    el.addEventListener('pointercancel', () => {
      el.classList.remove('pressed');
      this._cancelGesture(gesture);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('pressed');
      if (gesture.holdTimer) {
        window.clearTimeout(gesture.holdTimer);
        gesture.holdTimer = null;
      }
    });

    // Keyboard and assistive technology produce a click without pointer events.
    el.addEventListener('click', (event) => {
      event.preventDefault();
      if (Date.now() - gesture.lastPointerUp < 700) return; // already handled
      this._dispatch(index, 'tap', el);
    });
    el.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  _cancelGesture(gesture) {
    if (gesture.holdTimer) {
      window.clearTimeout(gesture.holdTimer);
      gesture.holdTimer = null;
    }
    if (gesture.tapTimer) {
      window.clearTimeout(gesture.tapTimer);
      gesture.tapTimer = null;
    }
    gesture.pointerId = null;
    gesture.held = false;
  }

  /* --- Dispatch --------------------------------------------------------- */

  _dispatch(index, kind, el) {
    const button = this._config && this._config.buttons[index];
    if (!button) return;

    const action =
      kind === 'hold'
        ? button.hold_action
        : kind === 'double_tap'
          ? button.double_tap_action
          : button.tap_action;

    if (!action || action.action === 'none') return;

    // Two-step confirmation instead of a modal: the first tap arms the button,
    // the second one within the timeout runs the action.
    if (kind === 'tap' && button.confirmation && this._armedIndex !== index) {
      this._arm(index, el);
      return;
    }
    this._clearArmed();

    haptic(el, kind === 'hold' ? 'medium' : 'light');
    performAction(this._hass, action, el);
  }

  _arm(index, el) {
    this._clearArmed();
    this._armedIndex = index;
    el.classList.add('armed');

    const button = this._config.buttons[index];
    const cell = this._cells[index];
    const text =
      typeof button.confirmation === 'object' && button.confirmation.text
        ? button.confirmation.text
        : 'Tap again to confirm';
    if (cell) {
      cell.state.dataset.previous = cell.state.textContent;
      cell.state.textContent = text;
      cell.state.style.display = '';
    }
    haptic(el, 'warning');

    this._armedTimer = window.setTimeout(() => this._clearArmed(), CONFIRM_TIMEOUT_MS);
  }

  _clearArmed() {
    if (this._armedTimer) {
      window.clearTimeout(this._armedTimer);
      this._armedTimer = null;
    }
    if (this._armedIndex < 0) return;

    const cell = this._cells[this._armedIndex];
    if (cell) {
      cell.root.classList.remove('armed');
      const previous = cell.state.dataset.previous || '';
      cell.state.textContent = previous;
      cell.state.style.display = previous ? '' : 'none';
      delete cell.state.dataset.previous;
    }
    // The next sync must repaint this button, so drop its signature first.
    this._signatures[this._armedIndex] = null;
    this._armedIndex = -1;
  }
}

/* --- small utilities ------------------------------------------------------ */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback) {
  const number = parseFloat(value);
  return Number.isFinite(number) ? number : fallback;
}

/** Accepts 12, "12", "12px", "1.5rem". */
function cssLength(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return `${value}px`;
  const text = String(value).trim();
  return /^[\d.]+$/.test(text) ? `${text}px` : text;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  });
}

/* -------------------------------------------------------------------------- */
/* 9. Registration                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Defines the element once, and says something useful when it cannot.
 *
 * A second Lovelace resource entry for the same card -- the usual cause is
 * adding `?v=2` as a NEW entry instead of editing the old one -- loads this
 * file twice. The second `customElements.define` throws NotSupportedError
 * partway through the module, so whichever copy loaded first wins and the
 * other silently does nothing. From the outside that looks exactly like
 * "I deployed the new file and nothing changed", which is why this warns
 * rather than returning quietly.
 */
function defineOnce(tag, element) {
  if (customElements.get(tag)) {
    console.warn(
      `[${tag}] is already registered, so this copy does nothing. You very ` +
        `likely have two Lovelace resource entries pointing at this card. ` +
        `Keep one under Settings > Dashboards > Resources and edit its ?v= ` +
        `instead of adding a second entry -- otherwise whichever copy loads ` +
        `first wins, and an update looks like it changed nothing.`,
    );
    return;
  }
  customElements.define(tag, element);
}

const inBrowser = typeof window !== 'undefined' && typeof customElements !== 'undefined';

if (inBrowser) {
  defineOnce(CARD_TAG, MultiButtonCard);
}

if (inBrowser) {
  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: 'Multi Button Card',
      description: 'Multi-button control card with an automatic layout, tuned for wall-mounted dashboards.',
      preview: true,
      documentationURL: REPO_URL,
    });
  }

  console.info(
    `%c ${CARD_TAG} %c v${CARD_VERSION} `,
    'color:#fff;background:#4a9eff;font-weight:700;border-radius:3px 0 0 3px;padding:2px 6px',
    'color:#4a9eff;background:#2b2b2b;border-radius:0 3px 3px 0;padding:2px 6px',
  );
}

export { CARD_VERSION, CARD_TAG, REPO_URL, MultiButtonCard, computeGridOptions, computeContentHeight, partitionRows, computeColumns, computeCellHeight, normalizeConfig, animationActive };
