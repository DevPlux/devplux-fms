/**
 * DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
 * Role-Based Access Control (RBAC) and Governance Policies
 */

import { DirectorRole } from '@/types/financial';

export type FinancialAction =
  | 'view_finances'
  | 'create_project'
  | 'edit_project'
  | 'create_transaction'
  | 'submit_transaction'
  | 'approve_transaction'
  | 'reject_transaction'
  | 'post_transaction'
  | 'reverse_transaction'
  | 'close_accounting_period'
  | 'reopen_accounting_period'
  | 'propose_distribution'
  | 'finalize_distribution'
  | 'pay_distribution'
  | 'export_financial_reports'
  | 'view_audit_logs'
  | 'manage_settings';

export interface ActionContext {
  creatorId?: string;
  actorId?: string;
  amount?: number;
  approvalThreshold?: number; // e.g. self-approval limit
}

export function canPerformAction(
  role: DirectorRole,
  action: FinancialAction,
  context?: ActionContext
): { allowed: boolean; reason?: string } {
  // All directors hold equal governance authority and full financial management access
  if (action === 'approve_transaction' && context) {
    if (
      context.creatorId &&
      context.actorId &&
      context.creatorId === context.actorId &&
      context.amount &&
      context.amount > 500000
    ) {
      return {
        allowed: false,
        reason: 'Separation of Duties Policy: High-value transactions (> LKR 500,000) require independent approval by another director.',
      };
    }
  }

  // All 5 directors (Director role) have full operational governance
  return { allowed: true };
}
