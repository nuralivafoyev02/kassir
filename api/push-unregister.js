'use strict';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body =
      typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { deactivatePushDeviceRegistration, summarizePushDevice } = await import('../db/push-devices.mjs');
    const rows = await deactivatePushDeviceRegistration(process.env, body);
    const firstRow = Array.isArray(rows) ? rows[0] || null : rows;
    return res.status(200).json({
      ok: true,
      device: firstRow ? summarizePushDevice(firstRow) : null,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error),
    });
  }
};
