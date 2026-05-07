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

// ── WebSocket terminal ────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost`);
  const token = url.searchParams.get('token');

  if (PIN && token !== PIN) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  const cols = parseInt(url.searchParams.get('cols')) || 80;
  const rows = parseInt(url.searchParams.get('rows')) || 24;
  const cwd = url.searchParams.get('cwd') || os.homedir();

  let proc;
  try {
    proc = pty.spawn(SHELL, [], {
      name: 'xterm-256color',
      cols, rows, cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    });
  } catch (e) {
    ws.send(JSON.stringify({ type: 'error', data: `Failed to spawn shell: ${e.message}\r\n` }));
    ws.close();
    return;
  }

  proc.onData(data => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'data', data }));
  });

  proc.onExit(({ exitCode }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
      ws.close();
    }
  });

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'input') proc.write(msg.data);
      if (msg.type === 'resize') proc.resize(Math.max(2, msg.cols), Math.max(2, msg.rows));
    } catch {}
  });

  ws.on('close', () => { try { proc.kill(); } catch {} });
  ws.on('error', () => { try { proc.kill(); } catch {} });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  WebTerm running → http://localhost:${PORT}\n`);
  if (PIN) console.log(`  PIN protection enabled\n`);
});

process.on('uncaughtException', e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e));
