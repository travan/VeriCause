const { readFileSync, appendFileSync } = require('node:fs');

function validateVersion(pkg, lock, ref) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(pkg.version)) {
    throw new Error('This workflow publishes stable x.y.z versions only.');
  }
  if (pkg.private || pkg.version !== lock.version ||
      pkg.version !== lock.packages?.['']?.version || pkg.name !== lock.name ||
      pkg.name !== lock.packages?.['']?.name) {
    throw new Error('Package and lockfile release metadata must match and be public.');
  }
  if (ref.startsWith('refs/tags/') && ref !== `refs/tags/v${pkg.version}`) {
    throw new Error('Release tag must exactly match package.json version.');
  }
}

async function shouldPublish(pkg, fetchRegistry = fetch) {
  const response = await fetchRegistry(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) return true;
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}`);
  const metadata = await response.json();
  if (!metadata.versions || !metadata['dist-tags']) throw new Error('Invalid npm registry metadata.');
  if (Object.hasOwn(metadata.versions, pkg.version)) return false;
  const latest = metadata['dist-tags'].latest;
  if (latest) {
    if (!/^\d+\.\d+\.\d+$/.test(latest)) throw new Error('Cannot compare npm latest version.');
    const nextParts = pkg.version.split('.').map(BigInt);
    const latestParts = latest.split('.').map(BigInt);
    const difference = nextParts.map((part, i) => part - latestParts[i]).find(part => part !== 0n);
    if (difference === undefined || difference < 0n) {
      throw new Error('New release must be newer than npm latest.');
    }
  }
  return true;
}

async function main() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  validateVersion(pkg, lock, process.env.GITHUB_REF || '');
  const publish = await shouldPublish(pkg);
  const output = `publish=${publish}\nversion=${pkg.version}\n`;
  console.log(`${pkg.name}@${pkg.version}: ${publish ? 'ready to validate and publish' : 'already published; skipping'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
}

module.exports = { validateVersion, shouldPublish };
if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
