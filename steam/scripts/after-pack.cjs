// Linux: Steam launches `popscotch`, a script that starts the real binary with --no-sandbox.
// Chromium forks its sandboxed zygote before main.js runs, so the switch can't be set from code,
// and Steam's Linux runtime container allows neither the setuid nor the namespace sandbox.
const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER = 'popscotch';

exports.default = async function afterPack({ electronPlatformName, appOutDir, packager }) {
  if (electronPlatformName !== 'linux') return;
  const binary = packager.executableName;
  const script = `#!/bin/sh\nhere="$(dirname "$(readlink -f "$0")")"\nexec "$here/${binary}" --no-sandbox "$@"\n`;
  fs.writeFileSync(path.join(appOutDir, LAUNCHER), script, { mode: 0o755 });
  // Unused without the setuid sandbox, and Steam depots don't keep setuid bits anyway.
  fs.rmSync(path.join(appOutDir, 'chrome-sandbox'), { force: true });
};
