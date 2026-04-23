import assert from "node:assert/strict";

import {
  buildDailyReportPdf,
  summarizeDailyReport,
} from "../services/reports/daily-report.mjs";

const dataset = {
  transactions: Array.from({ length: 34 }, (_, index) => ({
    type: index % 3 === 0 ? "income" : "expense",
    amount: 150000 + index * 12000,
    category: index % 2 === 0 ? "Savdo va buyurtmalar" : "Ofis xarajatlari",
    receipt_url: index % 4 === 0 ? `https://example.com/${index}.jpg` : "",
    date: new Date(Date.UTC(2026, 3, 18, 7, index % 60)).toISOString(),
  })),
  debts: [
    {
      person_name: "Bekzod",
      direction: "receivable",
      amount: 550000,
      created_at: new Date(Date.UTC(2026, 3, 18, 10, 30)).toISOString(),
    },
  ],
  plans: [
    {
      category: "Marketing",
      amount: 2500000,
      alert_before: 500000,
      created_at: new Date(Date.UTC(2026, 3, 18, 8, 15)).toISOString(),
    },
  ],
};

const summary = summarizeDailyReport(dataset);
assert.equal(summary.transactionsCount, 34);
assert.equal(summary.debtsCount, 1);
assert.equal(summary.plansCount, 1);
assert.equal(summary.receiptsCount, 9);
assert.equal(summary.totalActivities, 36);

const pdfBytes = buildDailyReportPdf(dataset, {
  generatedAt: new Date("2026-04-18T22:00:00+05:00"),
  timeZone: "Asia/Tashkent",
  fullName: "Azizbek Test",
});

assert(pdfBytes instanceof Uint8Array, "PDF bytes Uint8Array bo'lishi kerak");
assert(pdfBytes.length > 12000, "PDF yetarli hajmda generatsiya bo'lishi kerak");

const pdfText = Buffer.from(pdfBytes).toString("latin1");
assert(pdfText.startsWith("%PDF-1.4"), "PDF header topilmadi");
assert((pdfText.match(/\/Type \/Page\b/g) || []).length >= 2, "Ko'p qatorli dataset uchun pagination bo'lishi kerak");

[
  "Kassa - Moliyaviy hisobot",
  "Davr: Bugungi hisobot",
  "Operatsiyalar",
  "Tranzaksiyalar",
  "Qarzlar",
  "Rejalar",
  "Summa",
  "Sahifa 1/",
].forEach((needle) => {
  assert(pdfText.includes(needle), `PDF ichida '${needle}' topilmadi`);
});

console.log("daily-report-pdf regression ok");
