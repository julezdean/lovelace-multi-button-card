/**
 * The card is a list of typed items. An item without `type:` is a button,
 * `buttons:` is the spelling from before there were types, and the cell every
 * item sits in is configured in `item:` - with a type's own defaults block and
 * the item itself overriding it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeConfig, cardFormData, cardFormToConfig, CARD_TAG } from '../src/main.ts';

const one = (item, extra = {}) => normalizeConfig({ items: [item], ...extra }).items[0];

/* -- the list ---------------------------------------------------------------- */

test('items and buttons are the same list', () => {
  const a = normalizeConfig({ items: [{ entity: 'light.a' }] });
  const b = normalizeConfig({ buttons: [{ entity: 'light.a' }] });
  assert.deepEqual(a, b);
});

test('giving both spellings is an error, not a silent choice', () => {
  assert.throws(
    () => normalizeConfig({ items: [{}], buttons: [{}] }),
    /"items" and "buttons"/,
  );
});

test('an item without a type is a button', () => {
  assert.equal(one({ entity: 'light.a' }).type, 'button');
  assert.equal(one({ type: 'button', entity: 'light.a' }).type, 'button');
});

test('an unknown type costs its own cell, not the card', () => {
  const config = normalizeConfig({ items: [{ type: 'gauge' }, { entity: 'light.a' }] });
  assert.equal(config.items.length, 2);
  assert.match(config.items[0].error, /Unknown item type "gauge"/);
  assert.equal(config.items[0].tap_action.action, 'none');
  assert.equal(config.items[1].error, null);
});

test('an unknown type keeps the placement it was given', () => {
  const item = one({ type: 'gauge', colspan: 2 });
  assert.equal(item.weight, 2);
});

/* -- the cell ---------------------------------------------------------------- */

test('item: sets the cell for every item', () => {
  const item = one({}, { item: { radius: 8, active_color: 'red', press_effect: 'fade' } });
  assert.equal(item.radius, 8);
  assert.equal(item.active_color, 'red');
  assert.equal(item.press_effect, 'fade');
});

test('without item:, the cell keeps the defaults it always had', () => {
  const item = one({});
  assert.equal(item.radius, 18);
  assert.equal(item.press_effect, 'scale');
  assert.equal(item.background, null);
});

test('a type block beats item:, and the item beats both', () => {
  const extra = { item: { radius: 8 }, button: { radius: 12 } };
  assert.equal(one({}, extra).radius, 12, 'button: over item:');
  assert.equal(one({ radius: 4 }, extra).radius, 4, 'the item over button:');
});

test('cell keys an older config keeps under button: still apply', () => {
  const item = one({}, { button: { radius: 24, background: '#222', label_size: 15 } });
  assert.equal(item.radius, 24);
  assert.equal(item.background, '#222');
  assert.equal(item.label_size, 15);
});

test('button-only defaults stay in button:', () => {
  const item = one({}, { button: { layout: 'horizontal', show_name: false } });
  assert.equal(item.layout, 'horizontal');
  assert.equal(item.show_name, false);
});

test('a template in a cell field marks the item as templated', () => {
  assert.equal(one({ background: '[[[ return "red" ]]]' }).hasTemplates, true);
  assert.equal(one({ background: 'red' }).hasTemplates, false);
});

/* -- the editor's card page ------------------------------------------------ */

test('the item section shows cell keys from button:, which win as in the card', () => {
  const data = cardFormData({ item: { radius: 8 }, button: { radius: 12, layout: 'horizontal' } });
  assert.equal(data.item.radius, 12);
  assert.equal(data.button.layout, 'horizontal');
  assert.equal('radius' in data.button, false, 'the button section does not own radius');
});

test('an edit moves cell keys from button: to item:', () => {
  const config = { type: `custom:${CARD_TAG}`, button: { radius: 12, layout: 'horizontal' }, items: [{}] };
  const value = cardFormData(config);
  const next = cardFormToConfig(config, value);

  assert.deepEqual(next.item, { radius: 12 });
  assert.deepEqual(next.button, { layout: 'horizontal' });
  assert.deepEqual(next.items, [{}], 'the list is not the form’s business');
  assert.equal(normalizeConfig(next).items[0].radius, 12, 'and it still means the same');
});

test('an untouched card page writes nothing', () => {
  const config = { type: `custom:${CARD_TAG}`, items: [{}] };
  const next = cardFormToConfig(config, cardFormData(config));
  assert.deepEqual(next, config);
});
