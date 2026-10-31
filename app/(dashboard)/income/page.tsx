'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ReceiptUploader } from '@/components/ui/ReceiptUploader';
import { ReceiptViewerModal } from '@/components/ui/ReceiptViewerModal';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import {
  Plus,
  Download,
  Search,
  Eye,
  DollarSign,
  Pencil,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import { createClient } from '@/lib/supabase/client';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';

export default function IncomeLedgerPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [payments, setPayments] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State for Recording New Payment
  const [selectedProjectId, setSelectedProjectId] = useState('custom');
  const [customProjectDisplayId, setCustomProjectDisplayId] = useState('');
  const [customClientName, setCustomClientName] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState('milestone');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [bankAccount, setBankAccount] = useState('Company Bank Account');
  const [externalRef, setExternalRef] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Payment State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPaymentDate, setEditPaymentDate] = useState('');
  const [editPaymentType, setEditPaymentType] = useState('milestone');
  const [editPaymentMethod, setEditPaymentMethod] = useState('bank_transfer');
  const [editBankAccount, setEditBankAccount] = useState('Company Bank Account');
  const [editExternalRef, setEditExternalRef] = useState('');
  const [editReceiptUrl, setEditReceiptUrl] = useState('');
  const [editReason, setEditReason] = useState('');

  // Delete Payment State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Receipt Viewer Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<{
    url: string;
    referenceNo: string;
    date: string;
    amount: number;
    entityName: string;
    type: string;
  } | null>(null);

  // Fetch real client payments and projects from Supabase
  const fetchInitialData = async () => {
    try {
      const supabase = createClient();

      // 1. Fetch available active projects via API
      let projList: any[] = [];
      try {
        const pRes = await fetch('/api/projects');
        const pJson = await pRes.json();
        if (pJson.data && Array.isArray(pJson.data)) projList = pJson.data;
      } catch {
        // fallback
      }

      if (projList.length === 0) {
        const { data: projData } = await supabase
          .from('projects')
          .select('id, display_id, name, client_name')
          .order('created_at', { ascending: false });
        if (projData) projList = projData;
      }

      if (projList.length > 0) {
        setAvailableProjects(projList);
        if (selectedProjectId === 'custom') {
          setSelectedProjectId(projList[0].display_id);
        }
      }

      // 2. Fetch client payments via robust API
      const res = await fetch('/api/transactions');
      const json = await res.json();

      if (json.success && json.payments && json.payments.length > 0) {
        const mapped = json.payments.map((cp: any) => ({
          id: cp.id,
          transactionId: cp.transaction_id,
          referenceNo: cp.transactions?.reference_no || 'TXN-REF',
          date: cp.transactions?.transaction_date || cp.created_at?.split('T')[0],
          projectDisplayId: cp.projects?.display_id || 'GENERAL',
          projectName: cp.projects?.name || 'Client Project',
          clientName: cp.projects?.client_name || 'Client',
          type: cp.payment_type,
          method: cp.payment_method,
          bankAccount: cp.financial_accounts?.name ? `${cp.financial_accounts.name}` : 'Company Bank Account',
          amount: Number(cp.transactions?.amount || 0),
          status: cp.transactions?.status || 'posted',
          externalRef: cp.external_reference || 'REF-EXT',
          receiptUrl: cp.receipt_url || null,
        }));
        setPayments(mapped);
      } else {
        setPayments([]);
      }
    } catch (err) {
      console.warn('Notice loading income data:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;

    let projTargetId = selectedProjectId;
    if (selectedProjectId !== 'custom') {
      const found = availableProjects.find((p) => p.display_id === selectedProjectId);
      if (found) {
        projTargetId = found.id;
      }
    } else {
      projTargetId = availableProjects[0]?.id || 'general-income';
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          projectId: projTargetId,
          amount: amt,
          currency: 'LKR',
          paymentDate: new Date().toISOString().split('T')[0],
          paymentType,
          paymentMethod,
          bankAccount: bankAccount.trim() || 'Company Bank Account',
          externalReference: externalRef || 'REF-SLIP',
          receiptUrl: receiptUrl || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record payment in database.');
      }

      await fetchInitialData();

      setIsModalOpen(false);
      setAmount('');
      setExternalRef('');
      setReceiptUrl('');
      setCustomProjectDisplayId('');
      setCustomClientName('');
    } catch (err: any) {
      console.error('Error saving income payment to DB:', err);
      alert(`Payment Save Failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (p: any) => {
    setEditId(p.id);
    setEditAmount(String(p.amount));
    setEditPaymentDate(p.date);
    setEditPaymentType(p.type || 'milestone');
    setEditPaymentMethod(p.method || 'bank_transfer');
    setEditBankAccount(p.bankAccount || 'Company Bank Account');
    setEditExternalRef(p.externalRef || '');
    setEditReceiptUrl(p.receiptUrl || '');
    setEditReason('');
    setIsEditModalOpen(true);
  };

  const handleExecuteUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          id: editId,
          amount: amt,
          paymentDate: editPaymentDate,
          paymentType: editPaymentType,
          paymentMethod: editPaymentMethod,
          bankAccount: editBankAccount,
          externalReference: editExternalRef,
          receiptUrl: editReceiptUrl || null,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editReason.trim() || 'Payment details adjusted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update payment');
      }

      await fetchInitialData();
      setIsEditModalOpen(false);
      alert('Payment updated successfully! All bank balances and project receivables recalculated immediately.');
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteDeletePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToDelete) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          id: paymentToDelete.id,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          reason: deleteReason.trim() || 'Payment deleted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to delete payment');
      }

      await fetchInitialData();
      setIsDeleteModalOpen(false);
      setPaymentToDelete(null);
      setDeleteReason('');
      alert('Payment deleted successfully! Bank balance reversed and project totals updated.');
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectDisplayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.externalRef.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const totalCollected = filteredPayments.reduce((acc, p) => acc + p.amount, 0);

  const handleExport = () => {
    const data = filteredPayments.map((p) => ({
      'Receipt Date': p.date,
      'Reference No': p.referenceNo,
      'Project Display ID': p.projectDisplayId,
      'Project Name': p.projectName,
      'Client / Payer': p.clientName,
      'Payment Type': p.type.toUpperCase(),
      'Payment Method': p.method,
      'Bank Account': p.bankAccount,
      'External Ref': p.externalRef,
      'Amount Received (LKR)': p.amount,
      'Ledger Status': p.status.toUpperCase(),
    }));
    exportToExcel('Devplux_Client_Receipts', data, 'Client Receipts');
  };

  return (
    <DashboardLayout
      pageTitle="Client Revenue & Income Ledger"
      pageDescription="Verified client payments, milestone receipts, and canonical sub-ledger reconciliations."
      userRole="director"
    >
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Client Receipts</p>
            <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">{formatLKR(totalCollected)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Authoritative posted inflows</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Verified Installments</p>
            <p className="text-xl font-bold text-emerald-700 mt-1">{filteredPayments.length} Transactions</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Backed by verified bank slips</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Sub-Ledger Integration</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="completed">Synchronized</Badge>
              <span className="text-xs text-slate-600 font-medium">Automatic balance updates</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Peer modifications audited</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search ref, client, project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-slate-700"
          >
            <option value="all">All Payment Types</option>
            <option value="advance">Advance</option>
            <option value="milestone">Milestone</option>
            <option value="final">Final Payment</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} icon={<Download className="w-3.5 h-3.5" />}>
            Export Excel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Record Client Receipt
          </Button>
        </div>
      </div>

      {/* Income Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <CardTitle>Client Receipts Sub-Ledger ({filteredPayments.length})</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Reference No</th>
                <th className="px-6 py-3.5">Project</th>
                <th className="px-6 py-3.5">Client</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Destination Account</th>
                <th className="px-6 py-3.5">Slip Ref</th>
                <th className="px-6 py-3.5 text-right">Amount (LKR)</th>
                <th className="px-6 py-3.5 text-center">Receipt Proof</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-8 text-center text-slate-400">
                    No client receipts matching criteria found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5">{formatDate(p.date)}</td>
                    <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">{p.referenceNo}</td>
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-900">{p.projectName}</p>
                      <p className="font-mono text-[11px] text-slate-400">{p.projectDisplayId}</p>
                    </td>
                    <td className="px-6 py-3.5 text-slate-800 font-medium">{p.clientName}</td>
                    <td className="px-6 py-3.5 uppercase font-medium text-[11px]">{p.type}</td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{p.bankAccount}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{p.method?.replace('_', ' ')}</p>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] text-slate-500">{p.externalRef}</td>
                    <td className="px-6 py-3.5 text-right font-bold text-slate-900 tabular-numbers">
                      {formatLKR(p.amount)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      {p.receiptUrl ? (
                        <button
                          onClick={() =>
                            setSelectedReceipt({
                              url: p.receiptUrl,
                              referenceNo: p.referenceNo,
                              date: p.date,
                              amount: p.amount,
                              entityName: p.clientName,
                              type: `Client Payment (${p.type})`,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-semibold transition-colors"
                          title="View verified receipt in Supabase Storage"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>View Slip</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">No slip attached</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <Badge variant={p.status}>{p.status.toUpperCase()}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                          title="Edit Payment"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setPaymentToDelete(p);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                          title="Delete Payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Record Client Receipt Modal with Supabase Storage File Upload */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Client Project Receipt"
        description="Posts client payment into project sub-ledger and central general ledger atomically with bank transaction proof."
        maxWidth="lg"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          {availableProjects.length > 0 ? (
            <div className="space-y-3">
              <Select
                label="Associate with Project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.display_id}>
                    {p.display_id} — {p.name} ({p.client_name})
                  </option>
                ))}
                <option value="custom">-- Type Custom Project / Direct Client --</option>
              </Select>

              {selectedProjectId === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <Input
                    label="Project ID / Code"
                    placeholder="e.g. DPL-2026-0001"
                    value={customProjectDisplayId}
                    onChange={(e) => setCustomProjectDisplayId(e.target.value)}
                  />
                  <Input
                    label="Client / Payer Name"
                    placeholder="e.g. Acme Corporation"
                    value={customClientName}
                    onChange={(e) => setCustomClientName(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Project ID / Code"
                placeholder="e.g. DPL-2026-0001"
                value={customProjectDisplayId}
                onChange={(e) => setCustomProjectDisplayId(e.target.value)}
                helperText="Enter project display ID or reference"
              />
              <Input
                label="Client / Payer Name"
                placeholder="e.g. Acme Corporation"
                value={customClientName}
                onChange={(e) => setCustomClientName(e.target.value)}
                helperText="Name of the client making payment"
              />
            </div>
          )}

          <Input
            label="Received Amount (LKR)"
            type="number"
            step="0.01"
            required
            placeholder="e.g. 250000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Payment Type"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option value="advance">Project Advance (Initial Deposit)</option>
              <option value="milestone">Milestone Disbursement</option>
              <option value="final">Final Settlement</option>
              <option value="other">Other Inflow</option>
            </Select>

            <Select
              label="Payment Method"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="bank_transfer">Direct Bank Transfer</option>
              <option value="online">Online / Card Gateway</option>
              <option value="cheque">Cheque Deposit</option>
              <option value="cash">Cash Settlement</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Destination Financial Account"
              placeholder="e.g. Company Bank Account"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
            <Input
              label="Bank Reference / Cheque No"
              placeholder="e.g. TXN-REF-992384"
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
            />
          </div>

          <ReceiptUploader
            label="Bank Slip / Payment Receipt (Optional)"
            folder="income"
            value={receiptUrl}
            onChange={(url) => setReceiptUrl(url)}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Record & Reconcile
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Client Payment"
        description="Updates installment particulars immediately. Bank balances and project ledger recalculate instantly."
        maxWidth="lg"
      >
        <form onSubmit={handleExecuteUpdatePayment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Received Amount (LKR)"
              type="number"
              step="0.01"
              required
              value={editAmount}
              onChange={(e) => setEditAmount(e.target.value)}
            />
            <Input
              label="Payment Date"
              type="date"
              required
              value={editPaymentDate}
              onChange={(e) => setEditPaymentDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Payment Type"
              value={editPaymentType}
              onChange={(e) => setEditPaymentType(e.target.value)}
            >
              <option value="advance">Project Advance</option>
              <option value="milestone">Milestone Disbursement</option>
              <option value="final">Final Settlement</option>
              <option value="other">Other Inflow</option>
            </Select>

            <Select
              label="Payment Method"
              value={editPaymentMethod}
              onChange={(e) => setEditPaymentMethod(e.target.value)}
            >
              <option value="bank_transfer">Direct Bank Transfer</option>
              <option value="online">Online / Card Gateway</option>
              <option value="cheque">Cheque Deposit</option>
              <option value="cash">Cash Settlement</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Bank Account"
              value={editBankAccount}
              onChange={(e) => setEditBankAccount(e.target.value)}
            />
            <Input
              label="Bank Reference / Cheque No"
              value={editExternalRef}
              onChange={(e) => setEditExternalRef(e.target.value)}
            />
          </div>

          <ReceiptUploader
            label="Replace Bank Slip (Optional)"
            folder="income"
            value={editReceiptUrl}
            onChange={(url) => setEditReceiptUrl(url)}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Adjustment (Logged for Director Approvals Queue)
            </label>
            <Input
              placeholder="e.g. Corrected amount according to bank statement..."
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Save Changes Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Confirm Payment Deletion"
        description="Permanently deletes this client payment record. The bank account balance will be reversed and project receivables recalculated immediately."
      >
        <form onSubmit={handleExecuteDeletePayment} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2.5 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">
                Delete Payment {paymentToDelete?.referenceNo} ({formatLKR(paymentToDelete?.amount || 0)})?
              </p>
              <p className="mt-0.5 text-rose-700">
                This transaction will be reversed immediately from bank reserves and project {paymentToDelete?.projectName}. A notification will be dispatched to the Approvals queue.
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Deletion
            </label>
            <textarea
              rows={2}
              required
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Duplicate entry / Cancelled bank transfer..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" isLoading={isSubmitting}>
              Confirm Delete
            </Button>
          </div>
        </form>
      </Modal>

      {/* Direct Full-Size Slip Modal */}
      {selectedReceipt && (
        <ReceiptViewerModal
          isOpen={!!selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          receiptUrl={selectedReceipt.url}
          referenceNo={selectedReceipt.referenceNo}
          date={selectedReceipt.date}
          amount={selectedReceipt.amount}
          entityName={selectedReceipt.entityName}
          type={selectedReceipt.type}
        />
      )}
    </DashboardLayout>
  );
}
