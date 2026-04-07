'use strict';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { summarizePushDevice, upsertPushDevice } = await import('../db/push-devices.mjs');
    const row = await upsertPushDevice(process.env, body);
    return res.status(200).json({
      ok: true,
      device: summarizePushDevice(row),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
};
