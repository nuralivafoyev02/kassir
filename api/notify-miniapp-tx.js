'use strict';

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
    const { sendNotification } = await import('../services/notifications/send-notification.mjs');
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

    const delivery = await sendNotification(process.env, {
      userId,
      title: 'Yangi operatsiya',
      body: `${label}: ${numFmt(amount)} so'm · ${category}`,
      html: text,
      type: 'miniapp_tx',
      clickUrl: '/history',
      tag: `miniapp-tx-${userId}`,
      data: {
        url: '/history',
        tx_type: type,
        source,
        category,
        amount: String(amount),
      },
    });

    if (!delivery.ok) {
      return res.status(500).json({
        ok: false,
        error: delivery.error || delivery.reason || 'Notification delivery failed',
      });
    }

    return res.status(200).json({
      ok: true,
      provider: delivery.provider,
      fallback_used: delivery.fallbackUsed === true,
      delivered_count: Number(delivery.deliveredCount || 0),
      telegram_message_id: delivery.legacyMessageId || null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || String(error) });
  }
};
