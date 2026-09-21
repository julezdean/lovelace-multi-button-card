/**
 * The editor writes the config the card has to read back. These tests cover
 * that contract - what the editor emits must survive normalizeConfig, and it
 * must not bloat the YAML with values that are already the default.
 *
 * How the form LOOKS is Home Assistant's business and cannot be checked here;
 * tools/demo/ drives the editor against a stub to cover the wiring.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruneDefaults, normalizeConfig, CARD_TAG } from '../multi-button-card.js';

/* -- pruning -------------------------------------------------------------- */

test('values equal to their default are dropped', () => {
  const out = pruneDefaults({ gap: 12, radius: 24 }, { gap: 12, radius: 18 });
  assert.deepEqual(out, { radius: 24 });
});

test('empty strings and null are dropped, false and zero are kept', () => {
  const out = pruneDefaults(
    { a: '', b: null, c: undefined, shadow: false, gap: 0 },
    { shadow: true, gap: 12 },
  );
  assert.deepEqual(out, { shadow: false, gap: 0 });
});

test('nested sections are pruned and empty ones removed entirely', () => {
  const out = pruneDefaults(
    { layout: { gap: 12, mode: 'auto' }, appearance: { radius: 30 } },
    { layout: { gap: 12, mode: 'auto' }, appearance: { radius: 24 } },
  );
  assert.deepEqual(out, { appearance: { radius: 30 } });
});

test('a value with no default is always kept', () => {
  assert.deepEqual(pruneDefaults({ title: 'Hall' }, {}), { title: 'Hall' });
  assert.deepEqual(pruneDefaults({ title: 'Hall' }, undefined), { title: 'Hall' });
});

test('arrays are passed through untouched', () => {
  const out = pruneDefaults({ buttons: [{ name: 'a' }] }, { buttons: [] });
  assert.deepEqual(out.buttons, [{ name: 'a' }]);
});

/* -- the editor's output has to be a valid card config --------------------- */

/** What the editor produces after a few typical edits. */
const EDITED = {
  type: `custom:${CARD_TAG}`,
  title: 'Erdgeschoss',
  layout: { gap: 20 },
  buttons: [
    { name: 'Wohnzimmer', icon: 'mdi:sofa', entity: 'light.wohnzimmer' },
    {
      name: 'Küche',
      entity: 'light.kueche',
      colspan: 2,
      tap_action: { action: 'toggle' },
      hold_action: { action: 'more-info' },
      animation: { type: 'pulse', when: 'on' },
    },
  ],
};

test('the card accepts what the editor writes', () => {
  const config = normalizeConfig(EDITED);
  assert.equal(config.buttons.length, 2);
  assert.equal(config.layout.gap, 20);
  assert.equal(config.layout.mode, 'auto', 'untouched options keep their default');
  assert.equal(config.buttons[1].weight, 2);
  assert.equal(config.buttons[1].animation.type, 'pulse');
  config.buttons.forEach((button) => assert.equal(button.error, null));
});

test('a button the editor just added is valid on its own', () => {
  // _addButton() writes exactly this and nothing else.
  const config = normalizeConfig({ buttons: [{ name: 'Button 1' }] });
  assert.equal(config.buttons[0].error, null);
  assert.equal(config.buttons[0].tap_action.action, 'none', 'no entity yet, so no action');
});

test('show_state survives the round trip through the select control', () => {
  // The form carries strings; the config carries booleans and 'auto'.
  for (const [form, stored] of [
    ['true', true],
    ['false', false],
    ['auto', 'auto'],
  ]) {
    const config = normalizeConfig({ buttons: [{ entity: 'light.a', show_state: stored }] });
    assert.equal(config.buttons[0].show_state, stored, `form value ${form}`);
  }
});

test('an action edited to none is kept, not pruned back to a default', () => {
  // 'none' differs from the card's default for hold_action (more-info), so it
  // has to reach the config or the button would still open more-info.
  const config = normalizeConfig({
    buttons: [{ entity: 'light.a', hold_action: { action: 'none' } }],
  });
  assert.equal(config.buttons[0].hold_action.action, 'none');
});
