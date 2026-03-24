
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

function loadApiHandler(name) {
  try { return require(`./api/${name}`); }
  catch (e) { return null; }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 15 * 1024 * 1024) req.destroy(new Error('Payload too large')); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function mockRes(res) {
  const headers = {};
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { headers[k] = v; return this; },
    json(obj) {
      const body = JSON.stringify(obj);
      res.writeHead(this.statusCode, { 'Content-Type': 'application/json', ...headers });
      res.end(body);
    },
    send(body) {
      const ct = headers['Content-Type'] || 'text/plain; charset=utf-8';
      res.writeHead(this.statusCode, { 'Content-Type': ct, ...headers });
      res.end(typeof body === 'string' ? body : JSON.stringify(body));
    },
    end(body = '') {
      res.writeHead(this.statusCode, headers);
      res.end(body);
    },
  };
}

async function start() {
  let createViteServer;
  try {
    ({ createServer: createViteServer } = await import('vite'));
  } catch (error) {
    console.error('Vite topilmadi. Avval `npm install` ni ishga tushiring.');
    process.exit(1);
  }

  const vite = await createViteServer({
    server: { middlewareMode: true, host: '0.0.0.0', port: Number(process.env.PORT || 3000) },
    appType: 'custom',
  });

  const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    try {
      if (pathname === '/api/config.js') {
        const handler = loadApiHandler('config');
        if (handler) {
          const mRes = mockRes(res);
          req.body = {};
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/bot') {
        const handler = loadApiHandler('bot');
        if (handler) {
          req.body = await parseBody(req);
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/client-log') {
        const handler = loadApiHandler('client-log');
        if (handler) {
          req.body = req.method === 'POST' ? await parseBody(req) : {};
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/cron-reminders') {
        const handler = loadApiHandler('cron-reminders');
        if (handler) {
          req.body = req.method === 'POST' ? await parseBody(req) : {};
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/send-report-pdf') {
        const handler = loadApiHandler('send-report-pdf');
        if (handler) {
          req.body = req.method === 'POST' ? await parseBody(req) : {};
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/send-report-files') {
        const handler = loadApiHandler('send-report-files');
        if (handler) {
          req.body = req.method === 'POST' ? await parseBody(req) : {};
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      if (pathname === '/api/notify-miniapp-tx') {
        const handler = loadApiHandler('notify-miniapp-tx');
        if (handler) {
          req.body = req.method === 'POST' ? await parseBody(req) : {};
          const mRes = mockRes(res);
          return handler(req, mRes);
        }
      }

      vite.middlewares(req, res, async () => {
        try {
          let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf8');
          template = await vite.transformIndexHtml(req.url, template);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(template);
        } catch (error) {
          vite.ssrFixStacktrace(error);
          console.error(error);
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(error.message);
        }
      });
    } catch (error) {
      console.error(error);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.message || 'Server error');
    }
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  🚀 Kassa Premium Vite + Vue dev server tayyor  ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  URL  : http://localhost:${port}`.padEnd(49) + '║');
    console.log(`║  Test : http://localhost:${port}?user_id=7894854944`.padEnd(49) + '║');
    console.log('╚══════════════════════════════════════════════════╝\n');
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
