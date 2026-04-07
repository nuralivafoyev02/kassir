'use strict';

const { createClient } = require('@supabase/supabase-js');
const subscriptionHelpers = require('../public/kassa.subscription.js');

const SUBSCRIPTION_FIELDS = Array.isArray(subscriptionHelpers.SUBSCRIPTION_FIELDS)
  ? subscriptionHelpers.SUBSCRIPTION_FIELDS.slice()
  : ['plan_code', 'subscription_status', 'subscription_start_at', 'subscription_end_at', 'trial_end_at', 'canceled_at', 'grace_until', 'created_at', 'updated_at'];

function getEnvValue(req, key) {
  return req?.env?.[key] || process.env[key] || '';
}

function hasSubscriptionSchema(row) {
  if (typeof subscriptionHelpers.hasSubscriptionSchema === 'function') {
    return subscriptionHelpers.hasSubscriptionSchema(row || {});
  }
  return SUBSCRIPTION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(row || {}, field));
}

function isMissingColumnError(error, column) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const target = String(column || '').toLowerCase();
  return !!target && msg.includes(target) && (
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('unknown column') ||
    msg.includes('could not find the column')
  );
}

function getSupabaseClient(req) {
  const url = getEnvValue(req, 'SUPABASE_URL');
  const key = getEnvValue(req, 'SUPABASE_SERVICE_ROLE_KEY') || getEnvValue(req, 'SUPABASE_KEY');
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchUserSubscription(req, userId, extraFields = []) {
  const db = getSupabaseClient(req);
  const baseFields = ['user_id', ...extraFields].filter(Boolean);

  if (!db || !userId) {
    return {
      row: { user_id: userId || null },
      schemaReady: false,
      degraded: true,
      clientReady: false,
      error: null,
    };
  }

  const subscriptionSelect = SUBSCRIPTION_FIELDS.join(', ');
  const selectWithSubscription = [...baseFields, subscriptionSelect].join(', ');

  let response = await db
    .from('users')
    .select(selectWithSubscription)
    .eq('user_id', userId)
    .maybeSingle();

  if (response.error && SUBSCRIPTION_FIELDS.some((field) => isMissingColumnError(response.error, field))) {
    response = await db
      .from('users')
      .select(baseFields.join(', '))
      .eq('user_id', userId)
      .maybeSingle();

    return {
      row: response.data || { user_id: userId },
      schemaReady: false,
      degraded: true,
      clientReady: true,
      error: response.error || null,
    };
  }

  return {
    row: response.data || { user_id: userId },
    schemaReady: hasSubscriptionSchema(response.data),
    degraded: false,
    clientReady: true,
    error: response.error || null,
  };
}

function evaluateFeatureGate(featureKey, row, options = {}) {
  if (typeof subscriptionHelpers.evaluateFeatureGate === 'function') {
    return subscriptionHelpers.evaluateFeatureGate(featureKey, row || {}, {
      ...options,
      schemaReady: options.schemaReady ?? hasSubscriptionSchema(row),
    });
  }
  return { allowed: true, featureKey, degraded: true };
}

async function getUserFeatureGate(req, userId, featureKey, options = {}) {
  const lookup = await fetchUserSubscription(req, userId, options.extraFields || []);
  if (lookup.error && options.failOpenOnLookupError !== false) {
    return {
      ...lookup,
      gate: { allowed: true, featureKey, degraded: true, reason: 'lookup_failed' },
    };
  }

  return {
    ...lookup,
    gate: evaluateFeatureGate(featureKey, lookup.row || { user_id: userId }, {
      ...options,
      schemaReady: lookup.schemaReady,
    }),
  };
}

function getPremiumFeatureMessage(featureKey) {
  if (featureKey === 'advanced_reports') {
    return 'PDF va kengaytirilgan hisobotlar Premium tarifida.';
  }
  if (featureKey === 'daily_morning_reminder' || featureKey === 'daily_evening_reminder') {
    return 'Kunlik premium eslatmalar faqat Premium foydalanuvchilar uchun mavjud.';
  }
  return 'Bu imkoniyat Premium tarifida mavjud.';
}

module.exports = {
  SUBSCRIPTION_FIELDS,
  hasSubscriptionSchema,
  isMissingColumnError,
  fetchUserSubscription,
  evaluateFeatureGate,
  getUserFeatureGate,
  getPremiumFeatureMessage,
};
