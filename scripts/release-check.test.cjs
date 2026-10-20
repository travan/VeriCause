const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateVersion, shouldPublish } = require('./release-check.cjs');

const pkg = { name: 'ai-reliability-runtime', version: '0.2.0' };
const lock = { ...pkg, packages: { '': pkg } };
const registry = (status, body) => async () => ({ status, ok: status === 200, json: async () => body });

test('release metadata and tag must agree', () => {
  assert.doesNotThrow(() => validateVersion(pkg, lock, 'refs/tags/v0.2.0'));
  assert.throws(() => validateVersion(pkg, lock, 'refs/tags/v0.1.0'));
  assert.throws(() => validateVersion(pkg, { ...lock, version: '0.1.0' }, 'refs/heads/main'));
  assert.throws(() => validateVersion({ ...pkg, private: true }, lock, ''));
  assert.throws(() => validateVersion({ ...pkg, version: '0.2.0-beta.1' }, lock, ''));
});

test('existing versions skip publication on rerun', async () => {
  assert.equal(await shouldPublish(pkg, registry(200, {
    versions: { '0.2.0': {} }, 'dist-tags': { latest: '0.2.0' },
  })), false);
});

test('newer and first releases can proceed', async () => {
  assert.equal(await shouldPublish(pkg, registry(200, {
    versions: { '0.1.0': {} }, 'dist-tags': { latest: '0.1.0' },
  })), true);
  assert.equal(await shouldPublish(pkg, registry(404)), true);
});

test('registry failures never authorize publication', async () => {
  await assert.rejects(shouldPublish(pkg, registry(503)));
  await assert.rejects(shouldPublish(pkg, registry(401)));
  await assert.rejects(shouldPublish(pkg, registry(200, {})));
  await assert.rejects(shouldPublish(pkg, async () => { throw new Error('network failure'); }));
});

test('an older release cannot overwrite the latest dist-tag', async () => {
  await assert.rejects(shouldPublish(pkg, registry(200, {
    versions: { '0.3.0': {} }, 'dist-tags': { latest: '0.3.0' },
  })));
});
