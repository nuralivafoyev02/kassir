const { createTelegramOps } = require('../lib/telegram-ops.cjs');

function getClientLogger() {
  if (!global.__KASSA_CLIENT_LOGGER__) {
    global.__KASSA_CLIENT_LOGGER__ = createTelegramOps({
      botToken: process.env.BOT_TOKEN || '',
      logChannelId: process.env.LOG_CHANNEL_ID || '',
      adminChatId: process.env.ADMIN_NOTIFY_CHAT_ID || process.env.OWNER_ID || '',
      loggingEnabled: process.env.TELEGRAM_LOGGING_ENABLED,
      logLevel: process.env.LOG_LEVEL || 'INFO',
      localLevel: process.env.LOCAL_LOG_LEVEL || 'ERROR',
      source: 'MINIAPP',
    });
  }
  return global.__KASSA_CLIENT_LOGGER__;
}

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
    const level = String(body.level || body.type || 'info').trim().toLowerCase();

    console.log('[CLIENT-LOG]', {
      level,
      scope: body.scope || 'unknown',
      message: body.message || '',
      payload: body.payload || {},
      currentUserId: body.currentUserId || null,
      tgUserId: body.tgUserId || null,
      url: body.url || '',
      userAgent: req.headers['user-agent'] || body.userAgent || '',
      forwardedFor: req.headers['x-forwarded-for'] || '',
    });

    if (level === 'error') {
      await getClientLogger().error({
        scope: `miniapp.${String(body.scope || 'client').trim() || 'client'}`,
        user_id: body.currentUserId || body.tgUserId || body.user_id || null,
        username: body.username || null,
        full_name: body.full_name || null,
        message: body.message || 'Mini app client error',
        payload: {
          url: body.url || '',
          user_agent: req.headers['user-agent'] || body.userAgent || '',
          payload: body.payload || {},
        },
      }).catch(() => { });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[CLIENT-LOG:ERROR]', {
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
};
