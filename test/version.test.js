/**
 * A single-file card has no build step, so the version lives in two places:
 * CARD_VERSION in the card itself (which is what the browser console reports
 * and therefore how anyone diagnoses which copy is loaded) and "version" in
 * package.json (which is what the release tag is checked against).
 *
 * They must agree. A tag is spent once pushed, so this has to fail here rather
 * than after someone installs a card that lies about its version.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_VERSION, CARD_TAG, REPO_URL } from '../multi-button-card.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('CARD_VERSION and package.json agree', () => {
  assert.equal(
    CARD_VERSION,
    pkg.version,
    `card says ${CARD_VERSION}, package.json says ${pkg.version}`,
  );
});

test('the card tag matches the file it ships as', () => {
  assert.equal(pkg.main, `${CARD_TAG}.js`);
  assert.deepEqual(pkg.files, [`${CARD_TAG}.js`]);
});

test('hacs.json points at the file that actually exists', () => {
  const hacs = JSON.parse(readFileSync(new URL('../hacs.json', import.meta.url), 'utf8'));
  assert.equal(hacs.filename, `${CARD_TAG}.js`);
  readFileSync(new URL(`../${hacs.filename}`, import.meta.url)); // throws if missing
});

test('the repository URL is consistent across the card and package.json', () => {
  assert.equal(pkg.homepage, `${REPO_URL}#readme`);
  assert.equal(pkg.repository.url, `git+${REPO_URL}.git`);
  assert.equal(pkg.bugs.url, `${REPO_URL}/issues`);
});

test('the README documents the version the card reports', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(
    readme.includes(`v${CARD_VERSION}`),
    `README does not mention v${CARD_VERSION} - the install check is stale`,
  );
});
