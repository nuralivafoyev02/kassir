module.exports = async (_req, res) => {
  const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return res.status(500).json({ ok: false, error: 'BOT_TOKEN missing' });

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const raw = await resp.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }
    return res.status(200).json({ ok: resp.ok, status: resp.status, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
};
