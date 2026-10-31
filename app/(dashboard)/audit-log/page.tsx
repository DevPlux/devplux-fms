'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDateTime, formatLKR } from '@/lib/formatting/formatters';
import {
  History,
  Search,
  Filter,
  ShieldCheck,
  Download,
  RefreshCw,
  FileText,
  UserCheck,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { createClient } from '@/lib/supabase/client';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  beforeValues?: any;
  afterValues?: any;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // 1. Attempt to fetch through secure server API
      const res = await fetch('/api/audit-logs');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setLogs(
            json.data.map((l: any) => ({
              id: l.id,
              timestamp: l.timestamp || l.created_at,
              actorName: l.actor_name || 'Director',
              actorRole: l.actor_role || 'Director',
              action: l.action,
              entityType: l.entity_type,
              entityId: l.entity_id,
              reason: l.reason || 'Financial record entry',
              beforeValues: l.before_values,
              afterValues: l.after_values,
            }))
          );
          setIsLoading(false);
          return;
        }
      }

      // 2. Direct browser fallback query
      const supabase = createClient();
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (!error && data) {
        setLogs(
          data.map((l: any) => ({
            id: l.id,
            timestamp: l.timestamp || l.created_at,
            actorName: l.actor_name || 'Director',
            actorRole: l.actor_role || 'Director',
            action: l.action,
            entityType: l.entity_type,
            entityId: l.entity_id,
            reason: l.reason || 'Financial record entry',
            beforeValues: l.before_values,
            afterValues: l.after_values,
          }))
        );
      }
    } catch (e) {
      console.warn('Notice loading audit logs:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filter out any raw test rows
  const sanitizedLogs = logs.filter((l) => {
    if (l.action === 'TEST' || l.entityId === 'test' || l.actorName?.toLowerCase().includes('test')) {
      return false;
    }
    if (l.beforeValues && typeof l.beforeValues === 'object' && 'test' in l.beforeValues) {
      return false;
    }
    if (l.afterValues && typeof l.afterValues === 'object' && 'test' in l.afterValues) {
      return false;
    }
    return true;
  });

  const filtered = sanitizedLogs.filter((l) => {
    const matchesSearch =
      (l.entityId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.actorName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.reason || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.action || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesAction =
      actionFilter === 'all' ||
      l.action === actionFilter ||
      (actionFilter === 'PAYMENTS' && (l.action.includes('PAYMENT') || l.action.includes('INCOME'))) ||
      (actionFilter === 'EXPENSES' && l.action.includes('EXPENSE')) ||
      (actionFilter === 'PROJECTS' && l.action.includes('PROJECT')) ||
      (actionFilter === 'DELETIONS' && (l.action.includes('DELETE') || l.action.includes('REVERSE'))) ||
      (actionFilter === 'APPROVALS' && l.action.includes('APPROVE'));

    return matchesSearch && matchesAction;
  });

  const handleExportExcel = () => {
    const data = filtered.map((l) => ({
      'Date & Time (UTC)': formatDateTime(l.timestamp),
      'Acting Director': `${l.actorName} (${l.actorRole})`,
      'Action Executed': l.action,
      'Target Record / Ref': l.entityId,
      'Audit Justification': l.reason,
      'Previous State': formatChangeSummary(l.beforeValues),
      'New State': formatChangeSummary(l.afterValues),
    }));
    exportToExcel('Devplux_Board_Financial_Audit_Trail', data, 'Official Audit Trail');
  };

  return (
    <DashboardLayout
      pageTitle="Corporate Financial Audit Trail"
      pageDescription="Permanent, non-repudiable legal record of all financial postings, board approvals, and modifications."
      userRole="director"
    >
      {/* Executive Governance Assurance Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-blue-950 text-white rounded-xl p-5 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-blue-500/20 border border-blue-400/30 rounded-lg text-blue-300 shrink-0 mt-0.5 sm:mt-0">
              <ShieldCheck className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-white">Board Governance & Tamper-Proof Audit Trail</h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                  Append-Only Sealed
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                Cryptographically protected chronological log. In accordance with Devplux corporate governance rules, 
                every financial transaction, project modification, and director decision is permanently recorded. 
                Historical records cannot be edited or deleted by any user or administrator.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={isLoading}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs"
              icon={<RefreshCw className={`w-3.5 h-3.5 text-blue-200 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh Trail
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs"
              icon={<Download className="w-3.5 h-3.5 text-emerald-300" />}
            >
              Export Official Ledger
            </Button>
          </div>
        </div>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search reference, director, or justification..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-700 font-medium"
          >
            <option value="all">All Audit Actions</option>
            <option value="PROJECTS">Project Actions (Create / Update / Delete)</option>
            <option value="PAYMENTS">Client Income Payments</option>
            <option value="EXPENSES">Operating Expenses</option>
            <option value="DELETIONS">Deletions & Reversals</option>
            <option value="APPROVALS">Board Approvals & Sign-offs</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Showing <span className="font-semibold text-slate-900">{filtered.length}</span> audit event{filtered.length === 1 ? '' : 's'}
        </div>
      </div>

      {/* Audit Log Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Acting Director</th>
                <th className="px-6 py-3.5">Governance Action</th>
                <th className="px-6 py-3.5">Target Record</th>
                <th className="px-6 py-3.5">Audit Justification & Notes</th>
                <th className="px-6 py-3.5 text-right">Financial State Transition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span>Loading immutable audit ledger from database...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-700">No matching audit trail records found.</p>
                    <p className="text-xs text-slate-400 mt-0.5">New financial operations will automatically generate permanent audit records.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {formatDateTime(l.timestamp)}
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                        {l.actorName}
                      </p>
                      <p className="text-[11px] text-slate-500 font-medium pl-5">{l.actorRole}</p>
                    </td>
                    <td className="px-6 py-3.5 whitespace-nowrap">
                      {getActionBadge(l.action)}
                    </td>
                    <td className="px-6 py-3.5 font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {l.entityId}
                    </td>
                    <td className="px-6 py-3.5 text-slate-700 max-w-sm leading-relaxed">
                      {l.reason}
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      {renderStateTransition(l.beforeValues, l.afterValues)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}

// ----------------------------------------------------------------------
// Helper Functions for Corporate Presentation
// ----------------------------------------------------------------------

function getActionBadge(action: string) {
  const norm = (action || '').toUpperCase();

  if (norm.includes('CREATE') || norm.includes('INITIALIZED')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }
  if (norm.includes('PAYMENT') || norm.includes('INCOME')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }
  if (norm.includes('EXPENSE')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }
  if (norm.includes('UPDATE') || norm.includes('MODIFY')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }
  if (norm.includes('DELETE') || norm.includes('REVERSE')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }
  if (norm.includes('APPROVE')) {
    return (
      <span className="font-semibold text-[10px] tracking-wider uppercase bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded">
        {action.replace(/_/g, ' ')}
      </span>
    );
  }

  return (
    <span className="font-semibold text-[10px] tracking-wider uppercase bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
      {action.replace(/_/g, ' ')}
    </span>
  );
}

function formatChangeSummary(val: any): string {
  if (!val) return '—';
  if (typeof val === 'string') return val;
  if (typeof val !== 'object') return String(val);

  const parts: string[] = [];
  if (val.amount !== undefined) {
    parts.push(`Amount: LKR ${Number(val.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }
  if (val.contractValue !== undefined) {
    parts.push(`Contract: LKR ${Number(val.contractValue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  }
  if (val.vendor) parts.push(`Vendor: ${val.vendor}`);
  if (val.name) parts.push(`Name: ${val.name}`);
  if (val.clientName) parts.push(`Client: ${val.clientName}`);
  if (val.paymentType) parts.push(`Type: ${val.paymentType}`);
  if (val.status) parts.push(`Status: ${val.status}`);
  if (val.isPaid !== undefined) parts.push(val.isPaid ? 'Settled' : 'Accrued');
  if (val.softDeleted) parts.push('Soft-Deleted');

  if (parts.length > 0) return parts.join(' | ');

  const otherKeys = Object.keys(val).filter((k) => k !== 'test');
  if (otherKeys.length === 0) return '—';
  return otherKeys.map((k) => `${k}: ${val[k]}`).join(' | ');
}

function renderStateTransition(before: any, after: any) {
  if (!before && !after) {
    return <span className="text-slate-400 italic">No transition</span>;
  }

  // 1. Initial creation (before is null, after exists)
  if (!before && after) {
    if (after.amount !== undefined) {
      return (
        <div className="flex flex-col items-end">
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded text-[11px]">
            + {formatLKR(after.amount)}
          </span>
          {after.paymentType && (
            <span className="text-[10px] text-slate-500 capitalize mt-0.5">
              {after.paymentType} {after.status ? `• ${after.status}` : ''}
            </span>
          )}
        </div>
      );
    }
    if (after.contractValue !== undefined) {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded text-[11px]">
          Contract: {formatLKR(after.contractValue)}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
        {formatChangeSummary(after)}
      </span>
    );
  }

  // 2. Both before and after exist (Update)
  if (before && after) {
    if (before.amount !== undefined && after.amount !== undefined) {
      return (
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <span className="text-slate-400 line-through text-[11px]">{formatLKR(before.amount)}</span>
            <span className="text-slate-400 text-xs">→</span>
            <span className="text-emerald-700 font-bold text-xs">{formatLKR(after.amount)}</span>
          </div>
          {after.paymentType && before.paymentType && before.paymentType !== after.paymentType && (
            <span className="text-[10px] text-slate-500">
              {before.paymentType} → {after.paymentType}
            </span>
          )}
        </div>
      );
    }

    if (before.contractValue !== undefined && after.contractValue !== undefined) {
      return (
        <div className="flex items-center justify-end gap-1.5 font-medium">
          <span className="text-slate-400 line-through text-[11px]">{formatLKR(before.contractValue)}</span>
          <span className="text-slate-400 text-xs">→</span>
          <span className="text-blue-700 font-bold text-xs">{formatLKR(after.contractValue)}</span>
        </div>
      );
    }

    if (after.status === 'reversed' || after.softDeleted) {
      return (
        <span className="inline-flex items-center font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded text-[11px]">
          Record Reversed (Soft-Deleted)
        </span>
      );
    }

    if (after.account_status === 'enacted' || after.must_change_password === false) {
      return (
        <span className="inline-flex items-center font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
          Setup Completed & Enacted
        </span>
      );
    }

    return (
      <div className="flex flex-col items-end gap-0.5 text-[11px]">
        <span className="text-slate-400 line-through">{formatChangeSummary(before)}</span>
        <span className="text-slate-700 font-semibold">{formatChangeSummary(after)}</span>
      </div>
    );
  }

  // 3. Deletion (only before exists)
  if (before && !after) {
    return (
      <span className="inline-flex items-center font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded text-[11px]">
        Deleted: {formatChangeSummary(before)}
      </span>
    );
  }

  return <span className="text-slate-500">—</span>;
}
