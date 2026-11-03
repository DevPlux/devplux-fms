'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime, formatLKR } from '@/lib/formatting/formatters';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Briefcase,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Eye,
  Info,
  Trash2,
  Users,
  FileText,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';
import { toast } from 'sonner';

interface ModificationApprovalRecord {
  id: string;
  company_id: string;
  entity_type: string;
  entity_id: string;
  entity_reference: string;
  entity_name: string;
  action_type: string;
  initiator_name: string;
  initiator_role: string;
  approvers?: string[];
  approvals_count?: number;
  required_approvals?: number;
  details: {
    changesSummary?: string;
    reason?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  status: 'pending' | 'approved' | 'rejected';
  reviewer_name?: string;
  reviewed_at?: string;
  review_notes?: string;
  flagged_by?: string;
  created_at: string;
}

// Convert technical keys into executive, user-friendly labels
function formatKeyLabel(rawKey: string): string {
  const keyMap: Record<string, string> = {
    amount: 'Amount (LKR)',
    disbursedAmount: 'Disbursed Amount (LKR)',
    vendor: 'Vendor / Payee',
    category: 'Expense Category',
    category_id: 'Category Code',
    isPaid: 'Settlement Status',
    is_paid: 'Settlement Status',
    paymentMethod: 'Payment Method',
    payment_method: 'Payment Method',
    paymentType: 'Payment Milestone',
    payment_type: 'Payment Milestone',
    paymentDate: 'Payment Date',
    payment_date: 'Payment Date',
    status: 'Current Standing',
    description: 'Memo / Description',
    reference: 'Transfer Reference',
    referenceNo: 'Reference No',
    reference_no: 'Reference No',
    disbursementAccount: 'Disbursing Bank / Source',
    bankAccount: 'Bank / Cash Account',
    bankAccountId: 'Bank Account ID',
    contractorName: 'Contractor Full Name',
    name: 'Contractor / Client Name',
    skillSet: 'Role / Skill Scope',
    project: 'Assigned Project',
    projectId: 'Project ID',
    projectDisplayId: 'Project Code',
    agreedFee: 'Agreed Fee (LKR)',
    invoicedTotal: 'Invoiced Total (LKR)',
    paidTotal: 'Total Settled (LKR)',
    totalPaidToDate: 'Total Paid to Date (LKR)',
    outstandingPayable: 'Outstanding Payable (LKR)',
    remainingPayable: 'Remaining Balance (LKR)',
    contractValue: 'Contract Value (LKR)',
    clientName: 'Client Name',
    transactionRef: 'Ledger Reference',
    transaction_id: 'Ledger ID',
    receiptUrl: 'Payment Receipt Slip',
    receipt_url: 'Payment Receipt Slip',
  };

  if (keyMap[rawKey]) return keyMap[rawKey];
  return rawKey
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

// Render record attributes in an executive card grid instead of raw JSON
function renderFormattedRecord(data: any, variant: 'neutral' | 'emerald' = 'neutral') {
  if (!data || typeof data !== 'object') {
    return <p className="text-xs text-slate-500 italic">No record attributes available.</p>;
  }

  const entries = Object.entries(data).filter(([key, val]) => {
    if (val === undefined || val === null || val === '') return false;
    // Hide technical transaction_id if an official business reference is already present
    if (key === 'transaction_id' && (data.transactionRef || data.referenceNo || data.reference)) {
      return false;
    }
    return true;
  });

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500 italic">No attributes to display.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {entries.map(([key, val]) => {
        const label = formatKeyLabel(key);
        let displayVal: React.ReactNode = String(val);

        if (key === 'receiptUrl' || key === 'receipt_url') {
          displayVal = val ? (
            <a
              href={String(val)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              View Uploaded Receipt Slip
            </a>
          ) : (
            <span className="text-slate-400 italic">No receipt attached</span>
          );
        } else if (typeof val === 'boolean' || key === 'isPaid' || key === 'is_paid') {
          const isSettled = val === true || val === 'true';
          displayVal = (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                isSettled
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {isSettled ? 'Settled (Paid)' : 'Payable (Unsettled)'}
            </span>
          );
        } else if (
          typeof val === 'number' &&
          /amount|fee|value|payable|total|balance|cost|price/i.test(key)
        ) {
          displayVal = <span className="font-mono font-bold text-slate-900">{formatLKR(val)}</span>;
        } else if (typeof val === 'object') {
          displayVal = Array.isArray(val) ? val.join(', ') : JSON.stringify(val);
        } else {
          displayVal = <span className="text-slate-800 font-medium">{String(val)}</span>;
        }

        return (
          <div
            key={key}
            className={`p-2.5 rounded-md border flex flex-col justify-between ${
              variant === 'emerald'
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {label}
            </span>
            <div className="text-xs mt-1 break-words">{displayVal}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function ApprovalsPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [approvals, setApprovals] = useState<ModificationApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [actionFilter, setActionFilter] = useState<'all' | 'create' | 'delete' | 'update'>('all');

  // Detail Modal
  const [selectedApproval, setSelectedApproval] = useState<ModificationApprovalRecord | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Flag / Reject Modal
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);
  const [itemToFlag, setItemToFlag] = useState<ModificationApprovalRecord | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const fetchApprovals = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/approvals');
      const json = await res.json();
      if (!res.ok || !json.success || !Array.isArray(json.data)) {
        throw new Error(json.error || 'Unable to load approval records');
      }
      setApprovals(json.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load approvals';
      setFetchError(message);
      toast.error(message);
      console.warn('Notice fetching approvals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleAcknowledge = async (item: ModificationApprovalRecord) => {
    setIsSubmittingAction(true);
    try {
      const reviewerName = currentDirector.name || 'Director';
      const notes =
        item.action_type === 'delete'
          ? `Deletion approval signed by ${reviewerName}`
          : item.action_type === 'create'
          ? `Record approval signed by ${reviewerName}`
          : item.action_type === 'disburse'
          ? `Disbursement voucher approved by ${reviewerName}`
          : `Update approved by ${reviewerName}`;

      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          status: 'approved',
          reviewerName,
          reviewNotes: notes,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record peer approval');
      }

      toast.success('Peer approval recorded successfully');
      await fetchApprovals();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to record approval');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleExecuteFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToFlag || flagReason.trim().length < 4) {
      toast.error('Please provide a flag reason with at least 4 characters.');
      return;
    }

    setIsSubmittingAction(true);
    try {
      const reviewerName = currentDirector.name || 'Director';
      const res = await fetch('/api/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: itemToFlag.id,
          status: 'rejected',
          reviewerName,
          reviewNotes: flagReason.trim(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to flag modification');
      }

      toast.success('Modification flagged successfully');
      await fetchApprovals();
      setIsFlagModalOpen(false);
      setItemToFlag(null);
      setFlagReason('');
    } catch (err: any) {
      toast.error(err?.message || 'Unable to flag modification');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const filteredApprovals = approvals.filter((item) => {
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesAction = actionFilter === 'all' || item.action_type === actionFilter;
    return matchesStatus && matchesAction;
  });

  const pendingCount = approvals.filter((a) => a.status === 'pending').length;
  const pendingDeletes = approvals.filter((a) => a.status === 'pending' && a.action_type === 'delete').length;
  const approvedCount = approvals.filter((a) => a.status === 'approved').length;
  const flaggedCount = approvals.filter((a) => a.status === 'rejected').length;

  return (
    <DashboardLayout
      pageTitle="Directors Modification & Approval Queue"
      pageDescription="Board governance: 3/5 Quorum rule (1 Initiator + 2 Peer Directors) with immediate zero-delay ledger execution."
      userRole="director"
    >
      {/* Governance & Real-Time Policy Notice */}
      <Card>
        <CardContent className="p-4 bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Corporate Governance Rule: 3/5 Board Quorum Protocol (1 Initiator + 2 Peer Sign-offs)
              </p>
              <p className="mt-0.5 text-slate-600 leading-relaxed">
                <strong>Zero-Delay Real-Time Execution:</strong> All system calculations (bank balance, ledger, receivables, and profit) update immediately when an entry or deletion is made.
                Under board governance, the initiating director counts as 1 vote, and <strong>2 independent peer directors must review and approve (total 3/5 majority)</strong> for the action to be permanently board-enacted.
                <span className="text-slate-900 font-medium ml-1">Initiating directors cannot approve their own submissions.</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Pending Peer Reviews</p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting 3/5 board quorum</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Pending Deletions</p>
              <Trash2 className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-1">{pendingDeletes}</p>
            <p className="text-[11px] text-rose-500 mt-0.5">Soft-deleted, needs 3/5 quorum to hard-delete</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">3/5 Quorum Achieved</p>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Confirmed by 3+ directors</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Flagged For Review</p>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-1">{flaggedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Peer clarification requested</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={statusFilter === 'all' && actionFilter === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setActionFilter('all');
            }}
          >
            All Entries ({approvals.length})
          </Button>
          <Button
            variant={statusFilter === 'pending' && actionFilter === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('pending');
              setActionFilter('all');
            }}
          >
            Pending Quorum ({pendingCount})
          </Button>
          <Button
            variant={actionFilter === 'create' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActionFilter('create');
              setStatusFilter('all');
            }}
          >
            New Records ({approvals.filter((a) => a.action_type === 'create').length})
          </Button>
          <Button
            variant={actionFilter === 'delete' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActionFilter('delete');
              setStatusFilter('all');
            }}
          >
            Deletions ({approvals.filter((a) => a.action_type === 'delete').length})
          </Button>
          <Button
            variant={actionFilter === 'update' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActionFilter('update');
              setStatusFilter('all');
            }}
          >
            Updates ({approvals.filter((a) => a.action_type === 'update').length})
          </Button>
          <Button
            variant={statusFilter === 'approved' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('approved');
              setActionFilter('all');
            }}
          >
            Enacted (3/5) ({approvedCount})
          </Button>
          <Button
            variant={statusFilter === 'rejected' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('rejected');
              setActionFilter('all');
            }}
          >
            Flagged ({flaggedCount})
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchApprovals}
          isLoading={isLoading}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Queue
        </Button>
      </div>

      {/* Approvals Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <CardTitle>Board Modification & 3/5 Quorum Register</CardTitle>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Requires 3/5 director majority (Creator + 2 independent peers). Initiating directors cannot approve their own submission.
          </p>
        </CardHeader>
        <div className="divide-y divide-slate-100">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500" role="status" aria-live="polite">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Loading board approvals...</p>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
              <AlertTriangle className="h-7 w-7 text-rose-500" />
              <p className="text-sm font-semibold text-slate-800">Unable to load approval queue</p>
              <p className="text-xs text-slate-500">{fetchError}</p>
              <Button variant="outline" size="sm" onClick={fetchApprovals} icon={<RefreshCw className="h-4 w-4" />}>Retry</Button>
            </div>
          ) : filteredApprovals.length === 0 ? (
            <div className="px-5 py-14 text-center text-slate-500">
              <Info className="mx-auto mb-2 h-7 w-7 text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No matching modification notices found</p>
              <p className="mt-1 text-xs">New project, payment, expense, and contractor modifications will appear here for board review.</p>
            </div>
          ) : filteredApprovals.map((item) => {
            const count = item.approvals_count || (item.approvers?.length || 1);
            const approversList = item.approvers || [item.initiator_name];
            const currentDirectorName = (currentDirector?.name || '').trim().toLowerCase();
            const initiatorName = (item.initiator_name || '').trim().toLowerCase();
            const isInitiator = Boolean(currentDirectorName && initiatorName && (
              currentDirectorName === initiatorName ||
              initiatorName.includes(currentDirectorName) ||
              currentDirectorName.includes(initiatorName)
            ));
            const alreadyApproved = approversList.some((n) => {
              const clean = n.trim().toLowerCase();
              return clean === currentDirectorName || currentDirectorName.includes(clean);
            });
            const isApproved = item.status === 'approved';
            const isRejected = item.status === 'rejected';
            const expanded = expandedIds.includes(item.id);
            const entityIcon = item.entity_type === 'client_payment'
              ? <ArrowDownLeft className="h-4 w-4 text-emerald-600" />
              : item.entity_type === 'expense' || item.entity_type === 'contractor_settlement'
              ? <ArrowUpRight className="h-4 w-4 text-rose-600" />
              : item.entity_type === 'contractor'
              ? <Users className="h-4 w-4 text-purple-600" />
              : <Briefcase className="h-4 w-4 text-blue-600" />;
            return (
              <div key={item.id} className="bg-white">
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={`approval-details-${item.id}`}
                  onClick={() => setExpandedIds((prev) => expanded ? prev.filter((id) => id !== item.id) : [...prev, item.id])}
                  className="flex w-full min-w-0 flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:px-6"
                >
                  <span className="shrink-0 text-slate-400">{expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</span>
                  <span className="flex min-w-0 flex-[2_1_230px] items-start gap-2">
                    <span className="mt-0.5 shrink-0">{entityIcon}</span>
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-slate-900">{item.entity_name || item.entity_reference}</span>
                      <span className="mt-1 block break-all font-mono text-[11px] text-slate-500">{item.entity_reference} · {item.entity_type.replace('_', ' ')}</span>
                    </span>
                  </span>
                  <span className="min-w-0 flex-[1_1_130px]">
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Initiated by</span>
                    <span className="block break-words text-xs font-semibold text-slate-800">{item.initiator_name}</span>
                  </span>
                  <span className="flex-[0_1_110px]">
                    <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold ${item.action_type === 'delete' ? 'border-rose-200 bg-rose-50 text-rose-700' : item.action_type === 'create' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>
                      {item.action_type === 'delete' ? 'DELETE' : item.action_type === 'create' ? 'CREATE' : item.action_type === 'disburse' ? 'DISBURSE' : 'UPDATE'}
                    </span>
                  </span>
                  <span className="flex-[0_1_140px]">
                    {isRejected ? <Badge variant="rejected">FLAGGED</Badge> : isApproved || count >= 3 ? <Badge variant="completed">3/5 QUORUM</Badge> : <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">{count}/3 approvals</span>}
                  </span>
                  <span className="ml-auto text-[11px] font-medium text-blue-600">{expanded ? 'Less details' : 'More details'}</span>
                </button>
                {expanded && (
                  <div id={`approval-details-${item.id}`} className="border-t border-slate-100 bg-slate-50/70 px-4 py-5 sm:px-7">
                    <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                      <div><p className="mb-1 font-semibold text-slate-500">Submitted</p><p className="text-slate-900">{formatDateTime(item.created_at)}</p></div>
                      <div><p className="mb-1 font-semibold text-slate-500">Initiator / Role</p><p className="break-words text-slate-900">{item.initiator_name} ({item.initiator_role})</p></div>
                      <div><p className="mb-1 font-semibold text-slate-500">Board approval progress</p><p className="font-semibold text-slate-900">{count} of 3 required (3/5 board quorum)</p></div>
                      <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1 font-semibold text-slate-500">Modification summary</p><p className="break-words text-slate-800">{item.details?.changesSummary || item.entity_name}</p></div>
                      {item.details?.reason && <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1 font-semibold text-slate-500">Reason</p><p className="break-words text-slate-800">{item.details.reason}</p></div>}
                      <div className="sm:col-span-2 lg:col-span-3">
                        <p className="mb-2 font-semibold text-slate-500">Directors / Sign-offs</p>
                        <div className="flex flex-wrap gap-2">{approversList.map((name, idx) => <span key={`${name}-${idx}`} className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-medium text-emerald-800"><CheckCircle2 className="h-3 w-3" />{name}{idx === 0 ? ' (Initiator)' : ' (Peer)'}</span>)}</div>
                      </div>
                      {(item.reviewer_name || item.flagged_by || item.review_notes) && <div className="sm:col-span-2 lg:col-span-3"><p className="mb-1 font-semibold text-slate-500">Review information</p><p className="break-words text-slate-800">{item.flagged_by || item.reviewer_name || 'Director'}{item.reviewed_at ? ` · ${formatDateTime(item.reviewed_at)}` : ''}{item.review_notes ? ` · ${item.review_notes}` : ''}</p></div>}
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                      <Button variant="outline" size="sm" onClick={() => { setSelectedApproval(item); setIsDetailModalOpen(true); }} icon={<Eye className="h-4 w-4" />}>View Full Comparison</Button>
                      <div className="flex flex-wrap items-center gap-2">
                        {isRejected ? <span className="text-xs font-medium text-rose-700">Flagged by: {item.flagged_by || item.reviewer_name || 'Director'}</span>
                          : isApproved || count >= 3 ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Board Quorum Enacted (3/5)</span>
                          : isInitiator ? <span className="text-xs text-slate-600">You initiated this · Needs 2 peer approvals</span>
                          : alreadyApproved ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />You Approved ({count}/3) · Needs 1 more peer</span>
                          : <>
                            <Button variant="primary" size="sm" onClick={() => handleAcknowledge(item)} isLoading={isSubmittingAction} icon={<CheckCircle2 className="h-4 w-4" />}>
                              {item.action_type === 'delete' ? `Approve Delete (${count}/3)` : item.action_type === 'disburse' ? `Approve Payout (${count}/3)` : item.action_type === 'create' ? `Approve Record (${count}/3)` : `Approve (${count}/3)`}
                            </Button>
                            <Button variant="danger" size="sm" onClick={() => { setItemToFlag(item); setIsFlagModalOpen(true); }} icon={<AlertTriangle className="h-4 w-4" />}>Flag</Button>
                          </>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Details Comparison Modal */}
      {selectedApproval && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Board Record Details: ${selectedApproval.entity_name} (${selectedApproval.entity_reference})`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Action Type:</span>
                <span className="font-bold uppercase text-slate-900">{selectedApproval.action_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Initiating Director:</span>
                <span className="font-bold text-slate-900">
                  {selectedApproval.initiator_name} ({selectedApproval.initiator_role})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">3/5 Quorum Status:</span>
                <span className="font-bold text-blue-700">
                  {selectedApproval.approvals_count || 1} of 3 Required Approvals (3/5 Board Quorum)
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200">
                <span className="font-semibold text-slate-700">Directors Who Have Approved:</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(selectedApproval.approvers || [selectedApproval.initiator_name]).map((name, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-medium"
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      {name} {idx === 0 ? '(Initiator)' : '(Peer Approval)'}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200">
                <span className="font-semibold text-slate-700">Submission Timestamp:</span>
                <span className="text-slate-600">{formatDateTime(selectedApproval.created_at)}</span>
              </div>
              {selectedApproval.details?.reason && (
                <div className="pt-1 border-t border-slate-200">
                  <span className="font-semibold text-slate-700">Director Stated Reason:</span>
                  <p className="text-slate-800 italic mt-0.5">{selectedApproval.details.reason}</p>
                </div>
              )}
            </div>

            {selectedApproval.details?.changesSummary && (
              <div>
                <p className="font-semibold text-slate-800 mb-1">Executive Summary:</p>
                <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-md">
                  {selectedApproval.details.changesSummary}
                </div>
              </div>
            )}

            {/* Before and After Comparison (Clean UI, No Raw JSON) */}
            {selectedApproval.details?.before && selectedApproval.details?.after && (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <p className="font-bold text-xs text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                    Prior Record State (Before Modification)
                  </p>
                  {renderFormattedRecord(selectedApproval.details.before, 'neutral')}
                </div>
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <p className="font-bold text-xs text-emerald-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Proposed / Updated Record State (After Modification)
                  </p>
                  {renderFormattedRecord(selectedApproval.details.after, 'emerald')}
                </div>
              </div>
            )}

            {/* Post Record Info (Clean UI, No Raw JSON) */}
            {!selectedApproval.details?.before && selectedApproval.details?.after && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg pt-2">
                <p className="font-bold text-xs text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Registered Record Attributes
                </p>
                {renderFormattedRecord(selectedApproval.details.after, 'neutral')}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <Button variant="outline" size="sm" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Flag / Disapproval Modal */}
      <Modal
        isOpen={isFlagModalOpen}
        onClose={() => setIsFlagModalOpen(false)}
        title={`Flag Modification for Clarification: ${itemToFlag?.entity_name || ''}`}
        description="Flagging halts peer sign-off and requires the initiating director to provide explanation or revision."
      >
        <form onSubmit={handleExecuteFlag} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Director Oversight Notice:
            </p>
            <p className="mt-1">
              Your flag reason will be permanently recorded in the immutable board audit log with your name and timestamp.
              If this is a soft-deleted item, flagging will immediately cancel the deletion and restore the record.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Flagging / Concerns *
            </label>
            <textarea
              required
              rows={3}
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g. Invoice amount discrepancy detected / Missing official receipt / Unbudgeted item"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsFlagModalOpen(false);
                setItemToFlag(null);
                setFlagReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isSubmittingAction}
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
            >
              Confirm Flag
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
