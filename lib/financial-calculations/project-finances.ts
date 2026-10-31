/**
 * DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
 * Authoritative Project Financial Status & Calculation Engine
 *
 * SCOPE RULE: Project completion means client payment completion ONLY.
 * Expenses and contractor payments NEVER affect client payment status.
 */

export interface ProjectFinancialInput {
  contractValue: number | string;
  payments: Array<{
    amount: number | string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted' | 'reversed';
    type: 'client_payment' | 'reversal';
    reversalOfId?: string | null;
  }>;
}

export interface ProjectFinancialSummary {
  contractValue: number;
  validPaymentsTotal: number;
  outstandingReceivable: number;
  clientCredit: number;
  paymentStatus: 'pending' | 'completed';
}

/**
 * Standard rounding to 2 decimal places using fixed precision arithmetic
 */
export function round2(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Formats a monetary number in standard LKR/currency format (e.g. "LKR 1,250,000.00")
 */
export function formatCurrency(amount: number | string, currency: string = 'LKR'): string {
  const val = round2(amount);
  return `${currency} ${val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Computes authoritative project financial balances.
 * Only 'posted' client payments count as valid receipts.
 * Linked reversals subtract from valid receipts.
 * Pending, rejected, draft, or voided transactions NEVER count.
 */
export function computeProjectFinances(input: ProjectFinancialInput): ProjectFinancialSummary {
  const contractVal = round2(input.contractValue);

  let totalValidReceived = 0;

  // Process posted client payments
  for (const p of input.payments) {
    if (p.status === 'posted') {
      const amt = round2(p.amount);
      if (p.type === 'client_payment') {
        totalValidReceived += amt;
      } else if (p.type === 'reversal') {
        // Linked reversal reduces valid receipts
        totalValidReceived -= amt;
      }
    }
  }

  // Bound valid payments to non-negative
  const netPayments = Math.max(0, round2(totalValidReceived));
  const outstanding = Math.max(0, round2(contractVal - netPayments));
  const credit = Math.max(0, round2(netPayments - contractVal));
  const status: 'pending' | 'completed' = netPayments >= contractVal ? 'completed' : 'pending';

  return {
    contractValue: contractVal,
    validPaymentsTotal: netPayments,
    outstandingReceivable: outstanding,
    clientCredit: credit,
    paymentStatus: status,
  };
}
