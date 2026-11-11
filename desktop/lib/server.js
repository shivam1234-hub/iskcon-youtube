'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Serve the Expo web export over http://127.0.0.1:<port>.
 *
 * Why not file:// or a custom app:// scheme: YouTube's embedded player needs
 * a real http(s) referrer from the page that hosts it, or it fails with
 * "Video player configuration error" (error 153). A loopback origin gives the
 * iframe one, exactly as the phone build's wrapper page does with its
 * third-party baseUrl.
 *
 * The port is FIXED (first free one from PORTS). localStorage — where the
 * app keeps history, subscriptions and Watch later — is per origin, port
 * included, so a random port would start every launch with an empty library.
 */
const PORTS = [47830, 47831, 47832, 47833, 47834];

function startServer({ webDir, extraFiles = {} }) {
  const server = http.createServer((req, res) => {
    handle(req, res, webDir, extraFiles).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= PORTS.length) {
        // Every preferred port is taken: any free port still works, the
        // library just won't be the usual one for this session.
        server.listen(0, '127.0.0.1');
        return;
      }
      server.listen(PORTS[i++], '127.0.0.1');
    };
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') tryNext();
      else reject(e);
    });
    server.on('listening', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
    tryNext();
  });
}

async function handle(req, res, webDir, extraFiles) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (extraFiles[pathname]) {
    await sendFile(req, res, extraFiles[pathname]);
    return;
  }
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = safeJoin(webDir, rel);
  if (!file) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (await isFile(file)) {
    await sendFile(req, res, file);
    return;
  }
  // Single-page app: an unknown path without an extension is a route.
  if (!rel.startsWith('_expo/') && !path.extname(rel)) {
    await sendFile(req, res, path.join(webDir, 'index.html'));
    return;
  }
  res.writeHead(404);
  res.end();
}

function safeJoin(root, rel) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, rel.replace(/^([/\\])+/, ''));
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

async function isFile(p) {
  try {
    return (await fsp.stat(p)).isFile();
  } catch {
    return false;
  }
}

async function sendFile(req, res, file) {
  const stat = await fsp.stat(file);
  const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const hashed = /[.-][0-9a-f]{8,}\./.test(path.basename(file));
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(file).pipe(res);
}

module.exports = { startServer };
