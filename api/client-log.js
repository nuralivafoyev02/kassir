module.exports = async (req, res) => {
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
      userAgent: req.headers['user-agent'] || '',
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[CLIENT-LOG:ERROR]', error);
    return res.status(500).json({ ok: false });
  }
};