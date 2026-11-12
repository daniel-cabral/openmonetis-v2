import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateUsagePercentage,
  calculateUsageTrend,
  resolveCardUsageInvoiceState,
  resolveUsageTone,
} from "./card-usage-report";

test("usage percentage and tone switch to warning at 50% and to danger at 80%", () => {
  const cases = [
    { used: 4990, limit: 10000, percentage: 49.9, tone: "success" },
    { used: 5000, limit: 10000, percentage: 50, tone: "warning" },
    { used: 7990, limit: 10000, percentage: 79.9, tone: "warning" },
    { used: 8000, limit: 10000, percentage: 80, tone: "danger" },
    { used: 12000, limit: 10000, percentage: 120, tone: "danger" },
    { used: 5000, limit: 0, percentage: 0, tone: "success" },
  ] as const;

  for (const item of cases) {
    const percentage = calculateUsagePercentage(item.used, item.limit);
    assert.equal(percentage, item.percentage, `percentage for ${item.used}/${item.limit}`);
    assert.equal(resolveUsageTone(percentage), item.tone, `tone for ${item.percentage}%`);
  }
});

test("usage trend is stable inside the ±5% band and flips just outside it", () => {
  const cases = [
    { current: 10500, previous: 10000, changePercentage: 5, trend: "stable" },
    { current: 10501, previous: 10000, changePercentage: 5.01, trend: "up" },
    { current: 9500, previous: 10000, changePercentage: -5, trend: "stable" },
    { current: 9499, previous: 10000, changePercentage: -5.01, trend: "down" },
    { current: 120000, previous: 100000, changePercentage: 20, trend: "up" },
    { current: 5000, previous: 0, changePercentage: 100, trend: "up" },
    { current: 0, previous: 0, changePercentage: 0, trend: "stable" },
    { current: 0, previous: 5000, changePercentage: -100, trend: "down" },
  ] as const;

  for (const item of cases) {
    assert.deepEqual(calculateUsageTrend(item.current, item.previous), {
      changePercentage: item.changePercentage,
      trend: item.trend,
    });
  }
});

test("invoice state maps paid, none, pending and overdue from status, amount and record", () => {
  const cases = [
    { status: "paid", amount: 0, hasRecord: false, state: "paid" },
    { status: "open", amount: 0, hasRecord: false, state: "none" },
    { status: "closed", amount: 0, hasRecord: true, state: "pending" },
    { status: "open", amount: 150, hasRecord: false, state: "pending" },
    { status: "overdue", amount: 150, hasRecord: true, state: "overdue" },
  ] as const;

  for (const item of cases) {
    assert.equal(
      resolveCardUsageInvoiceState({
        status: item.status,
        amount: item.amount,
        hasRecord: item.hasRecord,
      }),
      item.state,
      `${item.status}/${item.amount}/${item.hasRecord}`,
    );
  }
});
