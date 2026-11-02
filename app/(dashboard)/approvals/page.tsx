'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/lib/formatting/formatters';
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
} from 'lucide-react';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';

interface ModificationApprovalRecord {
  id: string;
  company_id: string;
  entity_type: 'project' | 'client_payment' | 'expense';
  entity_id: string;
  entity_reference: string;
  entity_name: string;
  action_type: 'create' | 'update' | 'delete';
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

export default function ApprovalsPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [approvals, setApprovals] = useState<ModificationApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
    try {
      const res = await fetch('/api/approvals');
      const json = await res.json();
      if (json.success && json.data) {
        setApprovals(json.data);
      }
    } catch (err) {
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
          ? `Expense voucher approved by ${reviewerName}`
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

      await fetchApprovals();
    } catch (err: any) {
      alert(`Approval Action: ${err.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleExecuteFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToFlag || flagReason.trim().length < 4) {
      alert('Please provide a reason with at least 4 characters for flagging.');
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

      await fetchApprovals();
      setIsFlagModalOpen(false);
      setItemToFlag(null);
      setFlagReason('');
    } catch (err: any) {
      alert(`Action error: ${err.message}`);
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
            New Expenses ({approvals.filter((a) => a.action_type === 'create').length})
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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Entity</th>
                <th className="px-6 py-3.5">Action</th>
                <th className="px-6 py-3.5">Initiator & Signers (3/5)</th>
                <th className="px-6 py-3.5">Summary of Record</th>
                <th className="px-6 py-3.5 text-center">Quorum Status</th>
                <th className="px-6 py-3.5 text-right">Director Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredApprovals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    <Info className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    <p className="font-semibold text-slate-600 text-xs">No modification notices found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Whenever any director adds, edits, or deletes an expense, payment, or project, it appears here for peer director sign-off.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredApprovals.map((item) => {
                  const isPending = item.status === 'pending';
                  const isApproved = item.status === 'approved';
                  const isRejected = item.status === 'rejected';

                  const count = item.approvals_count || (item.approvers?.length || 1);
                  const approversList = item.approvers || [item.initiator_name];

                  const currentDirectorName = (currentDirector?.name || '').trim().toLowerCase();
                  const initiatorName = (item.initiator_name || '').trim().toLowerCase();

                  // Check if logged-in user is the initiator
                  const isInitiator = Boolean(
                    currentDirectorName &&
                    initiatorName &&
                    (currentDirectorName === initiatorName ||
                     initiatorName.includes(currentDirectorName) ||
                     currentDirectorName.includes(initiatorName))
                  );

                  // Check if logged-in user has already approved
                  const alreadyApproved = approversList.some((n) => {
                    const clean = n.trim().toLowerCase();
                    return clean === currentDirectorName || currentDirectorName.includes(clean);
                  });

                  let entityIcon = <Briefcase className="w-3.5 h-3.5 text-blue-600" />;
                  if (item.entity_type === 'client_payment') {
                    entityIcon = <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />;
                  } else if (item.entity_type === 'expense') {
                    entityIcon = <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />;
                  }

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          {entityIcon}
                          <span className="capitalize">{item.entity_type.replace('_', ' ')}</span>
                        </div>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">{item.entity_reference}</p>
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        {item.action_type === 'delete' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            DELETION (SOFT-DELETED)
                          </span>
                        ) : item.action_type === 'create' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            NEW EXPENSE (POSTED)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            UPDATED
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-slate-900">{item.initiator_name}</p>
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono border border-slate-200">
                            Initiator
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {approversList.map((name, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-0.5 text-[9px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded"
                              title={`Approved by ${name}`}
                            >
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                              {name.replace('Mr. ', '')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3.5 max-w-sm">
                        <p className="font-medium text-slate-900">{item.details?.changesSummary || item.entity_name}</p>
                        {item.details?.reason && (
                          <p className="text-[11px] text-slate-500 italic mt-0.5">Reason: {item.details.reason}</p>
                        )}
                        <button
                          onClick={() => {
                            setSelectedApproval(item);
                            setIsDetailModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium mt-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View Details</span>
                        </button>
                      </td>
                      <td className="px-6 py-3.5 text-center whitespace-nowrap">
                        {isRejected ? (
                          <Badge variant="rejected">FLAGGED</Badge>
                        ) : isApproved || count >= 3 ? (
                          <Badge variant="completed">3/5 QUORUM ACHIEVED</Badge>
                        ) : count === 2 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            2/3 (Needs 1 Peer)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            1/3 (Needs 2 Peers)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {isRejected ? (
                          <div className="text-right text-[11px]">
                            <p className="font-medium text-rose-700">Flagged by: {item.flagged_by || item.reviewer_name}</p>
                            {item.review_notes && (
                              <p className="text-slate-500 italic text-[10px] mt-0.5">"{item.review_notes}"</p>
                            )}
                          </div>
                        ) : isApproved || count >= 3 ? (
                          <div className="text-right text-[11px]">
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Board Quorum Enacted (3/5)
                            </span>
                          </div>
                        ) : isInitiator ? (
                          /* Creator cannot approve their own submission */
                          <div className="text-right">
                            <span
                              className="inline-flex items-center px-2.5 py-1 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200"
                              title="As the initiating director, you cannot sign your own submission. 2 peer directors must review and approve."
                            >
                              You initiated this • Needs 2 peer approvals
                            </span>
                          </div>
                        ) : alreadyApproved ? (
                          /* Peer director who already approved */
                          <div className="text-right">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              You Approved ({count}/3) • Needs 1 more peer
                            </span>
                          </div>
                        ) : (
                          /* Eligible peer director who can approve or flag */
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcknowledge(item)}
                              isLoading={isSubmittingAction}
                              icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            >
                              {item.action_type === 'delete'
                                ? `Approve Delete (${count}/3)`
                                : item.action_type === 'create'
                                ? `Approve Expense (${count}/3)`
                                : `Approve (${count}/3)`}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => {
                                setItemToFlag(item);
                                setIsFlagModalOpen(true);
                              }}
                              icon={<AlertTriangle className="w-3.5 h-3.5" />}
                            >
                              Flag
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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

            {/* Before and After Comparison */}
            {selectedApproval.details?.before && selectedApproval.details?.after && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                  <p className="font-bold text-slate-700 mb-2">Before Modification</p>
                  <pre className="text-[10px] overflow-auto max-h-48 font-mono text-slate-600 bg-white p-2 rounded border border-slate-200">
                    {JSON.stringify(selectedApproval.details.before, null, 2)}
                  </pre>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                  <p className="font-bold text-emerald-800 mb-2">After Modification</p>
                  <pre className="text-[10px] overflow-auto max-h-48 font-mono text-emerald-900 bg-white p-2 rounded border border-emerald-200">
                    {JSON.stringify(selectedApproval.details.after, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Post Record Info */}
            {!selectedApproval.details?.before && selectedApproval.details?.after && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <p className="font-bold text-emerald-800 mb-2">Registered Record Values</p>
                <pre className="text-[10px] overflow-auto max-h-48 font-mono text-emerald-900 bg-white p-2 rounded border border-emerald-200">
                  {JSON.stringify(selectedApproval.details.after, null, 2)}
                </pre>
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
