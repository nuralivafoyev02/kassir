module.exports = async (req, res) => {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      message: 'client-log endpoint is alive, use POST to send logs',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    console.log('[CLIENT-LOG]', {
      level: body.level || 'info',
      scope: body.scope || 'unknown',
      message: body.message || '',
      payload: body.payload || {},
      currentUserId: body.currentUserId || null,
      tgUserId: body.tgUserId || null,
      url: body.url || '',
      userAgent: req.headers['user-agent'] || body.userAgent || '',
      forwardedFor: req.headers['x-forwarded-for'] || '',
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[CLIENT-LOG:ERROR]', {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
};
