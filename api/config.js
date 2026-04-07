module.exports = async (_req, res) => {
  const { buildPublicNotificationConfig } = await import('../types/notifications.mjs');
  // SUPABASE_ANON_KEY bo'lmasa SUPABASE_KEY ishlatiladi (dev fallback)
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

  const payload = {
    SUPABASE_URL:      process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: anonKey,
    ...buildPublicNotificationConfig(process.env),
  };

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(`window.__APP_CONFIG__ = ${JSON.stringify(payload)};`);
};
