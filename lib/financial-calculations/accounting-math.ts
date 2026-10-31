/**
 * DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
 * Authoritative Double-Entry Accounting and General Ledger Math
 */

import { round2 } from './project-finances';

export interface JournalLineInput {
  accountId: string;
  debit: number | string;
  credit: number | string;
}

export interface JournalBalanceResult {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  imbalance: number;
}

/**
 * Validates that total debits strictly equal total credits.
 */
export function verifyJournalBalance(lines: JournalLineInput[]): JournalBalanceResult {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const d = round2(line.debit);
    const c = round2(line.credit);
    if (d > 0 && c > 0) {
      throw new Error(`Invalid journal line: account ${line.accountId} has both debit and credit.`);
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

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/**
 * Calculates current account balance given opening balance and movements
 * Normal Balance Rules:
 * - Asset / Expense: Increases with Debit, Decreases with Credit
 * - Liability / Equity / Revenue: Increases with Credit, Decreases with Debit
 */
export function calculateAccountBalance(
  type: AccountType,
  openingBalance: number | string,
  totalDebits: number | string,
  totalCredits: number | string
): number {
  const opening = round2(openingBalance);
  const debits = round2(totalDebits);
  const credits = round2(totalCredits);

  if (type === 'asset' || type === 'expense') {
    return round2(opening + debits - credits);
  } else {
    return round2(opening + credits - debits);
  }
}

/**
 * Calculates contractor invoice vs payment liability
 * When an invoice is approved, liability increases.
 * When payment is posted, liability decreases.
 * Expense is recognized at invoice approval; settlement DOES NOT re-recognize expense.
 */
export function calculateContractorLiability(
  agreedFee: number | string,
  invoicedTotal: number | string,
  paidTotal: number | string
): { agreedFee: number; invoicedTotal: number; paidTotal: number; outstandingPayable: number } {
  const fee = round2(agreedFee);
  const invoiced = round2(invoicedTotal);
  const paid = round2(paidTotal);
  const outstandingPayable = Math.max(0, round2(invoiced - paid));

  return {
    agreedFee: fee,
    invoicedTotal: invoiced,
    paidTotal: paid,
    outstandingPayable,
  };
}

/**
 * Calculates director profit allocations strictly using defined shareholding percentages.
 */
export interface DirectorShareInput {
  directorId: string;
  sharePercentage: number; // e.g. 20.00
}

export interface DirectorAllocationResult {
  directorId: string;
  sharePercentage: number;
  allocatedAmount: number;
}

export function computeDirectorAllocations(
  distributableProfit: number | string,
  shares: DirectorShareInput[]
): DirectorAllocationResult[] {
  const pool = round2(distributableProfit);
  if (pool <= 0) {
    return shares.map((s) => ({
      directorId: s.directorId,
      sharePercentage: s.sharePercentage,
      allocatedAmount: 0,
    }));
  }

  const totalPercentage = shares.reduce((acc, s) => acc + s.sharePercentage, 0);
  if (Math.abs(totalPercentage - 100) > 0.01) {
    throw new Error(`Director share percentages must sum to 100. Current sum: ${totalPercentage}`);
  }

  let allocatedSum = 0;
  const results: DirectorAllocationResult[] = [];

  for (let i = 0; i < shares.length; i++) {
    const s = shares[i];
    // For the last director, allocate remainder to guarantee exact total matching without rounding penny drift
    if (i === shares.length - 1) {
      const remainder = round2(pool - allocatedSum);
      results.push({
        directorId: s.directorId,
        sharePercentage: s.sharePercentage,
        allocatedAmount: remainder,
      });
    } else {
      const amt = round2((pool * s.sharePercentage) / 100);
      allocatedSum = round2(allocatedSum + amt);
      results.push({
        directorId: s.directorId,
        sharePercentage: s.sharePercentage,
        allocatedAmount: amt,
      });
    }
  }

  return results;
}
