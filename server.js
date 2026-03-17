/**
 * server.js — Express/dotenv talab qilmaydigan dev server
 * Faqat Node.js o'zi bilan ishlaydi.
 * Ishga tushirish: node server.js
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ── .env faylni o'qish (dotenv o'rniga) ─────────────────────
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

// ── MIME turlari ──────────────────────────────────────────────
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

// ── API handler'larni lazy yuklaymiz ─────────────────────────
function loadApiHandler(name) {
    try { return require(`./api/${name}`); }
    catch (e) { return null; }
}

// ── JSON body parser ──────────────────────────────────────────
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
        req.on('end', () => {
            try { resolve(data ? JSON.parse(data) : {}); }
            catch { resolve({}); }
        });
        req.on('error', reject);
    });
}

// ── Mock res object (Express-benzash) ─────────────────────────
function mockRes(res) {
    const headers = {};
    const wrapper = {
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
    return wrapper;
}

// ── Statik fayl xizmati ───────────────────────────────────────
function serveStatic(filePath, res) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
        res.end(data);
    });
}

// ── Asosiy server ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // /api/config.js
    if (pathname === '/api/config.js') {
        const handler = loadApiHandler('config');
        if (handler) { const mRes = mockRes(res); req.body = {}; return handler(req, mRes); }
    }

    // /api/bot  (POST webhook)
    if (pathname === '/api/bot') {
        const handler = loadApiHandler('bot');
        if (handler) {
            req.body = await parseBody(req);
            const mRes = mockRes(res);
            return handler(req, mRes);
        }
    }

    // /api/client-log
    if (pathname === '/api/client-log') {
        const handler = loadApiHandler('client-log');
        if (handler) {
            req.body = req.method === 'POST' ? await parseBody(req) : {};
            const mRes = mockRes(res);
            return handler(req, mRes);
        }
    }

    // Static files
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);

    // Faqat ruxsat etilgan fayllar
    const allowed = ['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.ico'];
    const ext = path.extname(filePath).toLowerCase();

    if (!ext || !allowed.includes(ext)) {
        filePath = path.join(__dirname, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'index.html');
    }

    serveStatic(filePath, res);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║      🚀  Kassa Server Ishlamoqda      ║');
    console.log('╠═══════════════════════════════════════╣');
    console.log(`║  URL  : http://localhost:${PORT}          ║`);
    console.log(`║  Test : http://localhost:${PORT}?user_id=123456 ║`);
    console.log('╚═══════════════════════════════════════╝\n');
    checkEnv();
});

function checkEnv() {
    const required = ['BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_KEY'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0) {
        console.warn('⚠️  .env da quyidagi o\'zgaruvchilar topilmadi:', missing.join(', '));
    } else {
        console.log('✅  .env o\'zgaruvchilari to\'g\'ri yuklandi');
    }

    if (!process.env.ADMIN_IDS) {
        console.log('ℹ️  ADMIN_IDS topilmadi. Ommaviy xabar (/message) yuborish imkoniyati o\'chiq');
    }

    if (!process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_KEY) {
        process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_KEY;
        console.log('ℹ️  SUPABASE_ANON_KEY ga SUPABASE_KEY ishlatildi (anon key ajrating tavsiya etiladi)');
    }

    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your-openai')) {
        console.log('ℹ️  OPENAI_API_KEY yo\'q — ovozli xabar funksiyasi o\'chiq');
    }
    console.log('');
}
