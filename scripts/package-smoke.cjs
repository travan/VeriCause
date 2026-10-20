const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { execFileSync } = require('node:child_process');

assert.ok(process.argv[2], 'Pass the isolated consumer directory.');
const installed = resolve(process.argv[2], 'node_modules/ai-reliability-runtime');
const expected = require('../package.json');
const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
assert.equal(pkg.name, expected.name);
assert.equal(pkg.version, expected.version);
assert.match(readFileSync(join(installed, 'LICENSE'), 'utf8'), /MIT License/);
assert.ok(readFileSync(join(installed, pkg.types), 'utf8').length);
assert.equal(typeof require(installed).createCoreRuntime, 'function');
const result = JSON.parse(execFileSync(process.execPath, [
  join(installed, pkg.bin['ai-reliability-runtime']), 'demo', '--json',
], { cwd: resolve(process.argv[2]), encoding: 'utf8' }));
assert.deepEqual(result.results.map(item => item.coreVerdict.status), [
  'supported', 'contradicted', 'inconclusive',
]);
assert.deepEqual(result.results.map(item => item.decision.action), ['allow', 'block', 'escalate']);
console.log(`${pkg.name}@${pkg.version}: isolated SDK and CLI smoke passed.`);
