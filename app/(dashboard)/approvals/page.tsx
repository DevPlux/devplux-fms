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
  Pencil,
} from 'lucide-react';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';

interface ModificationApprovalRecord {
  id: string;
  company_id: string;
  entity_type: 'project' | 'client_payment' | 'expense';
  entity_id: string;
  entity_reference: string;
  entity_name: string;
  action_type: 'update' | 'delete';
  initiator_name: string;
  initiator_role: string;
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
  created_at: string;
}

export default function ApprovalsPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [approvals, setApprovals] = useState<ModificationApprovalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [actionFilter, setActionFilter] = useState<'all' | 'delete' | 'update'>('all');

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
          ? `Deletion approved & confirmed permanent hard-delete by ${reviewerName}`
          : `Update acknowledged & confirmed by ${reviewerName}`;

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

      if (!res.ok) {
        throw new Error('Failed to acknowledge modification');
      }

      // Optimistically update local state
      setApprovals((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? {
                ...a,
                status: 'approved',
                reviewer_name: reviewerName,
                reviewed_at: new Date().toISOString(),
                review_notes: notes,
              }
            : a
        )
      );
    } catch (err: any) {
      alert(`Action error: ${err.message}`);
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
        throw new Error('Failed to flag modification');
      }

      setApprovals((prev) =>
        prev.map((a) =>
          a.id === itemToFlag.id
            ? {
                ...a,
                status: 'rejected',
                reviewer_name: reviewerName,
                reviewed_at: new Date().toISOString(),
                review_notes: flagReason.trim(),
              }
            : a
        )
      );

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
      pageDescription="Real-time financial execution with peer director oversight, soft-deletes, and board sign-offs."
      userRole="director"
    >
      {/* Governance & Real-Time Policy Notice */}
      <Card>
        <CardContent className="p-4 bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Optimistic Execution & Dual-Stage Governance Protocol:
              </p>
              <p className="mt-0.5 text-slate-600">
                To guarantee zero operational delay, updates take effect immediately and deleted records are <strong>soft-deleted instantly</strong> so ledger calculations, bank balances, and receivables update with zero waiting. In this queue, peer directors inspect who made each modification, and permanent hard-deletions execute once the board gives approval.
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
              <p className="text-xs text-slate-500 font-semibold uppercase">Pending Reviews</p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Awaiting director review</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Pending Deletions</p>
              <Trash2 className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-bold text-rose-600 mt-1">{pendingDeletes}</p>
            <p className="text-[11px] text-rose-500 mt-0.5">Soft-deleted, pending hard-delete</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Approved & Enacted</p>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Confirmed by board directors</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 font-semibold uppercase">Flagged For Review</p>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-amber-700 mt-1">{flaggedCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Requires clarification</p>
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
            All Modifications ({approvals.length})
          </Button>
          <Button
            variant={statusFilter === 'pending' && actionFilter === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('pending');
              setActionFilter('all');
            }}
          >
            Pending ({pendingCount})
          </Button>
          <Button
            variant={actionFilter === 'delete' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActionFilter('delete');
              setStatusFilter('all');
            }}
          >
            Deletions (Soft-Deleted)
          </Button>
          <Button
            variant={actionFilter === 'update' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setActionFilter('update');
              setStatusFilter('all');
            }}
          >
            Updates
          </Button>
          <Button
            variant={statusFilter === 'approved' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => {
              setStatusFilter('approved');
              setActionFilter('all');
            }}
          >
            Acknowledged ({approvedCount})
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
          <CardTitle>Modification Audit & Director Sign-Off Register</CardTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Peer directors review all updates and soft-deletions. Approving a deletion permanently hard-deletes it from the database.
          </p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Timestamp</th>
                <th className="px-6 py-3.5">Entity</th>
                <th className="px-6 py-3.5">Action</th>
                <th className="px-6 py-3.5">Initiating Director</th>
                <th className="px-6 py-3.5">Summary of Modification</th>
                <th className="px-6 py-3.5 text-center">Status</th>
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
                      Whenever any director edits or deletes a project, payment, or expense, it will appear here for board verification.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredApprovals.map((item) => {
                  const isPending = item.status === 'pending';
                  const isApproved = item.status === 'approved';
                  const isRejected = item.status === 'rejected';

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
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                            UPDATED
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-900">{item.initiator_name}</p>
                        <p className="text-[11px] text-blue-600 font-medium">{item.initiator_role}</p>
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
                        {isPending && <Badge variant="pending">PENDING ACKNOWLEDGMENT</Badge>}
                        {isApproved && <Badge variant="completed">ACKNOWLEDGED</Badge>}
                        {isRejected && <Badge variant="rejected">FLAGGED</Badge>}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleAcknowledge(item)}
                              isLoading={isSubmittingAction}
                              icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                            >
                              {item.action_type === 'delete' ? 'Approve & Hard Delete' : 'Acknowledge'}
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
                        ) : (
                          <div className="text-right text-[11px]">
                            <p className="font-medium text-slate-800">
                              {isApproved ? 'Approved by' : 'Flagged by'}: {item.reviewer_name || 'Director'}
                            </p>
                            {item.reviewed_at && (
                              <p className="text-slate-400">{formatDateTime(item.reviewed_at)}</p>
                            )}
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
          title={`Modification Details: ${selectedApproval.entity_name} (${selectedApproval.entity_reference})`}
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Action:</span>
                <span className="font-bold uppercase text-slate-900">{selectedApproval.action_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Initiated By:</span>
                <span className="font-bold text-slate-900">
                  {selectedApproval.initiator_name} ({selectedApproval.initiator_role})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">Timestamp:</span>
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
                  <p className="font-bold text-emerald-900 mb-2">After Modification</p>
                  <pre className="text-[10px] overflow-auto max-h-48 font-mono text-emerald-800 bg-white p-2 rounded border border-emerald-200">
                    {JSON.stringify(selectedApproval.details.after, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Flag / Clarification Modal */}
      {itemToFlag && (
        <Modal
          isOpen={isFlagModalOpen}
          onClose={() => setIsFlagModalOpen(false)}
          title={`Flag Modification: ${itemToFlag.entity_reference}`}
        >
          <form onSubmit={handleExecuteFlag} className="space-y-4 text-xs">
            <p className="text-slate-600">
              Flagging halts unquestioned sign-off and demands board clarification. If this is a soft-deleted item, flagging it will restore the record.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Flagging / Reversal <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                placeholder="Explain why this modification or deletion requires board review..."
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                className="w-full text-xs p-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsFlagModalOpen(false);
                  setItemToFlag(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger" size="sm" isLoading={isSubmittingAction}>
                Confirm Flag
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </DashboardLayout>
  );
}
