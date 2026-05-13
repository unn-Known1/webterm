const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CF_RELEASES = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

try {
  execSync('command -v cloudflared', { stdio: 'ignore' });
  process.exit(0);
} catch {}

const platform = os.platform();
const arch = os.arch();

const files = {
  linux:   { x64: 'cloudflared-linux-amd64', arm64: 'cloudflared-linux-arm64', arm: 'cloudflared-linux-arm' },
  darwin:  { x64: 'cloudflared-darwin-amd64.tgz', arm64: 'cloudflared-darwin-arm64.tgz' },
  win32:   { x64: 'cloudflared-windows-amd64.exe' }
};

const file = (files[platform] || {})[arch];
if (!file) process.exit(0);

console.log('  installing cloudflared...');

const url = CF_RELEASES + '/' + file;
const tmp = path.join(os.tmpdir(), 'cloudflared' + (platform === 'win32' ? '.exe' : ''));

function download() {
  const r = spawnSync('curl', ['-#fL', url, '-o', tmp], { stdio: 'inherit', timeout: 30000 });
  if (r.status === 0) return true;
  const r2 = spawnSync('wget', ['-q', url, '-O', tmp], { stdio: 'inherit', timeout: 30000 });
  return r2.status === 0;
}

if (!download()) {
  console.log('  cloudflared install failed (download error)');
  process.exit(0);
}

try {
  if (platform === 'darwin') {
    spawnSync('tar', ['xzf', tmp, '-C', '/tmp'], { stdio: 'inherit' });
    fs.renameSync('/tmp/cloudflared', '/usr/local/bin/cloudflared');
    fs.chmodSync('/usr/local/bin/cloudflared', 0o755);
    fs.unlinkSync(tmp);
  } else if (platform === 'win32') {
    const dest = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'cloudflared', 'cloudflared.exe');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(tmp, dest);
    fs.unlinkSync(tmp);
  } else {
    fs.renameSync(tmp, '/usr/local/bin/cloudflared');
    fs.chmodSync('/usr/local/bin/cloudflared', 0o755);
  }
  console.log('  cloudflared installed');
} catch (e) {
  console.log('  cloudflared install skipped: ' + e.message);
}
