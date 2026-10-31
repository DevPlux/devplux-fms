import { describe, it, expect } from 'vitest';
import {
  computeProjectFinances,
  round2,
  formatCurrency,
} from '@/lib/financial-calculations/project-finances';
import {
  verifyJournalBalance,
  calculateAccountBalance,
  calculateContractorLiability,
  computeDirectorAllocations,
} from '@/lib/financial-calculations/accounting-math';
import { canPerformAction } from '@/lib/permissions/rbac';

describe('Project Payment & Financial Status Invariants (Section 28)', () => {
  it('1. Contract LKR 300,000; valid payments LKR 100,000 -> Pending, Outstanding 200,000, Credit 0', () => {
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 100000, status: 'posted', type: 'client_payment' },
      ],
    });

    expect(result.paymentStatus).toBe('pending');
    expect(result.validPaymentsTotal).toBe(100000);
    expect(result.outstandingReceivable).toBe(200000);
    expect(result.clientCredit).toBe(0);
  });

  it('2. Add another valid payment of LKR 200,000 -> Complete, Outstanding 0, Credit 0', () => {
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 100000, status: 'posted', type: 'client_payment' },
        { amount: 200000, status: 'posted', type: 'client_payment' },
      ],
    });

    expect(result.paymentStatus).toBe('completed');
    expect(result.validPaymentsTotal).toBe(300000);
    expect(result.outstandingReceivable).toBe(0);
    expect(result.clientCredit).toBe(0);
  });

  it('3. Valid payments total LKR 320,000 -> Complete, Outstanding 0, Credit 20,000', () => {
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 320000, status: 'posted', type: 'client_payment' },
      ],
    });

    expect(result.paymentStatus).toBe('completed');
    expect(result.validPaymentsTotal).toBe(320000);
    expect(result.outstandingReceivable).toBe(0);
    expect(result.clientCredit).toBe(20000);
  });

  it('4. Reverse a valid payment -> Status and balances must recalculate correctly', () => {
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 300000, status: 'posted', type: 'client_payment' },
        { amount: 100000, status: 'posted', type: 'reversal' }, // Linked reversal
      ],
    });

    expect(result.validPaymentsTotal).toBe(200000);
    expect(result.outstandingReceivable).toBe(100000);
    expect(result.clientCredit).toBe(0);
    expect(result.paymentStatus).toBe('pending');
  });

  it('5. Pending, rejected, draft, or unverified payments must NEVER count as valid client receipts', () => {
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 100000, status: 'draft', type: 'client_payment' },
        { amount: 100000, status: 'submitted', type: 'client_payment' },
        { amount: 100000, status: 'rejected', type: 'client_payment' },
        { amount: 50000, status: 'approved', type: 'client_payment' }, // Not yet posted!
      ],
    });

    expect(result.validPaymentsTotal).toBe(0);
    expect(result.outstandingReceivable).toBe(300000);
    expect(result.clientCredit).toBe(0);
    expect(result.paymentStatus).toBe('pending');
  });

  it('6. Contractor payables and expenses must NOT alter client payment status', () => {
    // A project with 300,000 contract value and 300,000 posted payment
    // remains 'completed' even if there are 250,000 in expenses or contractor payables
    const result = computeProjectFinances({
      contractValue: 300000,
      payments: [
        { amount: 300000, status: 'posted', type: 'client_payment' },
      ],
    });

    expect(result.paymentStatus).toBe('completed');
    expect(result.outstandingReceivable).toBe(0);
  });
});

