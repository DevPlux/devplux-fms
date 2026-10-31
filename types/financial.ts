/**
 * DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
 * Central TypeScript Interfaces and Financial Types
 */

export type DirectorRole = 'managing_director' | 'finance_director' | 'director';

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: DirectorRole;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  registrationNo?: string;
  defaultCurrency: string;
  createdAt: string;
}

export interface FinancialAccount {
  id: string;
  companyId: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  currency: string;
  openingBalance: number;
  currentBalance: number;
  isActive: boolean;
  description?: string;
}

export interface Project {
  id: string;
  companyId: string;
  displayId: string; // e.g. DPL-2026-0001
  name: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  contractValue: number;
  currency: string;
  startDate: string;
  paymentSchedule?: Array<{
    title: string;
    expectedDate: string;
    amount: number;
  }>;
  notes?: string;
  paymentStatus: 'pending' | 'completed';
  validPaymentsTotal: number;
  outstandingReceivable: number;
  clientCredit: number;
  isArchived: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType =
  | 'client_payment'
  | 'expense'
  | 'contractor_invoice'
  | 'contractor_payment'
  | 'director_distribution'
  | 'director_payment'
  | 'account_transfer'
  | 'reversal';

export type TransactionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'reversed';

export interface CanonicalTransaction {
  id: string;
  companyId: string;
  referenceNo: string;
  type: TransactionType;
  amount: number;
  currency: string;
  transactionDate: string;
  description: string;
  status: TransactionStatus;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  postedBy?: string;
  postedAt?: string;
  idempotencyKey?: string;
  reversalOfId?: string;
  reversalReason?: string;
  accountingPeriodId?: string;
  createdAt: string;
}

export interface ClientPaymentDetail {
  id: string;
  transactionId: string;
  projectId: string;
  paymentType: 'advance' | 'milestone' | 'final' | 'other';
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash' | 'online';
  externalReference?: string;
  bankAccountId: string;
  receiptUrl?: string;
  notes?: string;
  project?: Project;
  bankAccount?: FinancialAccount;
  transaction?: CanonicalTransaction;
}

export interface ExpenseDetail {
  id: string;
  transactionId: string;
  projectId?: string;
  categoryId: string;
  vendor: string;
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash' | 'credit_card' | 'payable';
  bankAccountId?: string;
  payableAccountId?: string;
  invoiceReference?: string;
  receiptUrl?: string;
  isPaid: boolean;
  project?: Project;
  category?: { id: string; name: string };
  transaction?: CanonicalTransaction;
}

export interface Contractor {
  id: string;
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  skillSet?: string;
  defaultAgreedFee: number;
  isActive: boolean;
}

export interface ContractorInvoice {
  id: string;
  transactionId?: string;
  contractorId: string;
  projectId: string;
  invoiceNo: string;
  amount: number;
  invoiceDate: string;
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'cancelled';
  paidAmount: number;
  invoiceUrl?: string;
  notes?: string;
  contractor?: Contractor;
  project?: Project;
}

export interface ContractorPayment {
  id: string;
  transactionId: string;
  invoiceId: string;
  contractorId: string;
  bankAccountId: string;
  amount: number;
  paymentMethod: 'bank_transfer' | 'cheque' | 'cash';
  referenceNo?: string;
  contractor?: Contractor;
  invoice?: ContractorInvoice;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  transactionId: string;
  entryNo: string;
  entryDate: string;
  description: string;
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  postedBy: string;
  postedAt: string;
  lines?: JournalLine[];
}

export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  account?: FinancialAccount;
}

export interface AccountingPeriod {
  id: string;
  companyId: string;
  year: number;
  month: number;
  name: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'closed';
  closedBy?: string;
  closedAt?: string;
  totalRevenue: number;
  totalExpense: number;
  netProfit: number;
}

export interface DirectorAllocation {
  id: string;
  periodId: string;
  directorId: string;
  allocationPercentage: number;
  distributablePool: number;
  allocatedAmount: number;
  paidAmount: number;
  status: 'proposed' | 'approved' | 'finalized' | 'paid';
  director?: Profile;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeValues?: Record<string, unknown>;
  afterValues?: Record<string, unknown>;
  reason?: string;
  timestamp: string;
  actor?: Profile;
}

export interface ModificationApproval {
  id: string;
  companyId: string;
  entityType: 'project' | 'client_payment' | 'expense';
  entityId: string;
  entityReference: string;
  entityName: string;
  actionType: 'update' | 'delete';
  initiatorId?: string;
  initiatorName: string;
  initiatorRole: string;
  details: {
    reason?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
    changesSummary?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewerName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}
