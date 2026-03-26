process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123456:TEST_TOKEN';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

const test = require('node:test');
const assert = require('node:assert/strict');

const botModule = require('../api/bot.js');
const {
  parseText,
  parsePlanIntent,
  parseDebtIntent,
  parseDebtSettlementIntent,
  hasRegisteredPhone,
  parseStartCommand,
} = botModule.__test__;

test('bare source phrase becomes income instead of expense', () => {
  const parsed = parseText('dadamdan 50 ming');
  assert.ok(parsed);
  assert.equal(parsed.type, 'income');
  assert.notEqual(parsed.category.toLowerCase(), 'dadamdan');
});

test('source phrase with verb stays income', () => {
  const parsed = parseText('dadamdan 50 ming oldim');
  assert.ok(parsed);
  assert.equal(parsed.type, 'income');
});

test('target phrase becomes expense without person category leakage', () => {
  const parsed = parseText('mirshodga 50 ming');
  assert.ok(parsed);
  assert.equal(parsed.type, 'expense');
  assert.equal(parsed.category, "O'tkazma");
});

test('target phrase with give verb stays expense', () => {
  const parsed = parseText('dadamga 50 ming berdim');
  assert.ok(parsed);
  assert.equal(parsed.type, 'expense');
  assert.notEqual(parsed.category.toLowerCase(), 'dadamga');
});

test('person source with arrival verb does not create person category', () => {
  const parsed = parseText('mirshoddan 50 ming keldi');
  assert.ok(parsed);
  assert.equal(parsed.type, 'income');
  assert.notEqual(parsed.category.toLowerCase(), 'mirshoddan');
});

test('plan parser asks for clarification when only person is provided', () => {
  const parsed = parsePlanIntent('ozodbek uchun 500 ming limit');
  assert.ok(parsed);
  assert.equal(parsed.needsClarification, true);
});

test('debt parser keeps normalized person name', () => {
  const parsed = parseDebtIntent('mirshodga qarzga 200 ming berdim');
  assert.ok(parsed);
  assert.equal(parsed.direction, 'receivable');
  assert.equal(parsed.personName, 'Mirshod');
});

test('debt settlement parser detects incoming repayment phrase', () => {
  const parsed = parseDebtSettlementIntent('mirshoddan qarzimga 100 ming oldim');
  assert.ok(parsed);
  assert.equal(parsed.direction, 'receivable');
  assert.equal(parsed.explicit, true);
  assert.equal(parsed.personName, 'Mirshod');
});

test('registration completeness requires phone number', () => {
  assert.equal(hasRegisteredPhone({ phone_number: null }), false);
  assert.equal(hasRegisteredPhone({ phone_number: '+998 90 123 45 67' }), true);
});

test('/start deep-link is parsed as start command', () => {
  const parsed = parseStartCommand('/start promo_2026');
  assert.ok(parsed);
  assert.equal(parsed.command, '/start');
  assert.equal(parsed.payload, 'promo_2026');
});
