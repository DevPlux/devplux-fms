'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ReceiptViewerModal } from '@/components/ui/ReceiptViewerModal';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import {
  Plus,
  Download,
  Search,
  Users2,
  DollarSign,
  Loader2,
  Trash2,
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getStoredDirector } from '@/lib/hooks/useCurrentDirector';

export default function ContractorsPage() {
  const [contractors, setContractors] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingContractor, setIsSubmittingContractor] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [isContractorModalOpen, setIsContractorModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedContractorForPayment, setSelectedContractorForPayment] = useState<any>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [disbursementAccount, setDisbursementAccount] = useState('Company Bank Account');
  const [paymentReference, setPaymentReference] = useState('');

  // Receipt Upload & View State
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null);
  const [viewReceipt, setViewReceipt] = useState<{
    url: string;
    referenceNo?: string;
    title?: string;
    amount?: number;
    entityName?: string;
  } | null>(null);

  // Contractor Removal / Delete Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [contractorToDelete, setContractorToDelete] = useState<any>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // New Contractor Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [projectId, setProjectId] = useState('none');
  const [customProject, setCustomProject] = useState('');
  const [agreedFee, setAgreedFee] = useState('');

  // Fetch available projects for assignment dropdown
  const fetchProjects = async () => {
    try {
      const supabase = createClient();
      const { data: projData, error } = await supabase
        .from('projects')
        .select('id, display_id, name');
      if (error) throw error;
      setAvailableProjects(projData || []);
    } catch (err) {
      console.warn('Notice loading projects for contractors:', err);
    }
  };

  // Fetch persistent contractor records from API
  const fetchContractors = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/contractors');
      const data = await res.json();
      if (data.contractors && Array.isArray(data.contractors)) {
        setContractors(data.contractors);
      }
    } catch (err) {
      console.warn('Notice loading contractors from API:', err);
      setLoadError(true);
      toast.error('Could not load contractor records. Please retry.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
    void fetchContractors();
  }, []);

  const handleAddContractor = async (e: React.FormEvent) => {
    e.preventDefault();
    const fee = parseFloat(agreedFee);
    if (isNaN(fee) || fee <= 0) {
      toast.error('Enter a valid agreed project fee.');
      return;
    }

    setIsSubmittingContractor(true);
    try {
      let projDisplay = 'General';
      if (projectId === 'custom') {
        projDisplay = customProject.trim() || 'General';
      } else if (projectId !== 'none') {
        projDisplay = projectId;
      }

      const currentDirector = getStoredDirector();
      const initiatorName = currentDirector?.name || 'Mr. Chanuka Lakshan';

      const payload = {
        action: 'create',
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        skillSet: skills.trim(),
        projectDisplayId: projDisplay,
        agreedFee: fee,
        initiatorName,
        initiatorRole: 'Director',
      };

      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to save contractor');
      }

      toast.success('Contractor registered and saved successfully.');
      setIsContractorModalOpen(false);

      // Reset Form
      setName('');
      setEmail('');
      setPhone('');
      setSkills('');
      setAgreedFee('');
      setCustomProject('');

      // Reload fresh contractors from API
      await fetchContractors();
    } catch (err: any) {
      console.error('Could not register contractor:', err);
      toast.error(err.message || 'Could not register contractor.');
    } finally {
      setIsSubmittingContractor(false);
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'contractor-receipts');
      formData.append('entityType', 'contractor_settlement');

      const res = await fetch('/api/upload/receipt', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.url) {
        throw new Error(json.error || 'Failed to upload receipt slip');
      }

      setUploadedReceiptUrl(json.url);
      toast.success('Payment receipt uploaded to storage bucket successfully.');
    } catch (err: any) {
      console.error('Error uploading receipt:', err);
      toast.error(err.message || 'Failed to upload receipt.');
    } finally {
      setIsUploadingReceipt(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(settlementAmount);
    if (isNaN(amt) || amt <= 0 || !selectedContractorForPayment) {
      toast.error('Enter a valid settlement amount.');
      return;
    }
    if (amt > selectedContractorForPayment.outstandingPayable) {
      toast.error('Settlement exceeds the outstanding payable.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const currentDirector = getStoredDirector();
      const initiatorName = currentDirector?.name || 'Mr. Chanuka Lakshan';

      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'disburse',
          contractorId: selectedContractorForPayment.id,
          amount: amt,
          disbursementAccount,
          reference: paymentReference.trim(),
          receiptUrl: uploadedReceiptUrl,
          initiatorName,
          initiatorRole: 'Director',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to disburse settlement');
      }

      toast.success(`Disbursement of ${formatLKR(amt)} logged in General Ledger as Operating Expense.`);
      setIsPaymentModalOpen(false);
      setSelectedContractorForPayment(null);
      setSettlementAmount('');
      setPaymentReference('');
      setUploadedReceiptUrl(null);

      // Reload fresh contractors from API
      await fetchContractors();
    } catch (err: any) {
      console.error('Could not update settlement:', err);
      toast.error(err.message || 'Could not update settlement.');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleExecuteDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractorToDelete || !deleteReason.trim()) {
      toast.error('Please provide a removal reason.');
      return;
    }

    setIsSubmittingDelete(true);
    try {
      const currentDirector = getStoredDirector();
      const initiatorName = currentDirector?.name || 'Mr. Chanuka Lakshan';

      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          contractorId: contractorToDelete.id,
          reason: deleteReason.trim(),
          initiatorName,
          initiatorRole: 'Director',
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Failed to request contractor removal');
      }

      toast.success('Contractor removal requested. Dispatched to Board Approvals (3/5 Quorum).');
      setIsDeleteModalOpen(false);
      setContractorToDelete(null);
      setDeleteReason('');

      await fetchContractors();
    } catch (err: any) {
      console.error('Error removing contractor:', err);
      toast.error(err.message || 'Failed to remove contractor.');
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  const filteredContractors = contractors.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.skillSet || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.projectDisplayId || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAgreed = contractors.reduce((acc, c) => acc + (Number(c.agreedFee) || 0), 0);
  const totalInvoiced = contractors.reduce((acc, c) => acc + (Number(c.invoicedTotal) || 0), 0);
  const totalPaid = contractors.reduce((acc, c) => acc + (Number(c.paidTotal) || 0), 0);
  const totalPayable = contractors.reduce((acc, c) => acc + (Number(c.outstandingPayable) || 0), 0);

  return (
    <DashboardLayout
      pageTitle="Contract Developer Management"
      pageDescription="External talent commitments, milestone invoicing, and settlement payables."
    >
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Committed Fees</p>
            <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">{formatLKR(totalAgreed)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Agreed project deliverables</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Invoiced to Date</p>
            <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">{formatLKR(totalInvoiced)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Approved developer deliverables</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Total Settled (Paid)</p>
            <p className="text-xl font-bold text-emerald-700 mt-1 tabular-numbers">{formatLKR(totalPaid)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Disbursed from bank accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Outstanding Payables</p>
            <p className="text-xl font-bold text-rose-600 mt-1 tabular-numbers">{formatLKR(totalPayable)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Obligations due for settlement</p>
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="relative flex-1 sm:max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search contractor by name or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsContractorModalOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Contractor
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <span>Failed to connect to the contractors database. You can retry safely.</span>
          <Button variant="outline" size="sm" onClick={() => void fetchContractors()} isLoading={isLoading}>
            Retry Loading
          </Button>
        </div>
      )}

      {/* Contractors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Registered Contractors & Project Allocations</CardTitle>
          <p className="text-xs text-slate-500">Contractual developers, agreed scope, and payment standing.</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Contractor Name</th>
                <th className="px-6 py-3.5">Assigned Project</th>
                <th className="px-6 py-3.5 text-right">Agreed Fee</th>
                <th className="px-6 py-3.5 text-right">Invoiced</th>
                <th className="px-6 py-3.5 text-right">Settled</th>
                <th className="px-6 py-3.5 text-right">Outstanding Payable</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center">
                    <div role="status" className="flex flex-col items-center gap-2 text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      <span className="text-xs font-medium">Loading contractor records...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredContractors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <Users2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 text-sm">No contractors registered yet</p>
                    <p className="text-xs text-slate-400 mt-0.5 mb-4">
                      Add external developers and engineers to track agreed project fees and settlement payables.
                    </p>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setIsContractorModalOpen(true)}
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Register First Contractor
                    </Button>
                  </td>
                </tr>
              ) : (
                filteredContractors.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5">
                      <p className="font-semibold text-slate-900">{c.name}</p>
                      <p className="text-[11px] text-slate-400">{c.skillSet || c.email || 'External Developer'}</p>
                      {c.receiptUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setViewReceipt({
                              url: c.receiptUrl,
                              referenceNo: c.projectDisplayId || 'General',
                              title: `Contractor Settlement Receipt: ${c.name}`,
                              amount: c.paidTotal,
                              entityName: c.name,
                            })
                          }
                          className="inline-flex items-center gap-1 text-[10px] text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded font-medium mt-1"
                        >
                          <FileText className="w-3 h-3 text-blue-600" />
                          View Receipt
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] font-semibold text-blue-800">
                      {c.projectDisplayId || 'General'}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-numbers font-medium text-slate-900">
                      {formatLKR(c.agreedFee)}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-numbers font-medium text-slate-700">
                      {formatLKR(c.invoicedTotal)}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-numbers font-medium text-emerald-700">
                      {formatLKR(c.paidTotal)}
                    </td>
                    <td className="px-6 py-3.5 text-right tabular-numbers font-bold text-rose-600">
                      {formatLKR(c.outstandingPayable)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <Badge
                        variant={
                          c.status === 'pending_deletion'
                            ? 'pending'
                            : c.outstandingPayable <= 0
                            ? 'completed'
                            : 'pending'
                        }
                      >
                        {c.status === 'pending_deletion'
                          ? 'PENDING REMOVAL'
                          : c.outstandingPayable <= 0
                          ? 'SETTLED'
                          : 'ACTIVE'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {c.status === 'pending_deletion' ? (
                        <span className="text-[11px] text-amber-700 font-medium">Awaiting 3/5 Quorum</span>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          {c.outstandingPayable > 0 ? (
                            <button
                              onClick={() => {
                                setSelectedContractorForPayment(c);
                                setSettlementAmount(String(c.outstandingPayable));
                                setUploadedReceiptUrl(null);
                                setIsPaymentModalOpen(true);
                              }}
                              className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
                            >
                              Disburse
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Settled</span>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setContractorToDelete(c);
                              setDeleteReason('');
                              setIsDeleteModalOpen(true);
                            }}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            title="Remove contractor (Board 3/5 quorum)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Register Contractor Modal */}
      <Modal
        isOpen={isContractorModalOpen}
        onClose={() => setIsContractorModalOpen(false)}
        title="Register Project Contractor"
        description="Persists contractor profile and sets up payable obligations in the ledger."
      >
        <form onSubmit={handleAddContractor} className="space-y-4">
          <Input
            label="Contractor Full Name"
            required
            placeholder="e.g. Kasun Perera"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="e.g. kasun@devplux.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Contact Phone Number"
              placeholder="e.g. +94 77 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Input
            label="Skill Set / Role Scope"
            placeholder="e.g. Senior Backend Engineer (Node.js/PostgreSQL)"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Assigned Project"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="none">General / No Project</option>
              {availableProjects.map((p) => (
                <option key={p.id} value={p.display_id}>
                  {p.display_id} — {p.name}
                </option>
              ))}
              <option value="custom">-- Type Custom Project --</option>
            </Select>

            <Input
              label="Agreed Project Fee (LKR)"
              type="number"
              step="0.01"
              required
              placeholder="e.g. 150000"
              value={agreedFee}
              onChange={(e) => setAgreedFee(e.target.value)}
            />
          </div>

          {projectId === 'custom' && (
            <Input
              label="Custom Project Code / ID"
              placeholder="e.g. DPL-2026-0001"
              value={customProject}
              onChange={(e) => setCustomProject(e.target.value)}
            />
          )}

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsContractorModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingContractor}>
              Register Contractor
            </Button>
          </div>
        </form>
      </Modal>

      {/* Settle Contractor Invoice Modal (With Receipt Upload) */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Disburse Contractor Settlement"
        description={`Settle outstanding payable for ${selectedContractorForPayment?.name}.`}
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <Input
            label="Payment Settlement Amount (LKR)"
            type="number"
            step="0.01"
            required
            value={settlementAmount}
            onChange={(e) => setSettlementAmount(e.target.value)}
            helperText="Reduces Contractor Payables (2020) and debits bank account as Operating Expense."
          />

          <Input
            label="Disbursing Account / Bank"
            placeholder="e.g. Company Bank Account / Cash"
            value={disbursementAccount}
            onChange={(e) => setDisbursementAccount(e.target.value)}
            helperText="Enter business bank account or payment source"
          />

          <Input
            label="Bank Transfer Reference"
            placeholder="e.g. CEFT-889921 / SLIP-01"
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
          />

          {/* Payment Receipt Upload to Bucket */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Payment Receipt / Transfer Slip (Saved to Storage Bucket)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                id="contractor-receipt-file"
                accept=".pdf,image/png,image/jpeg,image/jpg"
                onChange={handleReceiptUpload}
                className="hidden"
              />
              <label
                htmlFor="contractor-receipt-file"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-md hover:bg-slate-50 cursor-pointer shadow-xs text-slate-700"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                {isUploadingReceipt
                  ? 'Uploading to Bucket...'
                  : uploadedReceiptUrl
                  ? 'Change Receipt'
                  : 'Upload Receipt Slip'}
              </label>

              {uploadedReceiptUrl && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Receipt Stored in Bucket</span>
                  <button
                    type="button"
                    onClick={() =>
                      setViewReceipt({
                        url: uploadedReceiptUrl,
                        title: 'Disbursement Receipt Preview',
                        referenceNo: paymentReference || 'DISB-NEW',
                        amount: parseFloat(settlementAmount) || 0,
                        entityName: selectedContractorForPayment?.name,
                      })
                    }
                    className="text-blue-700 hover:text-blue-900 underline font-semibold ml-1 flex items-center gap-0.5"
                  >
                    <Eye className="w-3 h-3" /> View
                  </button>
                </div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Accepted formats: PDF, PNG, JPG (Stored permanently in Supabase receipts bucket).
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingPayment}>
              Confirm Disbursement
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove Contractor Modal (Requires 3/5 Board Quorum) */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title={`Remove Contractor: ${contractorToDelete?.name}`}
        description="Initiates contractor removal. Requires 3/5 Board Quorum approval to finalize."
      >
        <form onSubmit={handleExecuteDelete} className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-xs">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Board Governance Protocol (3/5 Quorum):
            </p>
            <p className="mt-1">
              Contractor removal requires 3 out of 5 director approvals (1 Initiator + 2 Independent Peers).
              The contractor will be marked as <strong>Pending Removal</strong> until board quorum is achieved.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Contractor Removal *
            </label>
            <textarea
              required
              rows={3}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. Project deliverable concluded / Scope completed / Inactive contractor contract"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setContractorToDelete(null);
                setDeleteReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={isSubmittingDelete}
              icon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Request Removal
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receipt Viewer Modal */}
      {viewReceipt && (
        <ReceiptViewerModal
          isOpen={Boolean(viewReceipt)}
          onClose={() => setViewReceipt(null)}
          receiptUrl={viewReceipt.url}
          title={viewReceipt.title || 'Contractor Payment Receipt Slip'}
          referenceNo={viewReceipt.referenceNo}
          amount={viewReceipt.amount}
          entityName={viewReceipt.entityName}
          type="Contractor Settlement Voucher"
        />
      )}
    </DashboardLayout>
  );
}
