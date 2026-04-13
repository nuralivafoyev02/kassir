#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function loadParser() {
  const filePath = path.join(__dirname, '..', 'api', 'bot.js');
  const source = fs.readFileSync(filePath, 'utf8') + `
module.exports.__test = { parseText, extractAmountMeta, resolveCategoryForUser, parseDebtIntent, parseDebtSettlementIntent };`;

  class TelegramBotStub {
    constructor() {}
  }

  function makeDbStub() {
    const chain = new Proxy(function noop() {}, {
      get() { return chain; },
      apply() { return chain; },
    });

    return {
      from: () => chain,
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
      },
    };
  }

  const sandbox = {
    require(name) {
      if (name === 'node-telegram-bot-api') return TelegramBotStub;
      if (name === '@supabase/supabase-js') return { createClient: () => makeDbStub() };
      if (name === '../lib/telegram-ops.cjs') {
        return {
          createTelegramOps: () => ({
            local() {},
            error() {},
            info() {},
            success() {},
            notifyNewUser() {},
          }),
        };
      }
      if (name === '../public/kassa.subscription.js') return {};
      return require(name);
    },
    process: { env: { BOT_TOKEN: 'x', SUPABASE_URL: 'x', SUPABASE_KEY: 'x' } },
    console,
    fetch: async () => ({
      ok: true,
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
      clone() { return this; },
    }),
    FormData: class FormData { append() {} },
    Blob: class Blob {},
    Buffer,
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    exports: {},
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: filePath });
  return sandbox.module.exports.__test;
}

function run() {
  const parser = loadParser();
  const userCategories = [
    { name: 'Suv', type: 'expense' },
    { name: 'Kvartira', type: 'expense' },
    { name: "Do'kon", type: 'expense' },
    { name: 'Benzin', type: 'expense' },
    { name: 'Transport', type: 'expense' },
    { name: 'Taksi', type: 'expense' },
    { name: 'Sotuv', type: 'income' },
    { name: 'Oylik', type: 'income' },
    { name: "Sovg'a", type: 'income' },
  ];

  const personExpense = parser.parseText('mirshodga 50 ming');
  assert(personExpense, 'mirshodga 50 ming parse bo‘lishi kerak');
  assert.equal(personExpense.type, 'expense');
  assert.equal(personExpense.category, 'Xarajat');
  assert.equal(parser.resolveCategoryForUser(personExpense, userCategories, 'mirshodga 50 ming'), 'Xarajat');

  const waterExpense = parser.parseText("suvga 50 ming to'ladim");
  assert(waterExpense, "suvga 50 ming to'ladim parse bo‘lishi kerak");
  assert.equal(waterExpense.category, 'Suv');
  assert.equal(parser.resolveCategoryForUser(waterExpense, userCategories, "suvga 50 ming to'ladim"), 'Suv');

  const storeExpense = parser.parseText("do'konga 70 ming");
  assert(storeExpense, "do'konga 70 ming parse bo‘lishi kerak");
  assert.equal(storeExpense.category, "Do'kon");
  assert.equal(parser.resolveCategoryForUser(storeExpense, userCategories, "do'konga 70 ming"), "Do'kon");

  const benzineExpense = parser.parseText('Ozodbek uchun 120 ming benzin');
  assert.equal(benzineExpense.category, 'Benzin');
  assert.equal(parser.resolveCategoryForUser(benzineExpense, userCategories, 'Ozodbek uchun 120 ming benzin'), 'Benzin');

  const taxiExpense = parser.parseText('Shuhratga 90 ming taksi berdim');
  assert.equal(taxiExpense.category, 'Taksi');
  assert.equal(parser.resolveCategoryForUser(taxiExpense, userCategories, 'Shuhratga 90 ming taksi berdim'), 'Taksi');

  const lavashExpense = parser.parseText('bugun 1 mlnga lavash oldim');
  assert.equal(lavashExpense.amount, 1000000);
  assert.equal(lavashExpense.type, 'expense');
  assert.equal(lavashExpense.category, 'Lavash');

  const utilityWithSuffix = parser.parseText("50 mingga suv to'ladim");
  assert.equal(utilityWithSuffix.amount, 50000);
  assert.equal(utilityWithSuffix.category, 'Suv');
  assert.equal(parser.resolveCategoryForUser(utilityWithSuffix, userCategories, "50 mingga suv to'ladim"), 'Suv');

  const incomeWithSuffix = parser.parseText('1 mlndan foyda keldi');
  assert.equal(incomeWithSuffix.amount, 1000000);
  assert.equal(incomeWithSuffix.type, 'income');
  assert.equal(incomeWithSuffix.category, 'Foyda');

  const worthExpense = parser.parseText('1 mlnlik telefon oldim');
  assert.equal(worthExpense.amount, 1000000);
  assert.equal(worthExpense.type, 'expense');
  assert.equal(worthExpense.category, 'Telefon');

  const amountMetaWithSuffix = parser.extractAmountMeta("1 millionga mashina uchun to'ladim");
  assert(amountMetaWithSuffix, 'millionga holati parse bo‘lishi kerak');
  assert.equal(amountMetaWithSuffix.amount, 1000000);

  const saleIncome = parser.parseText('Mijozdan 500 ming oldim');
  assert.equal(saleIncome.type, 'income');
  assert.equal(parser.resolveCategoryForUser(saleIncome, userCategories, 'Mijozdan 500 ming oldim'), 'Sotuv');

  const giftIncome = parser.parseText('Onamdan 200 ming oldim');
  assert.equal(giftIncome.type, 'income');
  assert.equal(parser.resolveCategoryForUser(giftIncome, userCategories, 'Onamdan 200 ming oldim'), "Sovg'a");

  const debt = parser.parseDebtIntent('Bekzodga 200 ming qarz berdim');
  assert(debt, 'qarz intent topilishi kerak');
  assert.equal(debt.personName, 'Bekzod');
  assert.equal(debt.direction, 'receivable');

  const settlement = parser.parseDebtSettlementIntent('Bekzoddan 200 ming qaytdi');
  assert(settlement, 'qarz settlement intent topilishi kerak');
  assert.equal(settlement.personName, 'Bekzod');
  assert.equal(settlement.direction, 'receivable');

  console.log('bot parser regression passed');
}

run();
