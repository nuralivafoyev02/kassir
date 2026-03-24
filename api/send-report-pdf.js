'use strict';

function getBotToken(req) {
  return (
    req?.env?.BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    ''
  );
}

async function tgSendDocument(token, chatId, blob, fileName, caption, contentType) {
  const form = new FormData();
  form.set('chat_id', String(chatId));
  if (caption) form.set('caption', caption);
  form.set('document', new File([blob], fileName, { type: contentType }));

  const resp = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: 'POST',
    body: form,
  });

  const raw = await resp.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { ok: false, raw };
  }

  if (!resp.ok || data?.ok === false) {
    throw new Error(data?.description || data?.raw || `Telegram HTTP ${resp.status}`);
  }

  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('send-report-pdf ready');
  }

  try {
    const token = getBotToken(req);
    if (!token) {
      return res.status(500).json({ ok: false, error: "BOT_TOKEN yo'q" });
    }

    const body = req.body || {};
    const userId = Number(body.user_id || body.userId || 0);
    const fileName = String(body.file_name || body.fileName || 'Kassa-report.pdf').trim() || 'Kassa-report.pdf';
    const caption = String(body.caption || '📄 Kassa PDF hisobot').trim();
    const base64 = String(body.base64 || '').trim();

    if (!userId) return res.status(400).json({ ok: false, error: 'user_id required' });
    if (!base64) return res.status(400).json({ ok: false, error: 'base64 required' });

    const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, '').trim();
    const bytes = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
    if (!bytes.length) return res.status(400).json({ ok: false, error: 'invalid pdf payload' });

    const pdfBlob = new Blob([bytes], { type: 'application/pdf' });
    const result = await tgSendDocument(token, userId, pdfBlob, fileName, caption, 'application/pdf');

    return res.status(200).json({ ok: true, message_id: result?.result?.message_id || null });
  } catch (error) {
    console.error('[send-report-pdf]', error);
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
};
