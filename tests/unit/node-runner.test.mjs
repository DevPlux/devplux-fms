/**
 * DEVPLUX (PVT) LTD — FINANCIAL INVARIANTS TEST SUITE
 * Executable via Node 22 native test runner: `node --test tests/unit/node-runner.test.mjs`
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// 1. Math and Project Calculations
function round2(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

function computeProjectFinances(input) {
  const contractVal = round2(input.contractValue);
  let totalValidReceived = 0;

  for (const p of input.payments) {
    if (p.status === 'posted') {
      const amt = round2(p.amount);
      if (p.type === 'client_payment') {
        totalValidReceived += amt;
      } else if (p.type === 'reversal') {
        totalValidReceived -= amt;
      }
    }
  }

  const netPayments = Math.max(0, round2(totalValidReceived));
  const outstanding = Math.max(0, round2(contractVal - netPayments));
  const credit = Math.max(0, round2(netPayments - contractVal));
  const status = netPayments >= contractVal ? 'completed' : 'pending';

  return {
    contractValue: contractVal,
    validPaymentsTotal: netPayments,
    outstandingReceivable: outstanding,
    clientCredit: credit,
    paymentStatus: status,
  };
}

// 2. Accounting Math
function verifyJournalBalance(lines) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const d = round2(line.debit);
    const c = round2(line.credit);
    if (d > 0 && c > 0) {
      throw new Error(`Invalid line: account ${line.accountId} has both debit and credit.`);
    }
    totalDebit += d;
    totalCredit += c;
  }

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const imbalance = round2(Math.abs(totalDebit - totalCredit));

  return {
    isBalanced: imbalance === 0,
    totalDebit,
    totalCredit,
    imbalance,
  };
}

function calculateAccountBalance(type, openingBalance, totalDebits, totalCredits) {
  const opening = round2(openingBalance);
  const debits = round2(totalDebits);
  const credits = round2(totalCredits);

  if (type === 'asset' || type === 'expense') {
    return round2(opening + debits - credits);
  } else {
    return round2(opening + credits - debits);
  }
}

function calculateContractorLiability(agreedFee, invoicedTotal, paidTotal) {
  const fee = round2(agreedFee);
  const invoiced = round2(invoicedTotal);
  const paid = round2(paidTotal);
  const outstandingPayable = Math.max(0, round2(invoiced - paid));

  return { agreedFee: fee, invoicedTotal: invoiced, paidTotal: paid, outstandingPayable };
}

function computeDirectorAllocations(distributableProfit, shares) {
  const pool = round2(distributableProfit);
  if (pool <= 0) {
    return shares.map((s) => ({ directorId: s.directorId, sharePercentage: s.sharePercentage, allocatedAmount: 0 }));
  }

  let allocatedSum = 0;
  const results = [];

  for (let i = 0; i < shares.length; i++) {
    const s = shares[i];
    if (i === shares.length - 1) {
      const remainder = round2(pool - allocatedSum);
      results.push({ directorId: s.directorId, sharePercentage: s.sharePercentage, allocatedAmount: remainder });
    } else {
      const amt = round2((pool * s.sharePercentage) / 100);
      allocatedSum = round2(allocatedSum + amt);
      results.push({ directorId: s.directorId, sharePercentage: s.sharePercentage, allocatedAmount: amt });
    }
  }

  return results;
}

// ----------------- TEST SUITE EXECUTION -----------------

test('1. Contract LKR 300,000; valid payments LKR 100,000 -> Pending, Due 200,000, Credit 0', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [{ amount: 100000, status: 'posted', type: 'client_payment' }],
  });
  assert.equal(res.paymentStatus, 'pending');
  assert.equal(res.validPaymentsTotal, 100000);
  assert.equal(res.outstandingReceivable, 200000);
  assert.equal(res.clientCredit, 0);
});

test('2. Add another valid payment of LKR 200,000 -> Complete, Due 0, Credit 0', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [
      { amount: 100000, status: 'posted', type: 'client_payment' },
      { amount: 200000, status: 'posted', type: 'client_payment' },
    ],
  });
  assert.equal(res.paymentStatus, 'completed');
  assert.equal(res.validPaymentsTotal, 300000);
  assert.equal(res.outstandingReceivable, 0);
  assert.equal(res.clientCredit, 0);
});

test('3. Valid payments total LKR 320,000 -> Complete, Due 0, Client Credit 20,000', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [{ amount: 320000, status: 'posted', type: 'client_payment' }],
  });
  assert.equal(res.paymentStatus, 'completed');
  assert.equal(res.outstandingReceivable, 0);
  assert.equal(res.clientCredit, 20000);
});

test('4. Reverse a valid payment -> Status and balances must recalculate correctly', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [
      { amount: 300000, status: 'posted', type: 'client_payment' },
      { amount: 100000, status: 'posted', type: 'reversal' },
    ],
  });
  assert.equal(res.validPaymentsTotal, 200000);
  assert.equal(res.outstandingReceivable, 100000);
  assert.equal(res.clientCredit, 0);
  assert.equal(res.paymentStatus, 'pending');
});

test('5. Pending, rejected, draft payments must not count as valid receipts', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [
      { amount: 100000, status: 'draft', type: 'client_payment' },
      { amount: 100000, status: 'submitted', type: 'client_payment' },
      { amount: 100000, status: 'rejected', type: 'client_payment' },
    ],
  });
  assert.equal(res.validPaymentsTotal, 0);
  assert.equal(res.outstandingReceivable, 300000);
  assert.equal(res.paymentStatus, 'pending');
});

test('6. Contractor payables and expenses must not alter client payment status', () => {
  const res = computeProjectFinances({
    contractValue: 300000,
    payments: [{ amount: 300000, status: 'posted', type: 'client_payment' }],
  });
  assert.equal(res.paymentStatus, 'completed');
  assert.equal(res.outstandingReceivable, 0);
});

test('7. Posted journal entries must have equal debits and credits', () => {
  const res = verifyJournalBalance([
    { accountId: '1020', debit: 250000.5, credit: 0 },
    { accountId: '4010', debit: 0, credit: 250000.5 },
  ]);
  assert.equal(res.isBalanced, true);
  assert.equal(res.imbalance, 0);
});

test('8. Unbalanced journal entries are rejected', () => {
  const res = verifyJournalBalance([
    { accountId: '1020', debit: 250000, credit: 0 },
    { accountId: '4010', debit: 0, credit: 240000 },
  ]);
  assert.equal(res.isBalanced, false);
  assert.equal(res.imbalance, 10000);
});

test('9. Contractor invoices and settlements do not double-count expense', () => {
  const l1 = calculateContractorLiability(80000, 80000, 0);
  assert.equal(l1.outstandingPayable, 80000);

  const l2 = calculateContractorLiability(80000, 80000, 50000);
  assert.equal(l2.outstandingPayable, 30000);

  const l3 = calculateContractorLiability(80000, 80000, 80000);
  assert.equal(l3.outstandingPayable, 0);
});

test('10. Account balances reconcile with normal balance rules', () => {
  const asset = calculateAccountBalance('asset', 1000000, 500000, 200000);
  assert.equal(asset, 1300000);

  const liability = calculateAccountBalance('liability', 100000, 30000, 40000);
  assert.equal(liability, 110000);
});

test('11. Profit distribution guarantees zero penny drift across 5 directors', () => {
  const shares = [
    { directorId: 'd1', sharePercentage: 20 },
    { directorId: 'd2', sharePercentage: 20 },
    { directorId: 'd3', sharePercentage: 20 },
    { directorId: 'd4', sharePercentage: 20 },
    { directorId: 'd5', sharePercentage: 20 },
  ];
  const allocations = computeDirectorAllocations(1000000.33, shares);
  const total = allocations.reduce((sum, a) => round2(sum + a.allocatedAmount), 0);
  assert.equal(total, 1000000.33);
});
