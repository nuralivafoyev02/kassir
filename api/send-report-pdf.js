'use strict';

const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('send-report-pdf ready');
  }

  try {
    const body = req.body || {};
    const userId = Number(body.user_id || body.userId || 0);
    const fileName = String(body.file_name || body.fileName || 'Kassa-report.pdf').trim() || 'Kassa-report.pdf';
    const caption = String(body.caption || '📄 Kassa PDF hisobot').trim();
    const base64 = String(body.base64 || '').trim();

    if (!userId) return res.status(400).json({ ok: false, error: 'user_id required' });
    if (!base64) return res.status(400).json({ ok: false, error: 'base64 required' });

    const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (!buffer.length) return res.status(400).json({ ok: false, error: 'invalid pdf payload' });

    await bot.sendDocument(
      userId,
      buffer,
      { caption },
      { filename: fileName, contentType: 'application/pdf' }
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
