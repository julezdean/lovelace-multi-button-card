/**
 * Confirmation is settable per gesture. The card reads it from the action,
 * the way Home Assistant's own action grammar has it, and still honours the
 * older button-level key for the tap. The editor shows it as a switch per
 * action but must store it on the action.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConfig,
  actionToForm,
  actionFromForm,
  confirmationFromConfig,
} from '../multi-button-card.js';

const only = (button) => normalizeConfig({ buttons: [button] }).buttons[0];

/* -- the card ------------------------------------------------------------- */

test('no confirmation unless asked for', () => {
  assert.deepEqual(only({ entity: 'light.a' }).confirmation, { tap: null, hold: null, double_tap: null });
});

test('the button-level key still means the tap, and only the tap', () => {
  assert.deepEqual(only({ entity: 'light.a', confirmation: true }).confirmation, {
    tap: { text: null },
    hold: null,
    double_tap: null,
  });
  assert.equal(only({ entity: 'light.a', confirmation: { text: 'Sicher?' } }).confirmation.tap.text, 'Sicher?');
});

test('each action can ask for its own confirmation', () => {
  const button = only({
    entity: 'light.a',
    hold_action: { action: 'toggle', confirmation: { text: 'Nochmal halten' } },
    double_tap_action: { action: 'toggle', confirmation: true },
  });
  assert.equal(button.confirmation.tap, null);
  assert.deepEqual(button.confirmation.hold, { text: 'Nochmal halten' });
  assert.deepEqual(button.confirmation.double_tap, { text: null });
});

test('confirmation on an action without action: survives the default being filled in', () => {
  // The default tap action is rebuilt from the entity; the confirmation must
  // not be lost in that step.
  const button = only({ entity: 'light.a', tap_action: { confirmation: true } });
  assert.equal(button.tap_action.action, 'toggle');
  assert.deepEqual(button.confirmation.tap, { text: null });
});

test('an explicit false on the tap action overrides the button-level key', () => {
  const button = only({ entity: 'light.a', confirmation: true, tap_action: { action: 'toggle', confirmation: false } });
  assert.equal(button.confirmation.tap, null);
});

/* -- the editor ----------------------------------------------------------- */

test('the action picker never sees the confirmation key', () => {
  assert.deepEqual(actionToForm({ action: 'toggle', confirmation: true }), { action: 'toggle' });
  assert.equal(actionToForm({ confirmation: true }), undefined, 'nothing left means no action set');
  assert.equal(actionToForm(undefined), undefined);
});

test('switching confirmation on writes it onto the action', () => {
  assert.deepEqual(actionFromForm({ action: 'toggle' }, true), { action: 'toggle', confirmation: true });
  assert.deepEqual(actionFromForm(undefined, true), { confirmation: true }, 'default action, confirmed');
  assert.deepEqual(actionFromForm('toggle', true), { action: 'toggle', confirmation: true });
});

test('switching it off removes the key, and a custom text is kept while on', () => {
  assert.deepEqual(actionFromForm({ action: 'toggle', confirmation: true }, false), { action: 'toggle' });
  assert.deepEqual(actionFromForm({ action: 'toggle' }, true, { text: 'Sicher?' }), {
    action: 'toggle',
    confirmation: { text: 'Sicher?' },
  });
});

test('the editor reads the old button-level key as the tap switch', () => {
  assert.equal(confirmationFromConfig({ confirmation: true }, 'tap'), true);
  assert.equal(confirmationFromConfig({ confirmation: true }, 'hold'), undefined);
  assert.equal(confirmationFromConfig({ hold_action: { action: 'toggle', confirmation: true } }, 'hold'), true);
});

test('what the editor writes means the same to the card', () => {
  // Migrating an old config: button-level text moves to the tap action.
  const old = { entity: 'light.a', confirmation: { text: 'Sicher?' } };
  const tap = actionFromForm(actionToForm(old.tap_action), true, confirmationFromConfig(old, 'tap'));
  const migrated = { entity: 'light.a', tap_action: tap };
  assert.deepEqual(only(migrated).confirmation, only(old).confirmation);
});
