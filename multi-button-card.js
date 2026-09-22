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

const CARD_VERSION = '1.5.0';

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

/**
 * The three layout options answer three different questions:
 *
 *   colspan       how many slots one button occupies
 *   columns       how many slots a row holds
 *   max_columns   the ceiling for the count `auto` works out for itself
 *
 * max_columns belongs to the automatic mode only. In `grid` the column count
 * is stated outright, and a second ceiling on top of it would just be a way to
 * silently ignore what was asked for.
 */
const DEFAULT_LAYOUT = {
  mode: 'auto', // auto | grid  ('fixed' is accepted as an old spelling of grid)
  columns: 'auto',
  gap: 12,
  min_button_size: 88, // minimum cell height in px
  max_button_size: 170, // maximum cell height in px
  column_width: 172, // target column width the auto mode aims for
  max_columns: 6, // auto mode only
};

/** Above this a touch target cannot survive, whatever the config says. */
const COLUMN_LIMIT = 12;

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
    // CSS declarations for this button, e.g. "border: 2px solid red".
    // Templated like every other presentation field.
    style: src.style ?? null,
    // `visibility` is the sections spelling, `conditions` the conditional
    // card's. Both appear in the wild, so both are accepted.
    visibility: normalizeVisibility(src.visibility ?? src.conditions),
    weight: resolveWeight(src),
    // Scanned once: the sync path then only builds a template context for the
    // buttons that actually need one.
    hasTemplates: false,
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

  button.hasTemplates = TEMPLATED_FIELDS.some((field) => {
    const value = button[field];
    if (hasTemplate(value)) return true;
    // A state-keyed icon map may hold templates in its branches.
    if (field === 'icon' && value && typeof value === 'object') {
      return Object.values(value).some((entry) => hasTemplate(entry));
    }
    return false;
  });

  return button;
}

/**
 * The fields a template may fill. Presentation only: `entity` would break
 * state tracking, `colspan` would rebuild the layout on every update, and the
 * actions are structure rather than appearance.
 */
const TEMPLATED_FIELDS = [
  'name',
  'label',
  'icon',
  'state_display',
  'color',
  'active_color',
  'icon_color',
  'background',
  'active_background',
  'show_name',
  'show_state',
  'style',
];

