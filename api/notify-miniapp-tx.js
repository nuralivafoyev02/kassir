'use strict';

const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN yo'q");

const bot = new TelegramBot(BOT_TOKEN, { polling: false });

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function numFmt(n) {
  return Number(n || 0).toLocaleString('ru-RU');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('notify-miniapp-tx ready');

  try {
    const body = req.body || {};
    const userId = Number(body.user_id || body.userId || 0);
    const amount = Number(body.amount || 0);
    const type = String(body.type || 'expense') === 'income' ? 'income' : 'expense';
    const category = String(body.category || 'Xarajat').trim() || 'Xarajat';
    const receiptUrl = String(body.receipt_url || body.receiptUrl || '').trim();
    const source = String(body.source || 'mini_app').trim();

    if (!userId) return res.status(400).json({ ok: false, error: 'user_id required' });
    if (!amount) return res.status(400).json({ ok: false, error: 'amount required' });

    const icon = type === 'income' ? '🟢' : '🔴';
    const label = type === 'income' ? 'Kirim' : 'Chiqim';
    const text = `${icon} <b>Mini App orqali yangi operatsiya kiritildi</b>

<b>Turi:</b> ${label}
<b>Summa:</b> ${numFmt(amount)} so'm
<b>Kategoriya:</b> ${esc(category)}
<b>Manba:</b> ${esc(source)}
<b>Chek:</b> ${receiptUrl ? 'Bor' : 'Yo\'q'}`;

    await bot.sendMessage(userId, text, { parse_mode: 'HTML' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
