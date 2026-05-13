require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mime = require('mime-types');
const archiver = require('archiver');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;
const PIN = process.env.PIN || '';
const SHELL = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : (fs.existsSync('/bin/bash') ? '/bin/bash' : 'sh'));
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth ──────────────────────────────────────────────────────────────
function checkPin(req, res, next) {
  if (!PIN) return next();
  const token = req.headers['x-pin-token'] || req.query.token;
  if (token === PIN) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/auth/required', (req, res) => {
  res.json({ required: !!PIN });
});

app.post('/api/auth', (req, res) => {
  const { pin } = req.body;
  if (!PIN || pin === PIN) {
    res.json({ success: true, token: PIN || 'open' });
  } else {
    res.status(401).json({ error: 'Invalid PIN' });
  }
});

// ── System info ───────────────────────────────────────────────────────
app.get('/api/home', checkPin, (req, res) => {
  res.json({ home: os.homedir(), hostname: os.hostname(), platform: os.platform() });
});

// ── File API ──────────────────────────────────────────────────────────
function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

app.get('/api/files', checkPin, (req, res) => {
  const dir = path.resolve(req.query.path || os.homedir());
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .map(e => {
        const full = path.join(dir, e.name);
        const st = safeStat(full);
        return {
          name: e.name,
          path: full,
          isDir: e.isDirectory(),
          isSymlink: e.isSymbolicLink(),
          size: st ? st.size : 0,
          modified: st ? st.mtime : null,
          ext: path.extname(e.name).toLowerCase()
        };
      })
      .sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    res.json({ path: dir, parent: path.dirname(dir), files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/rename', checkPin, (req, res) => {
  const { oldPath, newName } = req.body;
  const newPath = path.join(path.dirname(oldPath), newName);
  try {
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, newPath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/files', checkPin, (req, res) => {
  const p = req.query.path;
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      fs.rmSync(p, { recursive: true, force: true });
    } else {
      fs.unlinkSync(p);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/mkdir', checkPin, (req, res) => {
  try {
    fs.mkdirSync(req.body.path, { recursive: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/touch', checkPin, (req, res) => {
  try {
    fs.writeFileSync(req.body.path, '', { flag: 'a' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/read', checkPin, (req, res) => {
  try {
    const content = fs.readFileSync(req.query.path, 'utf8');
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/files/write', checkPin, (req, res) => {
  try {
    fs.writeFileSync(req.body.path, req.body.content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/files/download', checkPin, (req, res) => {
  const p = req.query.path;
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(p)}.zip"`);
      const archive = archiver('zip', { zlib: { level: 6 } });
      archive.on('error', err => { res.status(500).json({ error: err.message }); });
      archive.pipe(res);
      archive.directory(p, path.basename(p));
      archive.finalize();
    } else {
      const mimeType = mime.lookup(p) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(p)}"`);
      fs.createReadStream(p).pipe(res);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Upload with multer disk storage – destination resolved per-request
app.post('/api/files/upload', checkPin, (req, res) => {
  const destDir = req.query.path || os.homedir();
  const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, destDir),
    filename: (_, file, cb) => cb(null, file.originalname)
  });
  const upload = multer({ storage }).array('files');
  upload(req, res, err => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, count: req.files.length });
  });
});

// ── Session persistence via tmux ──────────────────────────────────────
// PATCHED: added `spawn` to child_process imports
const { execSync, execFileSync, spawn } = require('child_process');

const TMUX = (() => { try { return execSync('command -v tmux', { stdio: ['ignore','pipe','ignore'] }).toString().trim(); } catch { return null; } })();

function tmuxSessionExists(name) {
  try { execFileSync(TMUX, ['has-session', '-t', name], { stdio: 'ignore' }); return true; } catch { return false; }
}

// List all webterm-managed tmux sessions: returns [{id, title}]
app.get('/api/sessions', checkPin, (req, res) => {
  if (!TMUX) return res.json({ tmux: false, sessions: [] });
  try {
    const out = execFileSync(TMUX, ['list-sessions', '-F', '#{session_name}'], { encoding: 'utf8' }).trim();
    const sessions = out.split('\n')
      .filter(s => s.startsWith('wt-'))
      .map(s => ({ id: s.replace(/^wt-/, ''), name: s }));
    res.json({ tmux: true, sessions });
  } catch {
    res.json({ tmux: true, sessions: [] });
  }
});

app.delete('/api/sessions/:id', checkPin, (req, res) => {
  if (!TMUX) return res.json({ success: false });
  const name = 'wt-' + req.params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  try { execFileSync(TMUX, ['kill-session', '-t', name], { stdio: 'ignore' }); } catch {}
  res.json({ success: true });
});

// ── WebSocket terminal ────────────────────────────────────────────────
// Binary protocol (fast, no JSON per keystroke):
//   Server → Client:  [type:1B][payload]
//     0x00 = terminal data (UTF-8)
//     0x01 = exit          (1B exit code)
//     0x02 = error         (UTF-8 message)
//   Client → Server:
//     0x00 = input         (UTF-8)
//     0x01 = resize        (4B: cols uint16LE, rows uint16LE)
//     0x02 = ping          (no payload)

wss.on('connection', (ws, req) => {
  const url   = new URL(req.url, `http://localhost`);
  const token = url.searchParams.get('token');

  if (PIN && token !== PIN) { ws.close(1008, 'Unauthorized'); return; }

  const cols      = parseInt(url.searchParams.get('cols'))  || 80;
  const rows      = parseInt(url.searchParams.get('rows'))  || 24;
  const cwd       = url.searchParams.get('cwd')             || os.homedir();
  const sessionId = (url.searchParams.get('session') || '').replace(/[^a-zA-Z0-9_-]/g, '');

  const send = (type, payload) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const buf = Buffer.isBuffer(payload)
      ? Buffer.concat([Buffer.from([type]), payload])
      : Buffer.from(String.fromCharCode(type) + (payload || ''));
    ws.send(buf);
  };

  let proc;
  try {
    if (TMUX && sessionId) {
      // ── tmux mode: attach or create ──────────────────────────────
      const tmuxName = 'wt-' + sessionId;
      const exists   = tmuxSessionExists(tmuxName);

      if (exists) {
        // Resize existing session first
        try { execFileSync(TMUX, ['resize-window', '-t', tmuxName, '-x', String(cols), '-y', String(rows)], { stdio: 'ignore' }); } catch {}
        proc = pty.spawn(TMUX, ['attach-session', '-t', tmuxName], {
          name: 'xterm-256color', cols, rows, cwd,
          env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
        });
      } else {
        proc = pty.spawn(TMUX, ['new-session', '-s', tmuxName], {
          name: 'xterm-256color', cols, rows, cwd,
          env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', SHELL }
        });
      }
    } else {
      // ── plain shell (no tmux / no session id) ───────────────────
      proc = pty.spawn(SHELL, [], {
        name: 'xterm-256color', cols, rows, cwd,
        env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
      });
    }
  } catch (e) {
    send(0x02, `Failed to spawn shell: ${e.message}\r\n`);
    ws.close();
    return;
  }

  proc.onData(data => send(0x00, data));

  proc.onExit(() => {
    // In tmux mode: detaching is an "exit" but the session lives on.
    // Only send exit signal for plain shells.
    if (!TMUX || !sessionId) send(0x01, Buffer.from([0]));
    ws.close();
  });

  // Server-side keepalive ping every 30s
  ws.isAlive = true;
  const pingInterval = setInterval(() => {
    if (!ws.isAlive) { clearInterval(pingInterval); ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping();
  }, 30000);
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    try {
      const buf  = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const type = buf[0];
      if (type === 0x00) {
        proc.write(buf.slice(1).toString('utf8'));
      } else if (type === 0x01 && buf.length >= 5) {
        const c = buf.readUInt16LE(1), r = buf.readUInt16LE(3);
        proc.resize(Math.max(2, c), Math.max(2, r));
        // Also resize the tmux window so it matches
        if (TMUX && sessionId) {
          try { execFileSync(TMUX, ['resize-window', '-t', 'wt-' + sessionId, '-x', String(c), '-y', String(r)], { stdio: 'ignore' }); } catch {}
        }
      }
      // 0x02 client ping — no-op
    } catch {}
  });

  const cleanup = () => {
    clearInterval(pingInterval);
    // In tmux mode just kill the pty (the session stays alive in tmux).
    // In plain mode kill the shell process.
    try { proc.kill(); } catch {}
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

// ── MCP Exec API ──────────────────────────────────────────────────────
// Added for MCP server integration. Two endpoints:
//   POST /api/exec           – run command, wait, return full output (JSON)
//   GET  /api/exec/stream    – run command, stream output as SSE

// POST /api/exec
// Body: { command: string, cwd?: string, timeout?: number (ms, default 60000) }
// Response: { exitCode, stdout, stderr, duration }
app.post('/api/exec', checkPin, (req, res) => {
  const { command, cwd: reqCwd, timeout = 60000 } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });

  const execCwd = reqCwd || os.homedir();
  let stdout = '', stderr = '';
  const start = Date.now();

  const execShell = process.env.SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : 'sh');
  const proc = spawn(execShell, ['-c', command], {
    cwd: execCwd,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.on('data', d => { stdout += d.toString(); });
  proc.stderr.on('data', d => { stderr += d.toString(); });

  const timer = setTimeout(() => {
    try { proc.kill('SIGKILL'); } catch {}
    if (!res.headersSent)
      res.status(408).json({ error: 'timeout', stdout, stderr, duration: Date.now() - start });
  }, timeout);

  proc.on('close', code => {
    clearTimeout(timer);
    if (res.headersSent) return;
    res.json({ exitCode: code, stdout, stderr, duration: Date.now() - start });
  });

  proc.on('error', e => {
    clearTimeout(timer);
    if (res.headersSent) return;
    res.status(500).json({ error: e.message, stdout, stderr });
  });
});

// GET /api/exec/stream?command=<cmd>&cwd=<path>   (Server-Sent Events)
// Each SSE event: data: {"type":"stdout"|"stderr"|"exit"|"error","data":<string|number>}
// type=exit carries the numeric exit code; stream ends after it.
app.get('/api/exec/stream', checkPin, (req, res) => {
  const { command, cwd: reqCwd } = req.query;
  if (!command) { res.status(400).end('command required'); return; }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (type, data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  const execShell = process.env.SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : 'sh');
  const proc = spawn(execShell, ['-c', command], {
    cwd: reqCwd || os.homedir(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  proc.stdout.on('data', d => send('stdout', d.toString()));
  proc.stderr.on('data', d => send('stderr', d.toString()));

  proc.on('close', code => { send('exit', code); res.end(); });
  proc.on('error', e => { send('error', e.message); res.end(); });

  // Kill child if client disconnects
  req.on('close', () => { try { proc.kill(); } catch {} });
});

// ── File search (fuzzy finder) ──────────────────────────────────────
app.get('/api/search', checkPin, (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  const dir = req.query.path || os.homedir();
  if (!q || q.length < 1) return res.json({ results: [] });

  const maxResults = 50;
  const results = [];
  const maxDepth = 4;

  function walk(currentDir, depth) {
    if (depth > maxDepth || results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxResults) break;
      const full = path.join(currentDir, e.name);
      if (e.name.toLowerCase().includes(q)) {
        try {
          const st = fs.statSync(full);
          results.push({
            path: full, name: e.name,
            isDir: e.isDirectory(),
            dir: currentDir
          });
        } catch {}
      }
      if (e.isDirectory()) walk(full, depth + 1);
    }
  }

  try { walk(dir, 0); } catch {}

  res.json({ results });
});

// ── System stats ────────────────────────────────────────────────────
app.get('/api/system', checkPin, async (req, res) => {
  const { execSync } = require('child_process');
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 ? cpus[0].model : 'unknown';
  const cpuCount = cpus.length;
  const loadAvg = os.loadavg();

  let cpuUsage = 0;
  try {
    const readCpuTimes = () => {
      const line = fs.readFileSync('/proc/stat', 'utf8').split('\n').find(l => l.startsWith('cpu '));
      if (!line) return null;
      const parts = line.trim().split(/\s+/).slice(1).map(Number);
      return { total: parts.reduce((a, b) => a + b, 0), idle: parts[3] || 0 };
    };
    const t1 = readCpuTimes();
    await new Promise(r => setTimeout(r, 100));
    const t2 = readCpuTimes();
    if (t1 && t2) {
      const dTotal = t2.total - t1.total;
      const dIdle  = t2.idle  - t1.idle;
      cpuUsage = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 100) : 0;
    }
  } catch {}

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memPercent = Math.round((usedMem / totalMem) * 100);

  let disk = [];
  try {
    const dfOut = execSync('df -h /', { encoding: 'utf8', timeout: 3000 });
    const lines = dfOut.trim().split('\n');
    if (lines.length > 1) {
      const parts = lines[1].split(/\s+/);
      disk = [{ filesystem: parts[0], size: parts[1], used: parts[2], avail: parts[3], usePercent: parts[4], mounted: parts[5] }];
    }
  } catch {}

  let processes = [];
  try {
    const psOut = execSync('ps aux --sort=-%cpu | head -15', { encoding: 'utf8', timeout: 3000 });
    const lines = psOut.trim().split('\n');
    if (lines.length > 0) {
      const header = lines[0].trim().split(/\s+/);
      const uidIdx = header.indexOf('USER');
      const pidIdx = header.indexOf('PID');
      const cpuIdx = header.indexOf('%CPU');
      const memIdx = header.indexOf('%MEM');
      const cmdIdx = 10;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length > cmdIdx) {
          processes.push({
            user: parts[uidIdx] || '',
            pid: parts[pidIdx] || '',
            cpu: parts[cpuIdx] || '',
            mem: parts[memIdx] || '',
            cmd: parts.slice(cmdIdx).join(' ')
          });
        }
      }
    }
  } catch {}

  res.json({
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    cpu: { model: cpuModel, count: cpuCount, usage: cpuUsage, loadAvg },
    memory: { total: totalMem, free: freeMem, used: usedMem, percent: memPercent },
    disk,
    processes
  });
});

// ── Cloudflared tunnel management ──────────────────────────────────
const tunnels = new Map();

app.post('/api/tunnel', checkPin, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });

  try { require('child_process').execSync('command -v cloudflared', { stdio: 'ignore' }); }
  catch { return res.status(500).json({ error: 'cloudflared not installed' }); }

  const proc = spawn('cloudflared', ['tunnel', '--url', url], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.unref();
  let tunnelUrl = null;
  const timeout = 15000;

  const urlPromise = new Promise((resolve, reject) => {
    const handler = data => {
      const text = data.toString();
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) {
        tunnelUrl = m[0];
        proc.stdout.removeAllListeners('data');
        proc.stderr.removeAllListeners('data');
        proc.stdout.resume();
        proc.stderr.resume();
        resolve(tunnelUrl);
      }
    };
    proc.stdout.on('data', handler);
    proc.stderr.on('data', handler);
    proc.on('error', err => reject(err));
  });

  try {
    const result = await Promise.race([
      urlPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeout))
    ]);
    const id = tunnelUrl.replace(/^https:\/\//, '').replace(/\.trycloudflare\.com$/, '');
    tunnels.set(id, { proc, localUrl: url, tunnelUrl, createdAt: Date.now() });
    res.json({ success: true, id, url: tunnelUrl });
  } catch (e) {
    try { proc.kill(); } catch {}
    res.status(500).json({ error: e.message === 'timeout' ? 'Timed out waiting for tunnel URL' : e.message });
  }
});

app.delete('/api/tunnel', checkPin, (req, res) => {
  const { id } = req.body;
  if (!id || !tunnels.has(id)) return res.status(404).json({ error: 'tunnel not found' });
  const entry = tunnels.get(id);
  try { entry.proc.kill('SIGTERM'); } catch {}
  tunnels.delete(id);
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`\n  WebTun running → http://localhost:${PORT}\n`);
  if (PIN) console.log(`  PIN protection enabled\n`);
});

process.on('uncaughtException', e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e));
