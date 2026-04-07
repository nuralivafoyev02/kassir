(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KassaSubscription = factory();
  }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var PLAN_CODES = Object.freeze({
    FREE: 'free',
    PREMIUM_MONTHLY: 'premium_monthly',
  });

  var SUBSCRIPTION_STATUSES = Object.freeze({
    FREE: 'free',
    TRIAL: 'trial',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    CANCELED: 'canceled',
    GRACE: 'grace',
  });

  var PREMIUM_MONTHLY_LIST_PRICE_UZS = 21999;
  var PREMIUM_MONTHLY_SALE_PRICE_UZS = 14999;
  var PREMIUM_MONTHLY_SALE_START_AT = '2026-03-26T00:00:00+05:00';
  var PREMIUM_MONTHLY_SALE_END_AT = '2026-04-26T23:59:59+05:00';

  var PRICING_FEATURE_KEYS = Object.freeze({
    free: Object.freeze([
      'basic_income',
      'basic_expense',
      'history',
      'basic_dashboard',
      'basic_categories',
      'basic_sync',
      'one_plan',
      'one_debt',
      'one_limit',
      'basic_reminder',
    ]),
    premium_monthly: Object.freeze([
      'unlimited_plans',
      'unlimited_debts',
      'unlimited_limits',
      'morning_evening_reminders',
      'custom_reminders',
      'pdf_reports',
      'deep_analytics',
      'ai_ready',
    ]),
  });

  var PRICING_PLAN_MAP = Object.freeze({
    free: Object.freeze({
      code: PLAN_CODES.FREE,
      title: 'Bepul',
      price_label: '0 so\'m',
      billing_period: 'free',
      monthly_price_uzs: 0,
      highlight: false,
      feature_keys: PRICING_FEATURE_KEYS.free,
    }),
    premium_monthly: Object.freeze({
      code: PLAN_CODES.PREMIUM_MONTHLY,
      title: 'Premium',
      price_label: '14 999 so\'m / oy',
      billing_period: 'monthly',
      monthly_price_uzs: PREMIUM_MONTHLY_LIST_PRICE_UZS,
      list_price_uzs: PREMIUM_MONTHLY_LIST_PRICE_UZS,
      sale_price_uzs: PREMIUM_MONTHLY_SALE_PRICE_UZS,
      sale_start_at: PREMIUM_MONTHLY_SALE_START_AT,
      sale_end_at: PREMIUM_MONTHLY_SALE_END_AT,
      highlight: true,
      feature_keys: PRICING_FEATURE_KEYS.premium_monthly,
    }),
  });

  var FREE_FEATURES = Object.freeze([
    'Oddiy kirim qo\'shish',
    'Oddiy chiqim qo\'shish',
    'Tarixni ko\'rish',
    'Basic dashboard',
    'Basic kategoriya ishlatish',
    'Bot va mini app asosiy sinxron ishlashi',
    '1 ta faol reja',
    '1 ta faol qarz',
    '1 ta faol limit',
    'Basic reminder',
  ]);

  var PREMIUM_FEATURES = Object.freeze([
    'Cheksiz reja yaratish',
    'Cheksiz qarz yaratish',
    'Cheksiz limit yaratish',
    'Ertalabgi va kechki eslatmalar',
    'Custom reminder vaqtlarini sozlash',
    'PDF va kengaytirilgan hisobotlar',
    'Chuqur statistika va kengaytirilgan analiz',
    'Kelajakdagi premium-only AI qulayliklar',
  ]);

  var FEATURE_GATES = Object.freeze({
    plan_create: Object.freeze({
      key: 'plan_create',
      kind: 'count_limit',
      freeLimit: 1,
      usageKeys: ['activePlansCount', 'activeLimitsCount'],
      premiumBenefitKeys: ['unlimited_plans', 'unlimited_limits', 'advanced_reports'],
    }),
    limit_create: Object.freeze({
      key: 'limit_create',
      kind: 'count_limit',
      freeLimit: 1,
      usageKeys: ['activeLimitsCount', 'activePlansCount'],
      premiumBenefitKeys: ['unlimited_limits', 'unlimited_plans', 'advanced_reports'],
    }),
    debt_create: Object.freeze({
      key: 'debt_create',
      kind: 'count_limit',
      freeLimit: 1,
      usageKeys: ['activeDebtsCount'],
      premiumBenefitKeys: ['unlimited_debts', 'daily_reminders', 'custom_reminder_time'],
    }),
    custom_reminder_time: Object.freeze({
      key: 'custom_reminder_time',
      kind: 'premium_only',
      premiumBenefitKeys: ['custom_reminder_time', 'daily_reminders'],
    }),
    daily_morning_reminder: Object.freeze({
      key: 'daily_morning_reminder',
      kind: 'premium_only',
      premiumBenefitKeys: ['daily_reminders'],
    }),
    daily_evening_reminder: Object.freeze({
      key: 'daily_evening_reminder',
      kind: 'premium_only',
      premiumBenefitKeys: ['daily_reminders', 'advanced_reports'],
    }),
    advanced_reports: Object.freeze({
      key: 'advanced_reports',
      kind: 'premium_only',
      premiumBenefitKeys: ['advanced_reports', 'deep_analytics'],
    }),
    premium_dashboard: Object.freeze({
      key: 'premium_dashboard',
      kind: 'premium_only',
      premiumBenefitKeys: ['deep_analytics', 'advanced_reports', 'ai_insights'],
    }),
    deep_analytics: Object.freeze({
      key: 'deep_analytics',
      kind: 'premium_only',
      premiumBenefitKeys: ['deep_analytics', 'advanced_reports', 'ai_insights'],
    }),
    ai_insights: Object.freeze({
      key: 'ai_insights',
      kind: 'premium_only',
      premiumBenefitKeys: ['ai_insights', 'deep_analytics'],
    }),
  });

  var SUBSCRIPTION_FIELDS = Object.freeze([
    'plan_code',
    'subscription_status',
    'subscription_start_at',
    'subscription_end_at',
    'trial_end_at',
    'canceled_at',
    'grace_until',
    'created_at',
    'updated_at',
  ]);

  function normalizePlanCode(value) {
    return String(value || '').trim() === PLAN_CODES.PREMIUM_MONTHLY
      ? PLAN_CODES.PREMIUM_MONTHLY
      : PLAN_CODES.FREE;
  }

  function normalizeSubscriptionStatus(value) {
    var raw = String(value || '').trim();
    return Object.prototype.hasOwnProperty.call(SUBSCRIPTION_STATUSES, raw.toUpperCase())
      ? SUBSCRIPTION_STATUSES[raw.toUpperCase()]
      : (
        raw === SUBSCRIPTION_STATUSES.TRIAL ||
        raw === SUBSCRIPTION_STATUSES.ACTIVE ||
        raw === SUBSCRIPTION_STATUSES.EXPIRED ||
        raw === SUBSCRIPTION_STATUSES.CANCELED ||
        raw === SUBSCRIPTION_STATUSES.GRACE ||
        raw === SUBSCRIPTION_STATUSES.FREE
          ? raw
          : SUBSCRIPTION_STATUSES.FREE
      );
  }

  function parseDate(value) {
    if (!value) return null;
    var date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function resolveNow(input) {
    return parseDate(input) || new Date();
  }

  function formatPriceLabel(amount, billingPeriod) {
    var value = Number(amount);
    var normalized = Number.isFinite(value) && value > 0
      ? String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so\'m'
      : '0 so\'m';
    return billingPeriod === 'monthly' ? normalized + ' / oy' : normalized;
  }

  function resolvePlanPricing(plan, now) {
    var currentNow = resolveNow(now);
    var currentMs = currentNow.getTime();
    var saleStartAt = parseDate(plan && plan.sale_start_at);
    var saleEndAt = parseDate(plan && plan.sale_end_at);
    var listPrice = Number(plan && (plan.list_price_uzs || plan.monthly_price_uzs));
    var salePrice = Number(plan && plan.sale_price_uzs);
    var canUseSale = (
      plan &&
      plan.code === PLAN_CODES.PREMIUM_MONTHLY &&
      Number.isFinite(salePrice) &&
      salePrice > 0 &&
      (!saleStartAt || saleStartAt.getTime() <= currentMs) &&
      (!!saleEndAt && saleEndAt.getTime() > currentMs)
    );
    var currentPrice = canUseSale ? salePrice : listPrice;
    var originalPrice = Number.isFinite(listPrice) && listPrice > 0 ? listPrice : currentPrice;
    if (!Number.isFinite(currentPrice) || currentPrice < 0) currentPrice = 0;
    if (!Number.isFinite(originalPrice) || originalPrice < currentPrice) originalPrice = currentPrice;
    return {
      sale_active: canUseSale,
      sale_start_at: saleStartAt ? saleStartAt.toISOString() : null,
      sale_end_at: saleEndAt ? saleEndAt.toISOString() : null,
      current_price_uzs: currentPrice,
      original_price_uzs: originalPrice,
      sale_price_uzs: canUseSale ? currentPrice : (Number.isFinite(salePrice) && salePrice > 0 ? salePrice : null),
      discount_amount_uzs: canUseSale ? Math.max(0, originalPrice - currentPrice) : 0,
    };
  }

  function hasSubscriptionSchema(record) {
    if (!record || typeof record !== 'object') return false;
    return SUBSCRIPTION_FIELDS.some(function (field) {
      return Object.prototype.hasOwnProperty.call(record, field);
    });
  }

  function pickEffectiveStatus(record, now) {
    var planCode = normalizePlanCode(record && (record.plan_code || record.planCode));
    var rawStatus = normalizeSubscriptionStatus(record && (record.subscription_status || record.subscriptionStatus || (planCode === PLAN_CODES.FREE ? SUBSCRIPTION_STATUSES.FREE : SUBSCRIPTION_STATUSES.ACTIVE)));
    var subscriptionEndAt = parseDate(record && (record.subscription_end_at || record.subscriptionEndAt));
    var trialEndAt = parseDate(record && (record.trial_end_at || record.trialEndAt));
    var graceUntil = parseDate(record && (record.grace_until || record.graceUntil));
    var nowMs = resolveNow(now).getTime();

    if (planCode === PLAN_CODES.FREE) return SUBSCRIPTION_STATUSES.FREE;

    if (rawStatus === SUBSCRIPTION_STATUSES.TRIAL) {
      if (trialEndAt && trialEndAt.getTime() < nowMs) return SUBSCRIPTION_STATUSES.EXPIRED;
      return SUBSCRIPTION_STATUSES.TRIAL;
    }

    if (rawStatus === SUBSCRIPTION_STATUSES.GRACE) {
      if (graceUntil && graceUntil.getTime() < nowMs) return SUBSCRIPTION_STATUSES.EXPIRED;
      return SUBSCRIPTION_STATUSES.GRACE;
    }

    if (rawStatus === SUBSCRIPTION_STATUSES.CANCELED) {
      if (graceUntil && graceUntil.getTime() >= nowMs) return SUBSCRIPTION_STATUSES.GRACE;
      if (subscriptionEndAt && subscriptionEndAt.getTime() >= nowMs) return SUBSCRIPTION_STATUSES.CANCELED;
      return SUBSCRIPTION_STATUSES.EXPIRED;
    }

    if (rawStatus === SUBSCRIPTION_STATUSES.ACTIVE) {
      if (subscriptionEndAt && subscriptionEndAt.getTime() < nowMs) return SUBSCRIPTION_STATUSES.EXPIRED;
      return SUBSCRIPTION_STATUSES.ACTIVE;
    }

    return rawStatus === SUBSCRIPTION_STATUSES.EXPIRED
      ? SUBSCRIPTION_STATUSES.EXPIRED
      : SUBSCRIPTION_STATUSES.FREE;
  }

  function resolveAccessUntil(record, effectiveStatus) {
    if (effectiveStatus === SUBSCRIPTION_STATUSES.TRIAL) {
      return parseDate(record && (record.trial_end_at || record.trialEndAt));
    }
    if (effectiveStatus === SUBSCRIPTION_STATUSES.GRACE) {
      return parseDate(record && (record.grace_until || record.graceUntil))
        || parseDate(record && (record.subscription_end_at || record.subscriptionEndAt));
    }
    if (effectiveStatus === SUBSCRIPTION_STATUSES.ACTIVE || effectiveStatus === SUBSCRIPTION_STATUSES.CANCELED) {
      return parseDate(record && (record.subscription_end_at || record.subscriptionEndAt));
    }
    return null;
  }

  function hasPremiumAccessFromStatus(planCode, effectiveStatus) {
    if (planCode !== PLAN_CODES.PREMIUM_MONTHLY) return false;
    return (
      effectiveStatus === SUBSCRIPTION_STATUSES.TRIAL ||
      effectiveStatus === SUBSCRIPTION_STATUSES.ACTIVE ||
      effectiveStatus === SUBSCRIPTION_STATUSES.GRACE ||
      effectiveStatus === SUBSCRIPTION_STATUSES.CANCELED
    );
  }

  function getUiStatusLabel(status) {
    if (status === SUBSCRIPTION_STATUSES.TRIAL) return 'Sinov muddati';
    if (
      status === SUBSCRIPTION_STATUSES.ACTIVE ||
      status === SUBSCRIPTION_STATUSES.GRACE ||
      status === SUBSCRIPTION_STATUSES.CANCELED
    ) {
      return 'Obuna bo\'lgan';
    }
    if (status === SUBSCRIPTION_STATUSES.EXPIRED) return 'Obuna muddati tugagan';
    return 'Obuna bo\'lmagan';
  }

  function getBadgeTone(snapshot) {
    if (snapshot.isPremium && snapshot.effectiveStatus === SUBSCRIPTION_STATUSES.TRIAL) return 'trial';
    if (snapshot.isPremium) return 'premium';
    if (snapshot.effectiveStatus === SUBSCRIPTION_STATUSES.EXPIRED) return 'expired';
    return 'free';
  }

  function getSubscriptionBadge(snapshotOrRecord, options) {
    var snapshot = snapshotOrRecord && snapshotOrRecord.planCode
      ? snapshotOrRecord
      : getSubscriptionSnapshot(snapshotOrRecord, options);

    return {
      label: getUiStatusLabel(snapshot.effectiveStatus),
      tone: getBadgeTone(snapshot),
      plan_title: snapshot.planTitle,
    };
  }

  function getSubscriptionSnapshot(record, options) {
    var schemaReady = options && Object.prototype.hasOwnProperty.call(options, 'schemaReady')
      ? options.schemaReady !== false
      : hasSubscriptionSchema(record);
    var now = resolveNow(options && options.now);
    var planCode = normalizePlanCode(record && (record.plan_code || record.planCode));
    var rawStatus = normalizeSubscriptionStatus(record && (record.subscription_status || record.subscriptionStatus || (planCode === PLAN_CODES.FREE ? SUBSCRIPTION_STATUSES.FREE : SUBSCRIPTION_STATUSES.ACTIVE)));
    var effectiveStatus = pickEffectiveStatus(record || {}, now);
    var plan = PRICING_PLAN_MAP[planCode] || PRICING_PLAN_MAP[PLAN_CODES.FREE];
    var accessUntil = resolveAccessUntil(record || {}, effectiveStatus);
    var isPremium = hasPremiumAccessFromStatus(planCode, effectiveStatus);
    var pricing = resolvePlanPricing(plan, now);

    return {
      schemaReady: schemaReady,
      now: now.toISOString(),
      planCode: plan.code,
      rawStatus: rawStatus,
      effectiveStatus: effectiveStatus,
      planTitle: plan.title,
      priceLabel: formatPriceLabel(pricing.current_price_uzs, plan.billing_period),
      monthlyPriceUzs: pricing.current_price_uzs,
      originalMonthlyPriceUzs: pricing.original_price_uzs,
      salePriceUzs: pricing.sale_price_uzs,
      discountAmountUzs: pricing.discount_amount_uzs,
      saleActive: pricing.sale_active,
      saleStartsAt: pricing.sale_start_at,
      saleEndsAt: pricing.sale_end_at,
      billingPeriod: plan.billing_period,
      featureKeys: Array.isArray(plan.feature_keys) ? plan.feature_keys.slice() : [],
      subscriptionStartAt: parseDate(record && (record.subscription_start_at || record.subscriptionStartAt)),
      subscriptionEndAt: parseDate(record && (record.subscription_end_at || record.subscriptionEndAt)),
      trialEndAt: parseDate(record && (record.trial_end_at || record.trialEndAt)),
      canceledAt: parseDate(record && (record.canceled_at || record.canceledAt)),
      graceUntil: parseDate(record && (record.grace_until || record.graceUntil)),
      accessUntil: accessUntil,
      isPremium: isPremium,
      uiStatusLabel: getUiStatusLabel(effectiveStatus),
      limits: {
        activePlans: isPremium ? null : 1,
        activeDebts: isPremium ? null : 1,
        activeLimits: isPremium ? null : 1,
      },
      features: {
        basicTransactions: true,
        basicHistory: true,
        basicDashboard: true,
        basicCategories: true,
        basicSync: true,
        unlimitedPlans: isPremium,
        unlimitedDebts: isPremium,
        unlimitedLimits: isPremium,
        dailyMorningReminder: isPremium,
        dailyEveningReminder: isPremium,
        customReminderTime: isPremium,
        advancedReports: isPremium,
        deepAnalytics: isPremium,
        aiInsights: isPremium,
      },
      badge: null,
    };
  }

  function finalizeSnapshot(snapshot) {
    if (!snapshot) return snapshot;
    snapshot.badge = getSubscriptionBadge(snapshot, {});
    return snapshot;
  }

  function getPricingPlans() {
    var now = new Date();
    var freePricing = resolvePlanPricing(PRICING_PLAN_MAP.free, now);
    var premiumPricing = resolvePlanPricing(PRICING_PLAN_MAP.premium_monthly, now);
    return [
      {
        code: PLAN_CODES.FREE,
        title: PRICING_PLAN_MAP.free.title,
        price_label: formatPriceLabel(freePricing.current_price_uzs, PRICING_PLAN_MAP.free.billing_period),
        monthly_price_uzs: freePricing.current_price_uzs,
        original_monthly_price_uzs: freePricing.original_price_uzs,
        sale_price_uzs: freePricing.sale_price_uzs,
        discount_amount_uzs: freePricing.discount_amount_uzs,
        sale_active: freePricing.sale_active,
        sale_starts_at: freePricing.sale_start_at,
        sale_ends_at: freePricing.sale_end_at,
        feature_keys: Array.isArray(PRICING_PLAN_MAP.free.feature_keys) ? PRICING_PLAN_MAP.free.feature_keys.slice() : [],
        features: FREE_FEATURES.slice(),
      },
      {
        code: PLAN_CODES.PREMIUM_MONTHLY,
        title: PRICING_PLAN_MAP.premium_monthly.title,
        price_label: formatPriceLabel(premiumPricing.current_price_uzs, PRICING_PLAN_MAP.premium_monthly.billing_period),
        monthly_price_uzs: premiumPricing.current_price_uzs,
        original_monthly_price_uzs: premiumPricing.original_price_uzs,
        sale_price_uzs: premiumPricing.sale_price_uzs,
        discount_amount_uzs: premiumPricing.discount_amount_uzs,
        sale_active: premiumPricing.sale_active,
        sale_starts_at: premiumPricing.sale_start_at,
        sale_ends_at: premiumPricing.sale_end_at,
        feature_keys: Array.isArray(PRICING_PLAN_MAP.premium_monthly.feature_keys) ? PRICING_PLAN_MAP.premium_monthly.feature_keys.slice() : [],
        features: PREMIUM_FEATURES.slice(),
      },
    ];
  }

  function resolveUsage(context, keys) {
    var list = Array.isArray(keys) ? keys : [keys];
    for (var i = 0; i < list.length; i += 1) {
      var key = list[i];
      var value = Number(context && context[key]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return 0;
  }

  function buildGateResult(snapshot, gate, allowed, extras) {
    return {
      allowed: allowed,
      featureKey: gate.key,
      gateKind: gate.kind,
      snapshot: snapshot,
      requiredPlanCode: PLAN_CODES.PREMIUM_MONTHLY,
      requiredPlanTitle: PRICING_PLAN_MAP.premium_monthly.title,
      premiumBenefitKeys: (gate.premiumBenefitKeys || []).slice(),
      freeLimit: extras && Object.prototype.hasOwnProperty.call(extras, 'freeLimit') ? extras.freeLimit : null,
      usage: extras && Object.prototype.hasOwnProperty.call(extras, 'usage') ? extras.usage : null,
      remaining: extras && Object.prototype.hasOwnProperty.call(extras, 'remaining') ? extras.remaining : null,
      reason: extras && extras.reason ? extras.reason : null,
      degraded: extras && extras.degraded === true,
    };
  }

  function evaluateFeatureGate(featureKey, record, context) {
    var gate = FEATURE_GATES[featureKey];
    if (!gate) {
      throw new Error('Unknown feature gate: ' + featureKey);
    }

    var snapshot = finalizeSnapshot((context && context.snapshot) || getSubscriptionSnapshot(record || {}, context || {}));
    var relaxedWhenSchemaMissing = !context || context.relaxedWhenSchemaMissing !== false;

    if (!snapshot.schemaReady && relaxedWhenSchemaMissing) {
      return buildGateResult(snapshot, gate, true, { degraded: true, reason: 'schema_missing' });
    }

    if (gate.kind === 'premium_only') {
      return buildGateResult(
        snapshot,
        gate,
        snapshot.isPremium,
        { reason: snapshot.isPremium ? null : 'premium_required' }
      );
    }

    var usage = resolveUsage(context || {}, gate.usageKeys);
    var freeLimit = gate.freeLimit;
    var remaining = snapshot.isPremium ? null : Math.max(0, freeLimit - usage);
    var allowed = snapshot.isPremium || usage < freeLimit;

    return buildGateResult(
      snapshot,
      gate,
      allowed,
      {
        freeLimit: snapshot.isPremium ? null : freeLimit,
        usage: usage,
        remaining: remaining,
        reason: allowed ? null : 'limit_reached',
      }
    );
  }

  function canCreatePlan(record, context) {
    return evaluateFeatureGate('plan_create', record, context);
  }

  function canCreateLimit(record, context) {
    return evaluateFeatureGate('limit_create', record, context);
  }

  function canCreateDebt(record, context) {
    return evaluateFeatureGate('debt_create', record, context);
  }

  function canUseAdvancedReminders(record, context) {
    return evaluateFeatureGate('custom_reminder_time', record, context);
  }

  function canUseAdvancedReports(record, context) {
    return evaluateFeatureGate('advanced_reports', record, context);
  }

  function canUseDeepAnalytics(record, context) {
    return evaluateFeatureGate('deep_analytics', record, context);
  }

  function canUseAiInsights(record, context) {
    return evaluateFeatureGate('ai_insights', record, context);
  }

  function canUseNotificationFeature(record, notificationKey, context) {
    if (notificationKey === 'daily_reminder') {
      return evaluateFeatureGate('daily_morning_reminder', record, context);
    }
    if (notificationKey === 'daily_report') {
      return evaluateFeatureGate('daily_evening_reminder', record, context);
    }
    return buildGateResult(
      finalizeSnapshot((context && context.snapshot) || getSubscriptionSnapshot(record || {}, context || {})),
      { key: notificationKey, kind: 'basic', premiumBenefitKeys: [] },
      true,
      {}
    );
  }

  return {
    PLAN_CODES: PLAN_CODES,
    SUBSCRIPTION_STATUSES: SUBSCRIPTION_STATUSES,
    SUBSCRIPTION_FIELDS: SUBSCRIPTION_FIELDS,
    FEATURE_GATES: FEATURE_GATES,
    FREE_FEATURES: FREE_FEATURES,
    PREMIUM_FEATURES: PREMIUM_FEATURES,
    PRICING_FEATURE_KEYS: PRICING_FEATURE_KEYS,
    PRICING_PLAN_MAP: PRICING_PLAN_MAP,
    resolvePlanPricing: resolvePlanPricing,
    normalizePlanCode: normalizePlanCode,
    normalizeSubscriptionStatus: normalizeSubscriptionStatus,
    hasSubscriptionSchema: hasSubscriptionSchema,
    getPricingPlans: getPricingPlans,
    getSubscriptionSnapshot: function (record, options) {
      return finalizeSnapshot(getSubscriptionSnapshot(record || {}, options || {}));
    },
    getSubscriptionBadge: getSubscriptionBadge,
    evaluateFeatureGate: evaluateFeatureGate,
    canCreatePlan: canCreatePlan,
    canCreateLimit: canCreateLimit,
    canCreateDebt: canCreateDebt,
    canUseAdvancedReminders: canUseAdvancedReminders,
    canUseAdvancedReports: canUseAdvancedReports,
    canUseDeepAnalytics: canUseDeepAnalytics,
    canUseAiInsights: canUseAiInsights,
    canUseNotificationFeature: canUseNotificationFeature,
  };
});
