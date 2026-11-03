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
  Pencil,
  Trash2,
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import { createClient } from '@/lib/supabase/client';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';
import { toast } from 'sonner';

export default function ExpensesPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [expenses, setExpenses] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedExpenses, setExpandedExpenses] = useState<string[]>([]);

  const toggleExpense = (id: string) => {
    setExpandedExpenses((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form state for New Expense
  const [vendor, setVendor] = useState('');
  const [category, setCategory] = useState('Cloud Hosting & Infrastructure');
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [projectSelection, setProjectSelection] = useState('none');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [bankAccount, setBankAccount] = useState('Company Bank Account');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [description, setDescription] = useState('');
  const [isPaid, setIsPaid] = useState(true);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for Edit Expense
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editCategory, setEditCategory] = useState('Cloud Hosting & Infrastructure');
  const [editAmount, setEditAmount] = useState('');
  const [editExpenseDate, setEditExpenseDate] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('bank_transfer');
  const [editBankAccount, setEditBankAccount] = useState('Company Bank Account');
  const [editInvoiceRef, setEditInvoiceRef] = useState('');
  const [editIsPaid, setEditIsPaid] = useState(true);
  const [editReceiptUrl, setEditReceiptUrl] = useState('');
  const [editReason, setEditReason] = useState('');

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);
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

  // Fetch real expenses and projects from database
  const fetchExpensesAndProjects = async (): Promise<boolean> => {
    setIsLoadingExpenses(true);
    setFetchError(null);
    try {
      const supabase = createClient();

      // 1. Fetch available active projects for dropdown
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
            .select('id, display_id, name')
            .order('created_at', { ascending: false });
        if (projData) projList = projData;
      }

      if (projList.length > 0) {
        setAvailableProjects(projList);
      }

      // 2. Fetch expenses via robust API
      const res = await fetch('/api/transactions?type=expense');
      const json = await res.json();

      if (!res.ok || json.success !== true) {
        throw new Error(json.error || 'Failed to load expense records.');
      }

      if (Array.isArray(json.expenses) && json.expenses.length > 0) {
        const mapped = json.expenses.map((exp: any) => ({
          id: exp.id,
          referenceNo: exp.transactions?.reference_no || 'EXP-REF',
          date: exp.transactions?.transaction_date || exp.created_at?.split('T')[0],
          category: exp.category || exp.category_name || exp.expense_categories?.name || 'General Operating',
          vendor: exp.vendor,
          projectDisplayId: exp.projects?.display_id || null,
          projectName: exp.projects?.name || 'Company-Wide Overhead',
          amount: Number(exp.transactions?.amount || 0),
          paymentMethod: exp.payment_method,
          bankAccount: 'Company Bank Account',
          invoiceRef: exp.invoice_reference || '',
          isPaid: exp.is_paid,
          status: exp.transactions?.status || 'posted',
          receiptUrl: exp.receipt_url || null,
        }));
        setExpenses(mapped);
      } else {
        setExpenses([]);
      }
      return true;
    } catch (err) {
      console.warn('Notice loading expense data:', err);
      const message = err instanceof Error ? err.message : 'Unable to load expenses.';
      setFetchError(message);
      toast.error('Could not load expenses', { description: message });
      return false;
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  useEffect(() => {
    fetchExpensesAndProjects();
  }, []);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid expense amount.');
      return;
    }

    const finalCategory = category === 'Other' && customCategory.trim() ? customCategory.trim() : category;

    let projTargetId: string | null = null;
    if (projectSelection !== 'none' && projectSelection !== 'custom') {
      const found = availableProjects.find((p) => p.display_id === projectSelection);
      if (found) {
        projTargetId = found.id;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'expense',
          projectId: projTargetId,
          category: finalCategory,
          vendor: vendor.trim(),
          amount: amt,
          currency: 'LKR',
          expenseDate: expenseDate || new Date().toISOString().split('T')[0],
          paymentMethod,
          bankAccount: bankAccount.trim() || 'Company Bank Account',
          invoiceReference: invoiceRef.trim() || null,
          receiptUrl: receiptUrl || null,
          description: description.trim() || `${vendor.trim()} - ${finalCategory}`,
          isPaid,
          initiatorName: currentDirector.name || 'Director',
          initiatorRole: 'Director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record expense in database.');
      }

      // Explicitly notify /api/approvals queue directly from client browser
      try {
        const expId = resData.expense?.id || `exp-${Date.now()}`;
        const refNo = resData.transaction?.reference_no || `EXP-${Date.now()}`;
        await fetch('/api/approvals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'expense',
            entityId: expId,
            entityReference: refNo,
            entityName: `${vendor.trim()} - ${finalCategory}`,
            actionType: 'create',
            initiatorName: currentDirector.name || 'Director',
            initiatorRole: 'Director',
            details: {
              changesSummary: `New operating expense voucher (${refNo}) for ${vendor.trim()} recorded by ${currentDirector.name || 'Director'}. Amount: LKR ${amt.toLocaleString()}. Category: ${finalCategory}.`,
              reason: description.trim() || `${vendor.trim()} - ${finalCategory}`,
              after: {
                amount: amt,
                vendor: vendor.trim(),
                category: finalCategory,
                is_paid: isPaid,
                transaction_id: resData.transaction?.id,
              },
            },
          }),
        });
      } catch (appErr) {
        console.warn('Notice syncing approval notice:', appErr);
      }

      const refreshed = await fetchExpensesAndProjects();
      toast.success('Expense recorded successfully', { description: refreshed ? 'Expense ledger refreshed.' : 'Expense saved, but the ledger could not be refreshed.' });

      setIsModalOpen(false);
      setVendor('');
      setAmount('');
      setInvoiceRef('');
      setDescription('');
      setReceiptUrl('');
      setCustomCategory('');
    } catch (err: any) {
      console.error('Error saving expense to DB:', err);
      toast.error('Expense save failed', { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (exp: any) => {
    setEditId(exp.id);
    setEditVendor(exp.vendor);
    setEditCategory(exp.category);
    setEditAmount(String(exp.amount));
    setEditExpenseDate(exp.date);
    setEditPaymentMethod(exp.paymentMethod || 'bank_transfer');
    setEditBankAccount(exp.bankAccount || 'Company Bank Account');
    setEditInvoiceRef(exp.invoiceRef || '');
    setEditIsPaid(Boolean(exp.isPaid));
    setEditReceiptUrl(exp.receiptUrl || '');
    setEditReason('');
    setIsEditModalOpen(true);
  };

  const handleExecuteUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(editAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid expense amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'expense',
          id: editId,
          vendor: editVendor.trim(),
          category: editCategory,
          amount: amt,
          expenseDate: editExpenseDate,
          paymentMethod: editPaymentMethod,
          bankAccount: editBankAccount,
          invoiceReference: editInvoiceRef.trim() || null,
          isPaid: editIsPaid,
          receiptUrl: editReceiptUrl || null,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editReason.trim() || 'Operating expense updated by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update expense');
      }

      const refreshed = await fetchExpensesAndProjects();
      setIsEditModalOpen(false);
      toast.success('Expense updated successfully', { description: refreshed ? 'Bank balances adjusted and peer notification logged in Approvals.' : 'Update saved, but the ledger could not be refreshed.' });
    } catch (err: any) {
      toast.error('Expense update failed', { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteDeleteExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseToDelete) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'expense',
          id: expenseToDelete.id,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          reason: deleteReason.trim() || 'Expense cancelled / deleted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to delete expense');
      }

      const refreshed = await fetchExpensesAndProjects();
      setIsDeleteModalOpen(false);
      setExpenseToDelete(null);
      setDeleteReason('');
      toast.success('Expense deleted successfully', { description: refreshed ? 'Bank deduction reversed immediately.' : 'Deletion saved, but the ledger could not be refreshed.' });
    } catch (err: any) {
      toast.error('Expense deletion failed', { description: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredExpenses = expenses.filter((e) => {
    const matchesSearch =
        e.referenceNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.vendor.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.projectDisplayId && e.projectDisplayId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || e.category === categoryFilter;
    const matchesScope =
        scopeFilter === 'all' ||
        (scopeFilter === 'project' && e.projectDisplayId) ||
        (scopeFilter === 'overhead' && !e.projectDisplayId);

    return matchesSearch && matchesCategory && matchesScope;
  });

  const totalExpenses = filteredExpenses.reduce((acc, e) => acc + e.amount, 0);

  const handleExport = () => {
    const data = filteredExpenses.map((e) => ({
      Date: e.date,
      'Reference No': e.referenceNo,
      Category: e.category,
      'Vendor / Payee': e.vendor,
      Scope: e.projectDisplayId ? `Project: ${e.projectDisplayId}` : 'Company Overhead',
      'Amount (LKR)': e.amount,
      'Payment Method': e.paymentMethod,
      'Settlement Status': e.isPaid ? 'PAID' : 'PAYABLE',
      'Invoice / Receipt Ref': e.invoiceRef,
    }));
    exportToExcel('Devplux_Operating_Expenses', data, 'Expenses');
  };

  return (
      <DashboardLayout
          pageTitle="Business Expenses & Overhead"
          pageDescription="Operational expenditures, verified vendor tax receipts, and direct bank account reconciliations."
          userRole="director"
      >
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Total Operating Expenses</p>
              <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">{formatLKR(totalExpenses)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Canonical general ledger postings</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Paid Outflow Transactions</p>
              <p className="text-xl font-bold text-rose-700 mt-1">{filteredExpenses.length} Records</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Backed by verified bills & slips</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Real-Time Reconciliation</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="completed">Synchronized</Badge>
                <span className="text-xs text-slate-600 font-medium">Automatic bank balance adjustment</span>
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
                  placeholder="Search ref, vendor, category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-md px-2 py-1.5 text-slate-700"
            >
              <option value="all">All Categories</option>
              {Array.from(
                  new Set([
                    'Cloud Hosting & Infrastructure',
                    'Software Subscriptions & Tools',
                    'Office & Utilities',
                    'Marketing & Advertising',
                    'Contractor & Professional Fees',
                    'Transport & Travel',
                    ...expenses.map((e) => e.category).filter(Boolean),
                  ])
              ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
              ))}
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
              Record Operating Expense
            </Button>
          </div>
        </div>

        {/* Expandable Expenses Register — compact summaries, no horizontal scrolling */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-rose-600" />
                <CardTitle>Operating Expenses Sub-Ledger ({filteredExpenses.length})</CardTitle>
              </div>
              <button
                  type="button"
                  onClick={() => void fetchExpensesAndProjects()}
                  disabled={isLoadingExpenses}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingExpenses ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Select any expense to view its complete details and available actions.</p>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingExpenses ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 px-4 py-12" role="status" aria-live="polite">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                  <p className="text-sm font-medium text-slate-600">Loading operating expenses...</p>
                </div>
            ) : fetchError ? (
                <div className="flex flex-col items-center gap-3 px-5 py-12 text-center" role="alert">
                  <AlertTriangle className="h-7 w-7 text-rose-500" />
                  <p className="text-sm font-semibold text-slate-800">Unable to load expenses</p>
                  <p className="max-w-md text-xs text-slate-500">{fetchError}</p>
                  <Button variant="outline" size="sm" onClick={() => void fetchExpensesAndProjects()} icon={<RefreshCw className="h-3.5 w-3.5" />}>
                    Retry
                  </Button>
                </div>
            ) : filteredExpenses.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-500">No operating expenses matching criteria found.</div>
            ) : (
                <div className="divide-y divide-slate-100">
                  {filteredExpenses.map((e) => {
                    const expanded = expandedExpenses.includes(e.id);
                    const detailsId = `expense-details-${e.id}`;
                    return (
                        <div key={e.id} className="min-w-0">
                          <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={detailsId}
                              onClick={() => toggleExpense(e.id)}
                              className={`flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 sm:px-6 ${expanded ? 'bg-blue-50/40' : ''}`}
                          >
                            <div className="min-w-0 flex-[1_1_190px]">
                              <p className="truncate text-sm font-semibold text-slate-900" title={e.vendor}>{e.vendor}</p>
                              <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={e.referenceNo}>{e.referenceNo}</p>
                            </div>
                            <div className="min-w-0 flex-[1_1_120px] text-xs text-slate-600">
                              <p className="font-medium">{formatDate(e.date)}</p>
                              <p className="mt-1 truncate text-[11px] text-slate-400" title={e.category}>{e.category}</p>
                            </div>
                            <div className="flex min-w-0 flex-[1_1_135px] flex-col items-start gap-1 sm:items-end">
                              <span className="text-sm font-bold tabular-nums text-slate-900">{formatLKR(e.amount)}</span>
                              <Badge variant={e.isPaid ? 'completed' : 'pending'}>{e.isPaid ? 'PAID' : 'PAYABLE'}</Badge>
                            </div>
                            <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700">

                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                       </span>
                          </button>
                          {expanded && (
                              <div id={detailsId} className="border-t border-blue-100 bg-slate-50/70 px-4 py-5 sm:px-6">
                                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                                  {[
                                    ['Expense Reference', e.referenceNo],
                                    ['Expense Date', formatDate(e.date)],
                                    ['Vendor / Payee', e.vendor],
                                    ['Category', e.category],
                                    ['Project Scope', e.projectDisplayId ? `${e.projectDisplayId} — ${e.projectName}` : 'Company-Wide Overhead'],
                                    ['Amount', formatLKR(e.amount)],
                                    ['Payment Method', (e.paymentMethod || 'Not specified').replace(/_/g, ' ')],
                                    ['Source Bank Account', e.bankAccount || 'Not specified'],
                                    ['Invoice / Bill Reference', e.invoiceRef || 'Not provided'],
                                    ['Settlement Status', e.isPaid ? 'Paid' : 'Payable'],
                                    ['Ledger Status', e.status || 'Not specified'],
                                    ['Receipt Proof', e.receiptUrl ? 'Attached' : 'No bill attached'],
                                  ].map(([label, value]) => (
                                      <div key={label} className="min-w-0">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                                        <p className="mt-1 break-words text-sm font-medium text-slate-800">{value}</p>
                                      </div>
                                  ))}
                                </div>
                                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                                  {e.receiptUrl && (
                                      <Button
                                          variant="outline"
                                          size="sm"
                                          icon={<Eye className="h-3.5 w-3.5" />}
                                          onClick={() => setSelectedReceipt({
                                            url: e.receiptUrl,
                                            referenceNo: e.referenceNo,
                                            date: e.date,
                                            amount: e.amount,
                                            entityName: e.vendor,
                                            type: `Operating Expense (${e.category})`,
                                          })}
                                      >
                                        View Bill
                                      </Button>
                                  )}
                                  <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => handleOpenEdit(e)}>
                                    Edit Expense
                                  </Button>
                                  <Button
                                      variant="danger"
                                      size="sm"
                                      icon={<Trash2 className="h-3.5 w-3.5" />}
                                      onClick={() => {
                                        setExpenseToDelete(e);
                                        setIsDeleteModalOpen(true);
                                      }}
                                  >
                                    Delete Expense
                                  </Button>
                                </div>
                              </div>
                          )}
                        </div>
                    );
                  })}
                </div>
            )}
          </CardContent>
        </Card>

        {/* Record Expense Modal */}
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Record Business Operating Expense"
            description="Records expense in canonical ledger. Upload the bank slip or vendor tax invoice to Supabase Storage."
            maxWidth="lg"
        >
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Vendor / Payee Name"
                  required
                  placeholder="e.g. Amazon Web Services / Telecom / Landlord"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
              />
              <Select
                  label="Expense Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
              >
                <option value="Cloud Hosting & Infrastructure">Cloud Hosting & Infrastructure</option>
                <option value="Software Subscriptions & Tools">Software Subscriptions & Tools</option>
                <option value="Office & Utilities">Office & Utilities</option>
                <option value="Marketing & Advertising">Marketing & Advertising</option>
                <option value="Hardware & Equipment">Hardware & Equipment</option>
                <option value="Contractor & Professional Fees">Contractor & Professional Fees</option>
                <option value="Transport & Travel">Transport & Travel</option>
                <option value="Other">Other (Specify Below)</option>
              </Select>
            </div>

            {category === 'Other' && (
                <Input
                    label="Specify Custom Category"
                    placeholder="e.g. Legal Fees / Audit Consultation"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Expense Amount (LKR)"
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 45000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
              />
              <Input
                  label="Date Incurred"
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                  label="Project Allocation (Optional)"
                  value={projectSelection}
                  onChange={(e) => setProjectSelection(e.target.value)}
              >
                <option value="none">-- General Company Overhead --</option>
                {availableProjects.map((p) => (
                    <option key={p.id} value={p.display_id}>
                      {p.display_id} — {p.name}
                    </option>
                ))}
              </Select>

              <Select
                  label="Payment Method"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="bank_transfer">Direct Bank Transfer</option>
                <option value="credit_card">Corporate Credit Card</option>
                <option value="cash">Cash Settlement</option>
                <option value="cheque">Cheque</option>
                <option value="payable">Accounts Payable (Unpaid Bill)</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Source Financial Account"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
              />
              <Input
                  label="Invoice / Bill Reference No"
                  placeholder="e.g. INV-AWS-2026-092"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
              />
            </div>

            <ReceiptUploader
                label="Vendor Tax Invoice / Bank Slip (Optional)"
                folder="expenses"
                value={receiptUrl}
                onChange={(url) => setReceiptUrl(url)}
            />

            <div className="flex items-center gap-2">
              <input
                  type="checkbox"
                  id="isPaidCheck"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
              />
              <label htmlFor="isPaidCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                Payment settled immediately from account (Deducts from bank balance)
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Record Expense
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Expense Modal */}
        <Modal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title="Edit Operating Expense"
            description="Updates expense record immediately. Bank account deductions adjust automatically and peer notification is logged."
            maxWidth="lg"
        >
          <form onSubmit={handleExecuteUpdateExpense} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Vendor / Payee Name"
                  required
                  value={editVendor}
                  onChange={(e) => setEditVendor(e.target.value)}
              />
              <Select
                  label="Expense Category"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
              >
                <option value="Cloud Hosting & Infrastructure">Cloud Hosting & Infrastructure</option>
                <option value="Software Subscriptions & Tools">Software Subscriptions & Tools</option>
                <option value="Office & Utilities">Office & Utilities</option>
                <option value="Marketing & Advertising">Marketing & Advertising</option>
                <option value="Hardware & Equipment">Hardware & Equipment</option>
                <option value="Contractor & Professional Fees">Contractor & Professional Fees</option>
                <option value="Transport & Travel">Transport & Travel</option>
                <option value="Other">Other</option>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Expense Amount (LKR)"
                  type="number"
                  step="0.01"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
              />
              <Input
                  label="Date Incurred"
                  type="date"
                  required
                  value={editExpenseDate}
                  onChange={(e) => setEditExpenseDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                  label="Payment Method"
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
              >
                <option value="bank_transfer">Direct Bank Transfer</option>
                <option value="credit_card">Corporate Credit Card</option>
                <option value="cash">Cash Settlement</option>
                <option value="cheque">Cheque</option>
                <option value="payable">Accounts Payable</option>
              </Select>
              <Input
                  label="Invoice / Bill Reference No"
                  value={editInvoiceRef}
                  onChange={(e) => setEditInvoiceRef(e.target.value)}
              />
            </div>

            <ReceiptUploader
                label="Replace Vendor Bill / Slip (Optional)"
                folder="expenses"
                value={editReceiptUrl}
                onChange={(url) => setEditReceiptUrl(url)}
            />

            <div className="flex items-center gap-2">
              <input
                  type="checkbox"
                  id="editIsPaidCheck"
                  checked={editIsPaid}
                  onChange={(e) => setEditIsPaid(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
              />
              <label htmlFor="editIsPaidCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                Settled / Paid (Deducts amount from bank account)
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Adjustment (Logged for Director Approvals Queue)
              </label>
              <Input
                  placeholder="e.g. Corrected vendor invoice amount..."
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
            title="Confirm Expense Deletion"
            description="Permanently deletes this expense entry. If settled, the deducted amount will be refunded back to the bank balance immediately."
        >
          <form onSubmit={handleExecuteDeleteExpense} className="space-y-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Delete Expense {expenseToDelete?.referenceNo} to {expenseToDelete?.vendor} ({formatLKR(expenseToDelete?.amount || 0)})?
                </p>
                <p className="mt-0.5 text-rose-700">
                  This transaction will be erased from general ledger postings. If marked as paid, the funds will be restored into the bank account immediately.
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
                  placeholder="e.g. Invoiced in error / Duplicate posting..."
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