/** A single condition is allowed where a list is expected. */
function normalizeVisibility(raw) {
  if (raw === undefined || raw === null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((entry) => entry && typeof entry === 'object');
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
function resolveIcon(button, stateObj, resolve = (value) => value) {
  const icon = button.icon;
  if (typeof icon === 'string') return resolve(icon);

  if (icon && typeof icon === 'object') {
    const state = stateObj ? String(stateObj.state) : 'unknown';
    if (icon[state] !== undefined) return resolve(icon[state]);
    // YAML turns bare on/off into booleans, so check those too.
    if (state === 'on' && icon.true !== undefined) return resolve(icon.true);
    if (state === 'off' && icon.false !== undefined) return resolve(icon.false);
    if (icon.default !== undefined) return resolve(icon.default);
    return null;
  }

  if (stateObj && stateObj.attributes && stateObj.attributes.icon) {
    return stateObj.attributes.icon;
  }
  return null;
}

function resolveName(button, stateObj, resolve = (value) => value) {
  if (button.name === false) return '';
  if (button.name) {
    const name = resolve(button.name);
    return name === undefined || name === null ? '' : String(name);
  }
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
function resolveShowState(button, stateObj, resolve = (value) => value) {
  const configured = resolve(button.show_state);
  if (configured === true || configured === 'true') return true;
  if (configured === false || configured === 'false') return false;
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

/* --- templates ------------------------------------------------------------ */

/**
 * Fields can carry JavaScript, in the `[[[ ... ]]]` form that custom:button-card
 * established. Reusing that syntax rather than inventing one means a template
 * written for either card reads the same.
 *
 *   label: |
 *     [[[ return entity.state === 'on' ? entity.attributes.count : ''; ]]]
 *
 * A template that fills the whole string returns its value as-is, so it can
 * yield a boolean or a number. One embedded in surrounding text is substituted
 * into it.
 *
 * This is evaluated code from the dashboard's own configuration - the same
 * trade-off every templating card in this ecosystem makes.
 */
const TEMPLATE_PATTERN = /\[\[\[([\s\S]*?)\]\]\]/g;

/** Compiled once per distinct template body; configs reuse the same strings. */
const templateCache = new Map();

function hasTemplate(value) {
  return typeof value === 'string' && value.includes('[[[');
}

function compileTemplate(body) {
  let fn = templateCache.get(body);
  if (fn === undefined) {
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function('entity', 'states', 'user', 'hass', 'variables', body);
    } catch (err) {
      console.error(`${CARD_TAG}: template does not compile`, body, err);
      fn = null;
    }
    templateCache.set(body, fn);
  }
  return fn;
}

/**
 * Evaluate a value that may contain templates.
 *
 * A broken template yields undefined rather than taking the card down: one bad
 * expression should cost its own field, not the dashboard.
 */
function renderTemplate(value, context) {
  if (!hasTemplate(value)) return value;

  // A single template filling the whole string returns its value as-is. The
  // match is greedy, so "[[[a]]] / [[[b]]]" would otherwise look like one
  // template whose body spans both - and that body is not valid JavaScript.
  const whole = value.trim().match(/^\[\[\[([\s\S]*)\]\]\]$/);
  if (whole && !whole[1].includes('[[[')) return runTemplate(whole[1], context);

  // Embedded: substitute each occurrence into the surrounding text.
  return value.replace(TEMPLATE_PATTERN, (_match, body) => {
    const result = runTemplate(body, context);
    return result === undefined || result === null ? '' : String(result);
  });
}

function runTemplate(body, context) {
  const fn = compileTemplate(body);
  if (!fn) return undefined;
  try {
    return fn(context.entity, context.states, context.user, context.hass, context.variables);
  } catch (err) {
    console.error(`${CARD_TAG}: template failed`, body.trim(), err);
    return undefined;
  }
}

/** The values a template can read. */
function templateContext(hass, stateObj, variables) {
  return {
    entity: stateObj,
    states: hass.states,
    user: hass.user,
    hass,
    variables: variables || {},
  };
}

/* --- visibility conditions ------------------------------------------------ */

/**
 * Home Assistant's own condition grammar, as used by `visibility:` in sections
 * and by the conditional card. A list means "all of these", which is HA's
 * convention.
 *
 * An unknown condition type evaluates to true on purpose: a typo should leave
 * the button where it is, not make it vanish without a trace.
 */
function conditionMet(condition, hass, matchMedia) {
  if (!condition || typeof condition !== 'object') return true;

  switch (condition.condition) {
    case 'state': {
      const stateObj = hass.states[condition.entity];
      const state = stateObj ? String(stateObj.state) : 'unavailable';
      if (condition.state !== undefined) {
        return asList(condition.state).some((value) => String(value) === state);
      }
      if (condition.state_not !== undefined) {
        return !asList(condition.state_not).some((value) => String(value) === state);
      }
      return !!stateObj;
    }

    case 'numeric_state': {
      const stateObj = hass.states[condition.entity];
      if (!stateObj) return false;
      const value = Number(
        condition.attribute ? stateObj.attributes[condition.attribute] : stateObj.state,
      );
      if (Number.isNaN(value)) return false;
      if (condition.above !== undefined && !(value > Number(condition.above))) return false;
      if (condition.below !== undefined && !(value < Number(condition.below))) return false;
      return true;
    }

    case 'screen': {
      if (!condition.media_query) return true;
      return matchMedia(condition.media_query);
    }

    case 'user': {
      const current = hass.user && hass.user.id;
      if (!current) return false;
      return asList(condition.users).some((id) => String(id) === String(current));
    }

    case 'and':
      return asList(condition.conditions).every((c) => conditionMet(c, hass, matchMedia));

    case 'or':
      return asList(condition.conditions).some((c) => conditionMet(c, hass, matchMedia));

    case 'not':
      return !asList(condition.conditions).some((c) => conditionMet(c, hass, matchMedia));

    default:
      return true;
  }
}

/** All conditions must hold; no conditions means always visible. */
function isVisible(conditions, hass, matchMedia) {
  if (!conditions || conditions.length === 0) return true;
  if (!hass) return true;
  return conditions.every((condition) => conditionMet(condition, hass, matchMedia));
}

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Every media query a config mentions, so they can be watched. */
function collectMediaQueries(conditions, into = new Set()) {
  asList(conditions).forEach((condition) => {
    if (!condition || typeof condition !== 'object') return;
    if (condition.condition === 'screen' && condition.media_query) {
      into.add(condition.media_query);
    }
    if (condition.conditions) collectMediaQueries(condition.conditions, into);
  });
  return into;
}

/* -------------------------------------------------------------------------- */
/* 4. Layout engine                                                           */
/* -------------------------------------------------------------------------- */

/** `fixed` was the old spelling; both mean "the user stated the column count". */
function isStrictGrid(layout) {
  return layout.mode === 'grid' || layout.mode === 'fixed';
}

/**
 * How many columns fit, given the measured width.
 * The result is clamped by the total weight so three buttons never spread
 * across six columns just because the screen is wide.
 */
function computeColumns(config, totalWeight, width) {
  const { layout } = config;
  const hardMax = Math.max(1, Math.min(layout.max_columns, totalWeight));

  if (isStrictGrid(layout)) {
    const requested = Number(layout.columns);
    if (Number.isFinite(requested) && requested > 0) {
      // Deliberately not clamped by max_columns: that option tunes the
      // automatic count, and applying it here would quietly override the
      // column count the user spelled out.
      return Math.max(1, Math.min(COLUMN_LIMIT, Math.round(requested)));
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
 *
 * With `strict` the balancing is off and rows are simply filled to capacity.
 * 5 buttons / 2 columns -> [[0,1],[2,3],[4]]
 * 7 buttons / 3 columns -> [[0,1,2],[3,4],[5,6]]   (never [3,3,1])
 */
function partitionRows(weights, columns, strict = false) {
  // Stated column count: fill each row to capacity and start a new one. No
  // balancing - "5 columns" has to mean five columns, even if that leaves the
  // last row half empty.
  if (strict) {
    const rows = [];
    let row = [];
    let used = 0;
    weights.forEach((rawWeight, index) => {
      const weight = Math.min(rawWeight, columns);
      if (row.length > 0 && used + weight > columns) {
        rows.push(row);
        row = [];
        used = 0;
      }
      row.push(index);
      used += weight;
    });
    if (row.length > 0) rows.push(row);
    return rows;
  }

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
  const rows = partitionRows(weights, columns, isStrictGrid(config.layout)).length;
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
}

/* Every button hidden by its conditions: the card removes itself from the
   dashboard rather than leaving an empty surface, the way a conditional card
   does. Set on the host, so it also collapses the sections grid cell. */
:host(.mbc-hidden) {
  display: none;
}

:host {
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
  /* Note: the accent hairline is NOT derived here. A custom property is
     substituted where it is declared, so mixing it on :host would freeze it to
     the card's accent - a button setting its own --mbc-accent would colour its
     icon but not its outline. The mix happens on .btn.active instead. */

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
  /* Grid, not flex: a weight-2 button has to be exactly as wide as two
     weight-1 buttons plus the gap between them, and flex cannot express that.
     Sharing out free space by flex-grow ignores that a row of two elements has
     one gap where a row of three has two, and the obvious correction --
     putting the swallowed gap into flex-basis -- does nothing, because with
     box-sizing: border-box a basis below padding + border is silently raised
     to it. A 'span 2' over equal 1fr tracks is the property we want. */
  display: grid;
  grid-auto-flow: column;
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

.btn[hidden] { display: none; }

.btn {
  position: relative;
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
  /* Mixed here, so --mbc-accent resolves against this button - including one
     set per button or produced by a template. */
  border-color: rgba(255, 255, 255, 0.22);
  border-color: color-mix(in srgb, var(--mbc-accent) 30%, transparent);
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

    /** Indices of the buttons currently visible, in order. */
    this._visible = null;
    /** media query string -> MediaQueryList, watched while connected. */
    this._mediaQueries = new Map();
    this._matchMedia = (query) => {
      const entry = this._mediaQueries.get(query);
      return entry ? entry.matches : false;
    };

    this._gestures = new Map();
    this._armedIndex = -1;
    this._armedTimer = null;
  }

  /* --- Lovelace contract ------------------------------------------------ */

  /** Lovelace asks for this; without it the UI says "no visual editor". */
  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

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

  /**
   * A `screen` condition has to react to the viewport changing, or it would
   * only ever be evaluated once. One listener per distinct query, not one per
   * button, so a card repeating the same breakpoint costs nothing extra.
   */
  _watchMediaQueries() {
    this._unwatchMediaQueries();
    if (!this._config || typeof window === 'undefined' || !window.matchMedia) return;

    const queries = new Set();
    this._config.buttons.forEach((button) => collectMediaQueries(button.visibility, queries));

    queries.forEach((query) => {
      try {
        const list = window.matchMedia(query);
        const onChange = () => this._sync();
        if (list.addEventListener) list.addEventListener('change', onChange);
        else list.addListener(onChange); // older webviews
        this._mediaQueries.set(query, { matches: list.matches, list, onChange });
        // Keep the cached value fresh without re-querying on every sync.
        const refresh = () => {
          const entry = this._mediaQueries.get(query);
          if (entry) entry.matches = list.matches;
        };
        if (list.addEventListener) list.addEventListener('change', refresh);
        else list.addListener(refresh);
      } catch (err) {
        console.warn(`${CARD_TAG}: invalid media_query "${query}"`, err);
      }
    });
  }

  _unwatchMediaQueries() {
    this._mediaQueries.forEach(({ list, onChange }) => {
      if (list.removeEventListener) list.removeEventListener('change', onChange);
      else if (list.removeListener) list.removeListener(onChange);
    });
    this._mediaQueries.clear();
  }

  connectedCallback() {
    this._watchMediaQueries();
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
    this._unwatchMediaQueries();
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
    // Attributes that make a single button addressable from outside. card-mod
    // injects its styles into this shadow root (it targets the card element,
    // not an ha-card), so a selector like
    //   .btn[data-entity="binary_sensor.alle_fenster"] { ... }
    // reaches exactly one button. data-state and data-active are kept current
    // by the sync, so a rule can depend on them.
    if (button.entity) {
      el.dataset.entity = button.entity;
      el.dataset.domain = domainOf(button.entity);
    }
    if (button.name && typeof button.name === 'string' && !hasTemplate(button.name)) {
      el.dataset.name = button.name;
    }
    el.setAttribute('role', 'button');

    if (button.press_effect && button.press_effect !== 'none') {
      el.classList.add(`effect-${button.press_effect}`);
    }
    el.style.setProperty('--mbc-btn-radius', cssLength(button.radius, '18px'));
    // Templated colours are applied per sync instead, since their value
    // depends on state that only exists at that point.
    if (!button.hasTemplates) this._applyColours(el, button);
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

  /**
   * A button's own CSS declarations. Not a full rule - there is no selector -
   * just what would go inside one: "border: 2px solid red; opacity: 0.5".
   *
   * Properties set on a previous pass are removed first, otherwise a template
   * that stops returning a border would leave the old one behind.
   */
  _applyStyle(el, css, cell) {
    (cell.styleProps || []).forEach((property) => el.style.removeProperty(property));
    cell.styleProps = [];
    if (!css || typeof css !== 'string') return;

    css.split(';').forEach((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon < 0) return;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).trim();
      if (!property || !value) return;
      el.style.setProperty(property, value);
      cell.styleProps.push(property);
    });
  }

  /** Colour overrides, from config or from a template's result. */
  _applyColours(el, colours) {
    const set = (property, value) => {
      if (value === undefined || value === null || value === '') el.style.removeProperty(property);
      else el.style.setProperty(property, String(value));
    };
    set('background', colours.background);
    set('--mbc-btn-active-bg', colours.active_background);
    set('--mbc-accent', colours.active_color);
    set('--mbc-icon-color', colours.icon_color);
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

    const visible = this._visible || this._config.buttons.map((_, index) => index);
    const weights = visible.map((index) => this._config.buttons[index].weight);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const columns = computeColumns(this._config, totalWeight, innerWidth);
    const cellHeight = computeCellHeight(this._config, columns, innerWidth);

    // Every button hidden: the card hides itself, the way a conditional card
    // does, rather than leaving an empty surface on the dashboard.
    this.classList.toggle('mbc-hidden', visible.length === 0);
    if (visible.length === 0) {
      this._gridEl.replaceChildren();
      this._rowEls = [];
      this._rowGroups = [];
      return;
    }

    // Nothing changed -> no DOM writes at all.
    if (columns === this._lastColumns && cellHeight === this._lastCellHeight) return;
    this._lastColumns = columns;
    this._lastCellHeight = cellHeight;

    const strict = isStrictGrid(layout);
    const rows = partitionRows(weights, columns, strict);

    this._gridEl.style.setProperty('--mbc-gap', cssLength(layout.gap, '12px'));
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
    this._rowGroups = rows.map((row) => row.map((slot) => visible[slot]));
    rows.forEach((row) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'row';
      row.forEach((slot) => {
        const cell = this._cells[visible[slot]];
        if (!cell) return;
        const weight = Math.min(weights[slot], columns);
        cell.root.style.gridColumn = `span ${weight}`;
        rowEl.appendChild(cell.root);
      });
      // Equal tracks: one per slot the row holds, or the full stated column
      // count in a strict grid - there the last row stays left-aligned in the
      // same raster rather than stretching to fill the width. minmax(0, 1fr)
      // rather than 1fr so a long label cannot push a track past its share.
      const rowWeight = row.reduce((sum, slot) => sum + Math.min(weights[slot], columns), 0);
      const tracks = strict ? columns : rowWeight;
      rowEl.style.gridTemplateColumns = `repeat(${tracks}, minmax(0, 1fr))`;
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
    this._lastVisibleKey = visible.join(',');
  }

  /* --- State sync ------------------------------------------------------- */

  _sync(force = false) {
    if (!this._config || !this._hass || this._cells.length === 0) return;

    // Visibility first: it decides which buttons the layout has to place, so a
    // change here has to re-run the layout before anything is painted.
    const visible = [];
    this._config.buttons.forEach((button, index) => {
      if (isVisible(button.visibility, this._hass, this._matchMedia)) visible.push(index);
    });
    const visibleKey = visible.join(',');
    if (visibleKey !== this._lastVisibleKey) {
      this._visible = visible;
      this._cells.forEach((cell, index) => {
        cell.root.hidden = !visible.includes(index);
      });
      this._lastColumns = 0; // force the layout to recompute
      this._applyLayout(this._lastWidth || this.clientWidth);
    }

    this._config.buttons.forEach((button, index) => {
      if (!visible.includes(index)) return;
      const cell = this._cells[index];
      if (!cell) return;

      const stateObj = button.entity ? this._hass.states[button.entity] : undefined;
      const missing = !!button.entity && !stateObj;
      const unavailable = !!button.entity && isUnavailable(stateObj);
      const active = isActiveState(stateObj);

      // One context per templated button per update; buttons without
      // templates never build one.
      const context = button.hasTemplates
        ? templateContext(this._hass, stateObj, this._config.variables)
        : null;
      const resolve = context ? (value) => renderTemplate(value, context) : (value) => value;

      const icon = resolveIcon(button, stateObj, resolve);
      const name = resolveName(button, stateObj, resolve);
      const label = resolve(button.label);
      const hasLabel = label !== undefined && label !== null && label !== '';

      let secondary = '';
      if (resolveShowState(button, stateObj, resolve)) {
        if (button.state_display) {
          const display = resolve(button.state_display);
          // A template produced the whole text; otherwise the placeholder
          // syntax still applies.
          secondary = hasTemplate(button.state_display)
            ? display === undefined || display === null
              ? ''
              : String(display)
            : applyStateTemplate(display, this._hass, stateObj, name);
        } else if (hasLabel) {
          secondary = String(label);
        } else {
          secondary = formatState(this._hass, stateObj);
        }
      } else if (hasLabel) {
        secondary = String(label);
      }

      const colours = context
        ? {
            background: resolve(button.background),
            active_background: resolve(button.active_background),
            active_color: resolve(button.active_color),
            icon_color: resolve(button.icon_color),
          }
        : null;
      const showName = button.show_name === false ? false : resolve(button.show_name) !== false;
      const style = button.style ? resolve(button.style) : null;

      const animate = animationActive(button.animation, stateObj);
      const signature = [
        icon || '',
        name,
        secondary,
        active ? 1 : 0,
        unavailable ? 1 : 0,
        missing ? 1 : 0,
        animate ? button.animation.type : '',
        showName ? 1 : 0,
        style || '',
        // Template results belong in the signature, so a card whose templates
        // keep returning the same thing still writes nothing to the DOM.
        colours ? JSON.stringify(colours) : '',
      ].join('\u001f');

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
        colours,
        showName,
        style,
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

    // Mirrored onto the element so a stylesheet can react to them.
    root.dataset.state = data.stateObj ? String(data.stateObj.state) : '';
    root.dataset.active = data.active ? 'true' : 'false';

    // Icon: explicit icon wins; otherwise let HA pick the domain icon.
    this._renderIcon(cell, button, data);

    if (data.colours) this._applyColours(root, data.colours);
    if (data.style || cell.styleProps) this._applyStyle(root, data.style, cell);

    const showName = data.showName !== false && !!data.name;
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
/* 9. Visual editor                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The editor is built from ha-form, which Home Assistant renders from a
 * declarative schema. ha-form has no concept of a list, and this card's whole
 * point is a list of buttons - so the buttons get their own list UI, and each
 * button opens a sub-page with its own ha-form.
 *
 * Two rules keep this from fighting itself:
 *
 *   1. ha-form is created once per page and then only fed new `.data`.
 *      Rebuilding it on every keystroke would take the focus out of the field
 *      being typed into.
 *   2. What goes back into the config is pruned of anything equal to a default,
 *      so using the editor does not bloat the YAML with every option.
 */

const EDITOR_TAG = `${CARD_TAG}-editor`;

/** Labels, so the form does not show raw config keys. */
const LABELS = {
  title: 'Title',
  layout: 'Layout',
  mode: 'Mode',
  columns: 'Columns',
  gap: 'Gap between buttons',
  column_width: 'Target column width',
  max_columns: 'Maximum columns (automatic mode)',
  min_button_size: 'Minimum button height',
  max_button_size: 'Maximum button height',
  appearance: 'Card appearance',
  background: 'Background',
  active_background: 'Background when active',
  style: 'Extra CSS',
  radius: 'Corner radius',
  padding: 'Padding',
  shadow: 'Shadow',
  button: 'Button defaults',
  active_color: 'Accent colour',
  icon_color: 'Icon colour',
  icon_size: 'Icon size (px)',
  label_size: 'Label size (px)',
  show_name: 'Show name',
  show_state: 'Show state',
  press_effect: 'Press effect',
  animation: 'Animation',
  type: 'Type',
  duration: 'Duration',
  intensity: 'Intensity',
  when: 'Run when',
  entity: 'Entity',
  name: 'Name',
  icon: 'Icon',
  label: 'Label',
  colspan: 'Width in slots',
  confirmation: 'Ask for confirmation',
  state_display: 'State text',
  tap_action: 'Tap',
  hold_action: 'Hold',
  double_tap_action: 'Double tap',
};

const ACTION_TYPES = ['more-info', 'toggle', 'perform-action', 'navigate', 'url', 'assist', 'none'];

const CONDITIONS_TAG = 'ha-card-conditions-editor';
const YAML_TAG = 'ha-yaml-editor';

/**
 * Home Assistant defines its conditions editor lazily: it only reaches the
 * element registry once something that uses it has been loaded. Creating a
 * conditional card and asking for its config element is the documented way to
 * pull that in - `loadCardHelpers` is the supported entry point for it.
 *
 * Everything here is best-effort. If any step fails the editor falls back to
 * telling the user to write the conditions in YAML, which still works.
 */
let conditionsEditorReady = null;
let yamlEditorReady = null;

/**
 * `ha-yaml-editor` is what the `{}` button opens elsewhere in Lovelace. It is
 * usually already defined by the time a card editor is open, but not
 * guaranteed, so it is loaded the same way as the conditions editor.
 */
function ensureYamlEditor() {
  if (customElements.get(YAML_TAG)) return Promise.resolve(true);
  if (!yamlEditorReady) {
    yamlEditorReady = (async () => {
      try {
        if (typeof window === 'undefined' || !window.loadCardHelpers) return false;
        await window.loadCardHelpers();
        await customElements.whenDefined(YAML_TAG);
        return true;
      } catch (err) {
        console.warn(`${CARD_TAG}: could not load ${YAML_TAG}`, err);
        return false;
      }
    })();
  }
  return yamlEditorReady;
}

function ensureConditionsEditor() {
  if (customElements.get(CONDITIONS_TAG)) return Promise.resolve(true);

  if (!conditionsEditorReady) {
    conditionsEditorReady = (async () => {
      try {
        if (typeof window === 'undefined' || !window.loadCardHelpers) return false;
        const helpers = await window.loadCardHelpers();
        if (!helpers || !helpers.createCardElement) return false;

        const probe = await helpers.createCardElement({
          type: 'conditional',
          conditions: [],
          card: { type: 'button' },
        });
        const ctor = probe && probe.constructor;
        if (ctor && typeof ctor.getConfigElement === 'function') {
          await ctor.getConfigElement();
        }
        await customElements.whenDefined(CONDITIONS_TAG);
        return true;
      } catch (err) {
        console.warn(
          `${CARD_TAG}: could not load ${CONDITIONS_TAG}; ` +
            'visibility conditions stay editable in YAML.',
          err,
        );
        return false;
      }
    })();
  }
  return conditionsEditorReady;
}

const select = (name, options, mode = 'dropdown') => ({
  name,
  selector: { select: { mode, options } },
});

const ANIMATION_SCHEMA = [
  select(
    'type',
    [...VALID_ANIMATIONS].map((value) => ({ value, label: value })),
  ),
  {
    name: 'when',
    selector: {
      select: {
        custom_value: true,
        mode: 'dropdown',
        options: [
          { value: 'active', label: 'Entity is active' },
          { value: 'inactive', label: 'Entity is inactive' },
          { value: 'always', label: 'Always' },
          { value: 'never', label: 'Never' },
        ],
      },
    },
  },
  { name: 'duration', selector: { text: {} } },
  { name: 'intensity', selector: { number: { min: 0, max: 3, step: 0.1, mode: 'slider' } } },
];

/**
 * Card-level options. The buttons are handled by the list below the form.
 *
 * The layout section depends on the mode, because `columns` does nothing in
 * `auto` and `max_columns` does nothing in `grid`. Showing a control that
 * cannot take effect is worse than showing none.
 */
const cardSchema = (mode) => [
  { name: 'title', selector: { text: {} } },
  {
    type: 'expandable',
    name: 'layout',
    title: 'Layout',
    icon: 'mdi:view-grid-outline',
    schema: [
      select('mode', [
        { value: 'auto', label: 'Automatic' },
        { value: 'grid', label: 'Fixed column count' },
      ]),
      ...(mode === 'grid'
        ? [{ name: 'columns', selector: { number: { min: 1, max: 12, mode: 'box' } } }]
        : [
            { name: 'column_width', selector: { number: { min: 80, max: 400, mode: 'box' } } },
            { name: 'max_columns', selector: { number: { min: 1, max: 12, mode: 'box' } } },
          ]),
      { name: 'gap', selector: { number: { min: 0, max: 48, mode: 'box' } } },
      { name: 'min_button_size', selector: { number: { min: 48, max: 200, mode: 'box' } } },
      { name: 'max_button_size', selector: { number: { min: 60, max: 400, mode: 'box' } } },
    ],
  },
  {
    type: 'expandable',
    name: 'appearance',
    title: 'Card appearance',
    icon: 'mdi:palette-outline',
    schema: [
      { name: 'background', selector: { text: {} } },
      { name: 'radius', selector: { number: { min: 0, max: 60, mode: 'box' } } },
      { name: 'padding', selector: { number: { min: 0, max: 48, mode: 'box' } } },
      { name: 'shadow', selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: 'button',
    title: 'Button defaults',
    icon: 'mdi:gesture-tap-button',
    schema: [
      { name: 'radius', selector: { number: { min: 0, max: 60, mode: 'box' } } },
      { name: 'icon_size', selector: { number: { min: 12, max: 96, mode: 'slider' } } },
      { name: 'label_size', selector: { number: { min: 8, max: 32, mode: 'slider' } } },
      { name: 'active_color', selector: { text: {} } },
      { name: 'icon_color', selector: { text: {} } },
      { name: 'show_name', selector: { boolean: {} } },
      select('press_effect', [
        { value: 'scale', label: 'Scale' },
        { value: 'fade', label: 'Brighten' },
        { value: 'none', label: 'None' },
      ]),
    ],
  },
  {
    type: 'expandable',
    name: 'animation',
    title: 'Animation defaults',
    icon: 'mdi:motion-outline',
    schema: ANIMATION_SCHEMA,
  },
];

/** One button's options, shown on its own page. */
const BUTTON_SCHEMA = [
  { name: 'entity', selector: { entity: {} } },
  { name: 'name', selector: { text: {} } },
  { name: 'icon', selector: { icon: {} } },
  { name: 'colspan', selector: { number: { min: 1, max: 6, mode: 'box' } } },
  {
    type: 'expandable',
    name: '',
    title: 'Actions',
    icon: 'mdi:gesture-tap',
    schema: [
      { name: 'tap_action', selector: { ui_action: { actions: ACTION_TYPES } } },
      { name: 'hold_action', selector: { ui_action: { actions: ACTION_TYPES } } },
      { name: 'double_tap_action', selector: { ui_action: { actions: ACTION_TYPES } } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Display',
    icon: 'mdi:text-short',
    schema: [
      { name: 'show_name', selector: { boolean: {} } },
      {
        name: 'show_state',
        selector: {
          select: {
            mode: 'dropdown',
            options: [
              { value: 'auto', label: 'Automatic' },
              { value: 'true', label: 'Always' },
              { value: 'false', label: 'Never' },
            ],
          },
        },
      },
      { name: 'label', selector: { text: {} } },
      { name: 'state_display', selector: { text: {} } },
      { name: 'icon_size', selector: { number: { min: 12, max: 96, mode: 'slider' } } },
      { name: 'confirmation', selector: { boolean: {} } },
    ],
  },
  {
    type: 'expandable',
    name: '',
    title: 'Colours',
    icon: 'mdi:palette-outline',
    schema: [
      // Per button, overriding the card-wide defaults. All of these accept a
      // template, which the form passes through as text.
      { name: 'active_color', selector: { text: {} } },
      { name: 'icon_color', selector: { text: {} } },
      { name: 'background', selector: { text: {} } },
      { name: 'active_background', selector: { text: {} } },
      { name: 'style', selector: { text: { multiline: true } } },
    ],
  },
  {
    type: 'expandable',
    name: 'animation',
    title: 'Animation',
    icon: 'mdi:motion-outline',
    schema: ANIMATION_SCHEMA,
  },
];

/**
 * Remove everything that equals the default, recursively, and drop sections
 * that end up empty. Without this the first touch of the editor would write
 * every option the card has into the user's YAML.
 */
function pruneDefaults(value, defaults) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || entry === null || entry === '') continue;

    const fallback = defaults ? defaults[key] : undefined;

    if (entry && typeof entry === 'object' && !Array.isArray(entry) && fallback && typeof fallback === 'object') {
      const nested = pruneDefaults(entry, fallback);
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    if (fallback !== undefined && fallback === entry) continue;
    out[key] = entry;
  }
  return out;
}

/**
 * Write form output back into a config without losing anything the form does
 * not model.
 *
 * A form knows a fixed set of keys. Rebuilding the object from just those keys
 * silently drops everything else - and on a Lovelace card "everything else"
 * includes `grid_options`, which Home Assistant itself writes when the user
 * sizes the card in a section. Losing it resets the card to the default width
 * on the next edit.
 *
 * So: start from what is already there, remove only the keys this form owns,
 * then apply the new values.
 */
function mergeOwnedKeys(previous, ownedKeys, values) {
  const next = { ...previous };
  ownedKeys.forEach((key) => delete next[key]);
  return { ...next, ...values };
}

/** The card-level keys the editor's form is responsible for. */
const CARD_FORM_KEYS = ['title', 'layout', 'appearance', 'button', 'animation'];

/** The per-button keys the button form is responsible for. */
const BUTTON_FORM_KEYS = [
  'entity',
  'name',
  'icon',
  'colspan',
  'label',
  'state_display',
  'icon_size',
  'icon_color',
  'active_color',
  'background',
  'active_background',
  'show_name',
  'show_state',
  'confirmation',
  'tap_action',
  'hold_action',
  'double_tap_action',
  'animation',
];

/** `show_state` round-trips through a select, which only carries strings. */
function showStateToForm(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'auto';
}

function showStateFromForm(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return 'auto';
}

class MultiButtonCardEditor extends BaseElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    /** null = the card page, a number = that button's page. */
    this._openButton = null;
    /** Whether the open button page shows YAML instead of the form. */
    this._yamlMode = false;
    this._form = null;
    this._renderedPage = undefined;
  }

  setConfig(config) {
    this._config = { buttons: [], ...config };
    if (!Array.isArray(this._config.buttons)) this._config.buttons = [];
    // A button that no longer exists must not keep a page open.
    if (this._openButton !== null && !this._config.buttons[this._openButton]) {
      this._openButton = null;
    }
    this._render();
  }

  /** Lovelace assigns hass after setConfig, so this has to trigger a render. */
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  /* --- rendering ------------------------------------------------------- */

  _render() {
    if (!this._config || !this._hass) return;

    const page =
      this._openButton === null
        ? `card:${this._layoutMode()}`
        : `button:${this._openButton}:${this._yamlMode ? 'yaml' : 'form'}`;
    if (page !== this._renderedPage) {
      this._renderedPage = page;
      this._buildPage();
      return;
    }
    // Same page: only refresh the data, so typing keeps the focus.
    this._updateFormData();
  }

  _buildPage() {
    const root = this.shadowRoot;
    root.textContent = '';
    this._form = null;

    const style = document.createElement('style');
    style.textContent = EDITOR_STYLES;
    root.appendChild(style);

    if (this._openButton === null) this._buildCardPage(root);
    else this._buildButtonPage(root);
  }

  _layoutMode() {
    const mode = (this._config.layout || {}).mode || DEFAULT_LAYOUT.mode;
    return mode === 'fixed' ? 'grid' : mode;
  }

  _buildCardPage(root) {
    this._form = this._createForm(cardSchema(this._layoutMode()), this._cardFormData(), (value) =>
      this._cardFormChanged(value),
    );
    root.appendChild(this._form);
    root.appendChild(this._buildButtonList());
  }

  _buildButtonList() {
    const wrap = document.createElement('div');
    wrap.className = 'list';

    const heading = document.createElement('div');
    heading.className = 'heading';
    heading.textContent = 'Buttons';
    wrap.appendChild(heading);

    this._config.buttons.forEach((button, index) => {
      wrap.appendChild(this._buildButtonRow(button, index));
    });

    const add = document.createElement('button');
    add.className = 'add';
    add.type = 'button';
    add.textContent = '+ Add button';
    add.addEventListener('click', () => this._addButton());
    wrap.appendChild(add);

    if (this._config.buttons.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'This card needs at least one button.';
      wrap.insertBefore(empty, add);
    }

    return wrap;
  }

  _buildButtonRow(button, index) {
    const row = document.createElement('div');
    row.className = 'row';

    const icon = document.createElement('ha-icon');
    icon.className = 'row-icon';
    icon.icon = typeof button.icon === 'string' ? button.icon : 'mdi:gesture-tap-button';

    const label = document.createElement('button');
    label.className = 'row-label';
    label.type = 'button';
    const stateObj = button.entity ? this._hass.states[button.entity] : undefined;
    label.innerHTML = '';
    const primary = document.createElement('span');
    primary.className = 'row-name';
    primary.textContent = button.name || resolveName({ name: null, entity: button.entity }, stateObj) || `Button ${index + 1}`;
    const secondary = document.createElement('span');
    secondary.className = 'row-entity';
    secondary.textContent = button.entity || 'no entity';
    label.append(primary, secondary);
    label.addEventListener('click', () => {
      this._openButton = index;
      this._render();
    });

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.append(
      this._iconButton('mdi:arrow-up', 'Move up', () => this._moveButton(index, -1), index === 0),
      this._iconButton(
        'mdi:arrow-down',
        'Move down',
        () => this._moveButton(index, 1),
        index === this._config.buttons.length - 1,
      ),
      this._iconButton('mdi:delete-outline', 'Delete', () => this._deleteButton(index)),
    );

    row.append(icon, label, actions);
    return row;
  }

  _iconButton(icon, label, onClick, disabled = false) {
    const el = document.createElement('ha-icon-button');
    el.setAttribute('label', label);
    el.title = label;
    if (disabled) el.setAttribute('disabled', '');
    const inner = document.createElement('ha-icon');
    inner.icon = icon;
    el.appendChild(inner);
    if (!disabled) el.addEventListener('click', onClick);
    return el;
  }

  _buildButtonPage(root) {
    const index = this._openButton;
    const button = this._config.buttons[index] || {};

    const header = document.createElement('div');
    header.className = 'header';

    const back = this._iconButton('mdi:arrow-left', 'Back', () => {
      this._openButton = null;
      this._yamlMode = false;
      this._render();
    });
    const title = document.createElement('div');
    title.className = 'header-title';
    const label = typeof button.name === 'string' && !hasTemplate(button.name) ? button.name : null;
    title.textContent = label || button.entity || `Button ${index + 1}`;

    // Same affordance as everywhere else in Lovelace: {} swaps the form for
    // the raw YAML of this one button.
    const yamlToggle = this._iconButton(
      this._yamlMode ? 'mdi:format-list-bulleted' : 'mdi:code-braces',
      this._yamlMode ? 'Edit with the form' : 'Edit as YAML',
      () => {
        this._yamlMode = !this._yamlMode;
        this._render();
      },
    );
    yamlToggle.classList.add('yaml-toggle');

    header.append(back, title, yamlToggle);
    root.appendChild(header);

    if (this._yamlMode) {
      this._buildButtonYaml(root, index, button);
      return;
    }

    this._form = this._createForm(BUTTON_SCHEMA, this._buttonFormData(button), (value) =>
      this._buttonFormChanged(value),
    );
    root.appendChild(this._form);

    // Visibility uses Home Assistant's own conditions editor, which has to be
    // loaded first. Until it is there - or if it never arrives - the slot
    // carries a note saying the conditions are editable in YAML.
    const slot = document.createElement('div');
    slot.className = 'conditions';
    const heading = document.createElement('div');
    heading.className = 'heading';
    heading.textContent = 'Visibility';
    slot.append(heading, this._conditionsNote(button));
    root.appendChild(slot);

    this._mountConditionsEditor(slot, index);
  }

  /**
   * The whole button as YAML. Everything is editable here, including what the
   * form cannot express - and it is the only place to reach a state-keyed icon
   * map or a template without leaving the UI.
   */
  _buildButtonYaml(root, index, button) {
    const slot = document.createElement('div');
    slot.className = 'yaml';
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = 'Loading the YAML editor…';
    slot.appendChild(note);
    root.appendChild(slot);

    ensureYamlEditor().then((available) => {
      if (!slot.isConnected || this._openButton !== index || !this._yamlMode) return;
      if (!available) {
        note.textContent =
          'The YAML editor could not be loaded. Use the card\'s own YAML editor instead.';
        return;
      }

      const editor = document.createElement(YAML_TAG);
      editor.hass = this._hass;
      editor.defaultValue = button;
      editor.addEventListener('value-changed', (event) => {
        event.stopPropagation();
        const { value, isValid } = event.detail || {};
        // Invalid YAML is reported by the editor itself; writing it back
        // would replace the button with nonsense mid-typing.
        if (isValid === false || !value || typeof value !== 'object') return;
        const buttons = [...this._config.buttons];
        buttons[index] = value;
        this._commit({ ...this._config, buttons });
      });
      slot.replaceChildren(editor);
    });
  }

  /** The fallback, and what is shown while the real editor loads. */
  _conditionsNote(button) {
    const conditions = normalizeVisibility(button.visibility ?? button.conditions);
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent =
      conditions.length > 0
        ? `${conditions.length} condition${conditions.length === 1 ? '' : 's'} set, kept as ` +
          'written. They can be edited in YAML.'
        : 'Always visible. Conditions can be added in YAML (visibility:).';
    return note;
  }

  async _mountConditionsEditor(slot, index) {
    const available = await ensureConditionsEditor();
    // The page may have changed while we waited.
    if (!available || !slot.isConnected || this._openButton !== index) return;

    const button = this._config.buttons[index];
    if (!button) return;

    const editor = document.createElement(CONDITIONS_TAG);
    editor.hass = this._hass;
    editor.conditions = normalizeVisibility(button.visibility ?? button.conditions);
    editor.addEventListener('value-changed', (event) => {
      event.stopPropagation();
      // Accept either shape rather than betting on one.
      const detail = event.detail || {};
      const next = Array.isArray(detail.value)
        ? detail.value
        : Array.isArray(detail.conditions)
          ? detail.conditions
          : null;
      if (next) this._conditionsChanged(index, next);
    });

    slot.replaceChildren(
      Object.assign(document.createElement('div'), {
        className: 'heading',
        textContent: 'Visibility',
      }),
      editor,
    );
  }

  _conditionsChanged(index, conditions) {
    const buttons = [...this._config.buttons];
    const next = { ...buttons[index] };
    // An empty list is the absence of conditions, not a condition of its own.
    if (conditions.length > 0) next.visibility = conditions;
    else delete next.visibility;
    delete next.conditions; // never keep both spellings
    buttons[index] = next;
    this._commit({ ...this._config, buttons });
  }

  _createForm(schema, data, onChange) {
    const form = document.createElement('ha-form');
    // computeLabel first: assigning data is what triggers the first render, and
    // a form rendered before it would show raw config keys as labels.
    form.computeLabel = (item) => LABELS[item.name] || item.title || item.name;
    form.hass = this._hass;
    form.schema = schema;
    form.data = data;
    form.addEventListener('value-changed', (event) => {
      event.stopPropagation();
      onChange(event.detail.value);
    });
    return form;
  }

  _updateFormData() {
    if (!this._form) return;
    if (this._openButton === null) {
      this._form.data = this._cardFormData();
    } else {
      this._form.data = this._buttonFormData(this._config.buttons[this._openButton] || {});
    }
  }

  /* --- data in and out -------------------------------------------------- */

  /** Defaults are shown as current values, so no control looks empty. */
  _cardFormData() {
    const config = this._config;
    return {
      title: config.title ?? '',
      layout: { ...DEFAULT_LAYOUT, ...(config.layout || {}) },
      appearance: { ...DEFAULT_APPEARANCE, ...(config.appearance || {}) },
      button: { ...DEFAULT_BUTTON, ...(config.button || {}) },
      animation: { ...DEFAULT_ANIMATION, ...(config.animation || {}) },
    };
  }

  _cardFormChanged(value) {
    const pruned = pruneDefaults(
      {
        title: value.title,
        layout: value.layout,
        appearance: value.appearance,
        button: value.button,
        animation: value.animation,
      },
      {
        title: '',
        layout: DEFAULT_LAYOUT,
        appearance: DEFAULT_APPEARANCE,
        button: DEFAULT_BUTTON,
        animation: DEFAULT_ANIMATION,
      },
    );
    this._commit(mergeOwnedKeys(this._config, CARD_FORM_KEYS, pruned));
  }

  _buttonFormData(button) {
    return {
      entity: button.entity ?? '',
      name: button.name ?? '',
      icon: typeof button.icon === 'string' ? button.icon : '',
      colspan: button.colspan ?? 1,
      label: button.label ?? '',
      state_display: button.state_display ?? '',
      icon_size: toNumber(button.icon_size ?? (this._config.button || {}).icon_size, undefined),
      icon_color: button.icon_color ?? '',
      active_color: button.active_color ?? '',
      background: button.background ?? '',
      active_background: button.active_background ?? '',
      style: button.style ?? '',
      show_name: button.show_name ?? true,
      show_state: showStateToForm(button.show_state),
      confirmation: button.confirmation === true || (button.confirmation && typeof button.confirmation === 'object'),
      tap_action: button.tap_action,
      hold_action: button.hold_action,
      double_tap_action: button.double_tap_action,
      animation: { ...DEFAULT_ANIMATION, ...(this._config.animation || {}), ...(button.animation || {}) },
    };
  }

  _buttonFormChanged(value) {
    const index = this._openButton;
    const previous = this._config.buttons[index] || {};

    const next = pruneDefaults(
      {
        entity: value.entity,
        name: value.name,
        icon: value.icon,
        colspan: value.colspan,
        label: value.label,
        state_display: value.state_display,
        icon_size: value.icon_size,
        icon_color: value.icon_color,
        active_color: value.active_color,
        background: value.background,
        active_background: value.active_background,
        style: value.style,
        show_name: value.show_name,
        show_state: showStateFromForm(value.show_state),
        confirmation: value.confirmation,
        tap_action: value.tap_action,
        hold_action: value.hold_action,
        double_tap_action: value.double_tap_action,
        animation: value.animation,
      },
      {
        colspan: 1,
        show_name: true,
        show_state: 'auto',
        confirmation: false,
        icon_size: toNumber((this._config.button || {}).icon_size, undefined),
        icon_color: (this._config.button || {}).icon_color,
        active_color: (this._config.button || {}).active_color,
        // Inherited from the card, so only a genuine deviation is written out.
        animation: { ...DEFAULT_ANIMATION, ...(this._config.animation || {}) },
      },
    );

    // Anything the form does not model - visibility conditions above all -
    // is carried through by mergeOwnedKeys rather than listed here.
    const merged = mergeOwnedKeys(previous, BUTTON_FORM_KEYS, next);

    // An icon given as a state map is not editable in the form; keep it rather
    // than letting the text field overwrite it with a blank.
    if (previous.icon && typeof previous.icon === 'object' && !value.icon) {
      merged.icon = previous.icon;
    }

    const buttons = [...this._config.buttons];
    buttons[index] = merged;
    this._commit({ ...this._config, buttons });
  }

  /* --- list operations -------------------------------------------------- */

  _addButton() {
    const buttons = [...this._config.buttons, { name: `Button ${this._config.buttons.length + 1}` }];
    this._commit({ ...this._config, buttons });
    this._openButton = buttons.length - 1;
    this._render();
  }

  _deleteButton(index) {
    const buttons = this._config.buttons.filter((_, i) => i !== index);
    this._commit({ ...this._config, buttons });
    this._renderedPage = undefined; // the list changed, rebuild it
    this._render();
  }

  _moveButton(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= this._config.buttons.length) return;
    const buttons = [...this._config.buttons];
    [buttons[index], buttons[target]] = [buttons[target], buttons[index]];
    this._commit({ ...this._config, buttons });
    this._renderedPage = undefined;
    this._render();
  }

  /* --- output ----------------------------------------------------------- */

  _commit(config) {
    const next = { type: `custom:${CARD_TAG}`, ...config };
    this._config = next;
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        bubbles: true,
        composed: true,
        detail: { config: next },
      }),
    );
  }
}

const EDITOR_STYLES = `
:host { display: block; }

.conditions { margin-top: 18px; }
.conditions .heading { margin-bottom: 6px; }

.note {
  margin: 4px 4px 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--secondary-text-color);
}

ha-form { display: block; }

.list { margin-top: 18px; }

.heading {
  font-size: 15px;
  font-weight: 500;
  margin: 0 0 8px 4px;
  color: var(--primary-text-color);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 4px 4px 10px;
  border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
  border-radius: 10px;
  margin-bottom: 6px;
  background: var(--card-background-color);
}

.row-icon {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: var(--secondary-text-color);
  --mdc-icon-size: 22px;
}

.row-label {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  background: none;
  border: 0;
  padding: 6px 4px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  color: inherit;
}
.row-label:hover .row-name { text-decoration: underline; }

.row-name {
  font-size: 14px;
  color: var(--primary-text-color);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-entity {
  font-size: 12px;
  color: var(--secondary-text-color);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  --mdc-icon-button-size: 36px;
  --mdc-icon-size: 20px;
  color: var(--secondary-text-color);
}
.row-actions ha-icon-button[disabled] { opacity: 0.3; pointer-events: none; }
.row-actions ha-icon,
.header ha-icon {
  display: flex;
  width: 20px;
  height: 20px;
  cursor: pointer;
}

.add {
  width: 100%;
  margin-top: 4px;
  padding: 10px;
  border: 1px dashed var(--divider-color, rgba(127, 127, 127, 0.4));
  border-radius: 10px;
  background: none;
  color: var(--primary-color);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
}
.add:hover { background: rgba(127, 127, 127, 0.08); }

.empty {
  font-size: 13px;
  color: var(--error-color, #ff5f56);
  margin: 0 0 8px 4px;
}

.header {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
  --mdc-icon-button-size: 40px;
  --mdc-icon-size: 22px;
  color: var(--primary-text-color);
}

.header .yaml-toggle { margin-left: auto; }

.yaml { margin-top: 4px; }
.yaml ha-yaml-editor { display: block; }

.header-title {
  font-size: 16px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
`;

/* -------------------------------------------------------------------------- */
/* 10. Registration                                                            */
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
/**
 * @param announce Set on the card only. The editor would otherwise repeat the
 *   same message and bury it.
 */
function defineOnce(tag, element, announce = false) {
  if (customElements.get(tag)) {
    if (announce) {
      console.warn(
        `[${tag}] is already registered, so this copy does nothing. You very ` +
          `likely have two Lovelace resource entries pointing at this card. ` +
          `Keep one under Settings > Dashboards > Resources and edit its ?v= ` +
          `instead of adding a second entry -- otherwise whichever copy loads ` +
          `first wins, and an update looks like it changed nothing.`,
      );
    }
    return;
  }
  customElements.define(tag, element);
}

const inBrowser = typeof window !== 'undefined' && typeof customElements !== 'undefined';

if (inBrowser) {
  defineOnce(CARD_TAG, MultiButtonCard, true);
  defineOnce(EDITOR_TAG, MultiButtonCardEditor);
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

export { CARD_VERSION, CARD_TAG, REPO_URL, MultiButtonCard, renderTemplate, hasTemplate, templateContext, mergeOwnedKeys, CARD_FORM_KEYS, BUTTON_FORM_KEYS, isVisible, conditionMet, collectMediaQueries, MultiButtonCardEditor, pruneDefaults, computeGridOptions, computeContentHeight, partitionRows, computeColumns, computeCellHeight, normalizeConfig, animationActive };