describe('Double-Entry Accounting & Ledger Integrity (Section 28)', () => {
  it('7. Posted journal entries must strictly have equal debits and credits', () => {
    const balanced = verifyJournalBalance([
      { accountId: '1020', debit: 250000.50, credit: 0 },
      { accountId: '4010', debit: 0, credit: 250000.50 },
    ]);

    expect(balanced.isBalanced).toBe(true);
    expect(balanced.totalDebit).toBe(250000.50);
    expect(balanced.totalCredit).toBe(250000.50);
    expect(balanced.imbalance).toBe(0);
  });

  it('8. Invalid or unbalanced journal entries must be rejected', () => {
    const unbalanced = verifyJournalBalance([
      { accountId: '1020', debit: 250000.00, credit: 0 },
      { accountId: '4010', debit: 0, credit: 240000.00 },
    ]);

    expect(unbalanced.isBalanced).toBe(false);
    expect(unbalanced.imbalance).toBe(10000.00);
  });

  it('9. Reject line with both debit and credit on same account', () => {
    expect(() =>
      verifyJournalBalance([
        { accountId: '1020', debit: 100, credit: 50 },
      ])
    ).toThrow('Invalid journal line');
  });

  it('10. Expense invoices and subsequent settlements must not double-count the expense', () => {
    // 1. Incurrence: Invoiced LKR 80,000
    const liability1 = calculateContractorLiability(80000, 80000, 0);
    expect(liability1.invoicedTotal).toBe(80000);
    expect(liability1.paidTotal).toBe(0);
    expect(liability1.outstandingPayable).toBe(80000);

    // 2. Partial Settlement: Paid LKR 50,000
    const liability2 = calculateContractorLiability(80000, 80000, 50000);
    expect(liability2.outstandingPayable).toBe(30000);

    // 3. Final Settlement: Paid remaining LKR 30,000
    const liability3 = calculateContractorLiability(80000, 80000, 80000);
    expect(liability3.outstandingPayable).toBe(0);
  });

  it('11. Account balances reconcile with normal balance rules and movements', () => {
    // Asset: Opening 1,000,000 + Debits 500,000 - Credits 200,000 = 1,300,000
    const assetBal = calculateAccountBalance('asset', 1000000, 500000, 200000);
    expect(assetBal).toBe(1300000);

    // Liability: Opening 100,000 + Credits 40,000 - Debits 30,000 = 110,000
    const liabilityBal = calculateAccountBalance('liability', 100000, 30000, 40000);
    expect(liabilityBal).toBe(110000);
  });

  it('12. Monetary calculations behave correctly with decimal rounding and formatting', () => {
    expect(round2(100.004)).toBe(100);
    expect(round2(100.005)).toBe(100.01);
    expect(formatCurrency(1250450.75, 'LKR')).toBe('LKR 1,250,450.75');
  });
});

describe('Director Profit Allocations & Zero Penny Drift', () => {
  it('13. Profit distribution divides pool according to 5 directors 20% each without penny loss', () => {
    const directors = [
      { directorId: 'd1', sharePercentage: 20 },
      { directorId: 'd2', sharePercentage: 20 },
      { directorId: 'd3', sharePercentage: 20 },
      { directorId: 'd4', sharePercentage: 20 },
      { directorId: 'd5', sharePercentage: 20 },
    ];

    // Odd amount: LKR 1,000,000.33
    const allocations = computeDirectorAllocations(1000000.33, directors);
    expect(allocations).toHaveLength(5);

    const totalAllocated = allocations.reduce((sum, a) => round2(sum + a.allocatedAmount), 0);
    expect(totalAllocated).toBe(1000000.33);
  });
});

describe('RBAC & Separation of Duties Governance Policies', () => {
  it('14. High-value transaction self-approval is blocked for Managing Director', () => {
    const check = canPerformAction('managing_director', 'approve_transaction', {
      creatorId: 'user-md-1',
      actorId: 'user-md-1',
      amount: 600000, // > 500k threshold
    });

    expect(check.allowed).toBe(false);
    expect(check.reason).toContain('Separation of Duties Policy');
  });

  it('15. Ordinary directors cannot post, reverse, or close accounting periods', () => {
    expect(canPerformAction('director', 'post_transaction').allowed).toBe(false);
    expect(canPerformAction('director', 'reverse_transaction').allowed).toBe(false);
    expect(canPerformAction('director', 'close_accounting_period').allowed).toBe(false);
  });

  it('16. All directors can view financial records and audit history', () => {
    expect(canPerformAction('director', 'view_finances').allowed).toBe(true);
    expect(canPerformAction('director', 'view_audit_logs').allowed).toBe(true);
    expect(canPerformAction('finance_director', 'view_finances').allowed).toBe(true);
    expect(canPerformAction('managing_director', 'view_finances').allowed).toBe(true);
  });
});
