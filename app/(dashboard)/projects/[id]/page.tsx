'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import {
  ArrowLeft,
  Plus,
  RotateCcw,
  Download,
  AlertTriangle,
  Receipt,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import { round2 } from '@/lib/financial-calculations/project-finances';
import { ReceiptUploader } from '@/components/ui/ReceiptUploader';
import { ReceiptViewerModal } from '@/components/ui/ReceiptViewerModal';
import { createClient } from '@/lib/supabase/client';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';

interface ProjectPayment {
  id: string;
  transactionId: string;
  referenceNo: string;
  date: string;
  type: string;
  method: string;
  bankAccount: string;
  amount: number;
  status: 'posted' | 'reversed' | 'draft';
  externalRef: string;
  receiptUrl?: string | null;
}

export default function ProjectDetailPage() {
  const { director: currentDirector } = useCurrentDirector();

  const params = useParams();
  const router = useRouter();

  // Project state
  const [project, setProject] = useState({
    id: (params?.id as string) || '',
    displayId: (params?.id as string) || 'PROJECT',
    name: 'Project Details',
    clientName: 'Direct Client',
    clientEmail: '',
    clientPhone: '',
    contractValue: 0,
    startDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Client Payments state
  const [payments, setPayments] = useState<ProjectPayment[]>([]);

  // Project Expenses
  const [expenses, setExpenses] = useState<any[]>([]);

  // Contractor Costs
  const [contractors, setContractors] = useState<any[]>([]);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isReversalModalOpen, setIsReversalModalOpen] = useState(false);
  const [selectedTxnForReversal, setSelectedTxnForReversal] = useState<{ id: string; amount: number } | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Payment Form state
  const [payAmount, setPayAmount] = useState('');
  const [payType, setPayType] = useState('milestone');
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payAccount, setPayAccount] = useState('Company Bank Account');
  const [externalRef, setExternalRef] = useState('');
  const [payReceiptUrl, setPayReceiptUrl] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Edit Project State
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editProjName, setEditProjName] = useState('');
  const [editProjClientName, setEditProjClientName] = useState('');
  const [editProjClientEmail, setEditProjClientEmail] = useState('');
  const [editProjContractValue, setEditProjContractValue] = useState('');
  const [editProjStartDate, setEditProjStartDate] = useState('');
  const [editProjNotes, setEditProjNotes] = useState('');
  const [editProjReason, setEditProjReason] = useState('');

  // Delete Project State
  const [isDeleteProjectModalOpen, setIsDeleteProjectModalOpen] = useState(false);
  const [deleteProjReason, setDeleteProjReason] = useState('');

  // Edit Payment State
  const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
  const [editPaymentItem, setEditPaymentItem] = useState<ProjectPayment | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayType, setEditPayType] = useState('milestone');
  const [editPayMethod, setEditPayMethod] = useState('bank_transfer');
  const [editPayAccount, setEditPayAccount] = useState('Company Bank Account');
  const [editPayExternalRef, setEditPayExternalRef] = useState('');
  const [editPayReceiptUrl, setEditPayReceiptUrl] = useState('');
  const [editPayReason, setEditPayReason] = useState('');

  // Delete Payment State
  const [isDeletePaymentModalOpen, setIsDeletePaymentModalOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<ProjectPayment | null>(null);
  const [deletePayReason, setDeletePayReason] = useState('');

  // Edit Expense State
  const [isEditExpenseModalOpen, setIsEditExpenseModalOpen] = useState(false);
  const [editExpenseItem, setEditExpenseItem] = useState<any>(null);
  const [editExpVendor, setEditExpVendor] = useState('');
  const [editExpAmount, setEditExpAmount] = useState('');
  const [editExpDate, setEditExpDate] = useState('');
  const [editExpCategory, setEditExpCategory] = useState('');
  const [editExpMethod, setEditExpMethod] = useState('bank_transfer');
  const [editExpIsPaid, setEditExpIsPaid] = useState(true);
  const [editExpReason, setEditExpReason] = useState('');

  // Delete Expense State
  const [isDeleteExpenseModalOpen, setIsDeleteExpenseModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<any>(null);
  const [deleteExpReason, setDeleteExpReason] = useState('');

  // Direct Receipt Viewer Modal State
  const [selectedReceipt, setSelectedReceipt] = useState<{
    url: string;
    referenceNo: string;
    date: string;
    amount: number;
    entityName: string;
    type: string;
  } | null>(null);

  // Helper to load project payments & expenses from API
  const loadProjectTransactions = async (projId: string) => {
    try {
      const res = await fetch(`/api/transactions?projectId=${projId}`);
      const json = await res.json();

      if (json.success && json.payments) {
        setPayments(
          json.payments.map((cp: any) => ({
            id: cp.id,
            transactionId: cp.transaction_id,
            referenceNo: cp.transactions?.reference_no || 'TXN',
            date: cp.transactions?.transaction_date || cp.created_at?.split('T')[0] || '',
            type: cp.payment_type,
            method: cp.payment_method,
            bankAccount: cp.financial_accounts?.name || 'Company Bank Account',
            amount: Number(cp.transactions?.amount || 0),
            status: cp.transactions?.status || 'posted',
            externalRef: cp.external_reference || '',
            receiptUrl: cp.receipt_url || null,
          }))
        );
      }

      if (json.success && json.expenses) {
        setExpenses(
          json.expenses.map((e: any) => ({
            id: e.id,
            referenceNo: e.transactions?.reference_no || 'EXP',
            date: e.transactions?.transaction_date || e.created_at?.split('T')[0] || '',
            category: e.expense_categories?.name || 'Operating Cost',
            vendor: e.vendor,
            amount: Number(e.transactions?.amount || 0),
            isPaid: e.is_paid,
            paymentMethod: e.payment_method,
            receiptUrl: e.receipt_url || null,
          }))
        );
      }
    } catch (err) {
      console.warn('Notice loading project transactions from API:', err);
    }
  };

  // Fetch real project details and payments from API / Supabase
  useEffect(() => {
    const fetchProjectDetails = async () => {
      try {
        const projectId = params?.id as string;
        if (!projectId) return;

        let proj: any = null;
        try {
          const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);
          const json = await res.json();
          if (json.data) proj = json.data;
        } catch {
          // fallback
        }

        if (!proj) {
          const supabase = createClient();
          const { data } = await supabase
            .from('projects')
            .select('*')
            .or(`id.eq.${projectId},display_id.eq.${projectId}`)
            .maybeSingle();
          if (data) proj = data;
        }

        if (proj) {
          setProject({
            id: proj.id,
            displayId: proj.display_id,
            name: proj.name,
            clientName: proj.client_name,
            clientEmail: proj.client_email || '',
            clientPhone: proj.client_phone || '',
            contractValue: Number(proj.contract_value || 0),
            startDate: proj.start_date,
            notes: proj.notes || '',
          });

          // Fetch associated transactions and client payments
          await loadProjectTransactions(proj.id);
        }
      } catch (err) {
        console.warn('Notice loading project details:', err);
      }
    };

    fetchProjectDetails();
  }, [params?.id]);

  // Calculations
  const validPaymentsTotal = payments.reduce((acc, p) => {
    if (p.status === 'posted') return acc + p.amount;
    return acc;
  }, 0);

  const outstandingReceivable = Math.max(0, round2(project.contractValue - validPaymentsTotal));
  const clientCredit = Math.max(0, round2(validPaymentsTotal - project.contractValue));
  const paymentStatus = project.contractValue > 0 && validPaymentsTotal >= project.contractValue ? 'completed' : 'pending';

  const totalExpensesIncurred = expenses.reduce((acc, e) => acc + e.amount, 0);
  const totalContractorIncurred = contractors.reduce((acc, c) => acc + (c.invoiced || 0), 0);
  const totalProjectCosts = totalExpensesIncurred + totalContractorIncurred;

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsSubmittingPayment(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          projectId: project.id,
          amount: amt,
          currency: 'LKR',
          paymentDate: new Date().toISOString().split('T')[0],
          paymentType: payType,
          paymentMethod: payMethod,
          bankAccount: payAccount.trim() || 'Company Bank Account',
          externalReference: externalRef || 'REF-SLIP',
          receiptUrl: payReceiptUrl || null,
          notes: payNotes || null,
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to record payment in database.');
      }

      await loadProjectTransactions(project.id);

      setIsPaymentModalOpen(false);
      setPayAmount('');
      setExternalRef('');
      setPayNotes('');
      setPayReceiptUrl('');
    } catch (err: any) {
      console.error('Error saving installment payment to DB:', err);
      alert(`Payment Save Failed: ${err.message}`);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Edit Project Handler
  const handleOpenEditProject = () => {
    setEditProjName(project.name);
    setEditProjClientName(project.clientName);
    setEditProjClientEmail(project.clientEmail || '');
    setEditProjContractValue(String(project.contractValue));
    setEditProjStartDate(project.startDate);
    setEditProjNotes(project.notes || '');
    setEditProjReason('');
    setIsEditProjectModalOpen(true);
  };

  const handleExecuteUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(editProjContractValue);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid positive contract value');
      return;
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          name: editProjName,
          clientName: editProjClientName,
          clientEmail: editProjClientEmail || null,
          contractValue: val,
          startDate: editProjStartDate,
          notes: editProjNotes || null,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editProjReason.trim() || 'Contract particulars updated in project ledger',
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update project');

      setProject((prev) => ({
        ...prev,
        name: editProjName,
        clientName: editProjClientName,
        clientEmail: editProjClientEmail,
        contractValue: val,
        startDate: editProjStartDate,
        notes: editProjNotes,
      }));

      setIsEditProjectModalOpen(false);
      alert('Project updated successfully! Ledger recalculations updated and notice sent to Approvals queue.');
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    }
  };

  // Delete Project Handler
  const handleExecuteDeleteProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/projects?id=${project.id}&initiatorName=${encodeURIComponent(currentDirector.name)}&reason=${encodeURIComponent(deleteProjReason || 'Project deleted')}`, {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete project');

      alert('Project deleted successfully. Returning to Projects register.');
      router.push('/projects');
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  // Edit Payment Handlers
  const handleOpenEditPayment = (p: ProjectPayment) => {
    setEditPaymentItem(p);
    setEditPayAmount(String(p.amount));
    setEditPayDate(p.date);
    setEditPayType(p.type || 'milestone');
    setEditPayMethod(p.method || 'bank_transfer');
    setEditPayAccount(p.bankAccount || 'Company Bank Account');
    setEditPayExternalRef(p.externalRef || '');
    setEditPayReceiptUrl(p.receiptUrl || '');
    setEditPayReason('');
    setIsEditPaymentModalOpen(true);
  };

  const handleExecuteUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPaymentItem) return;
    const amt = parseFloat(editPayAmount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          id: editPaymentItem.id,
          amount: amt,
          paymentDate: editPayDate,
          paymentType: editPayType,
          paymentMethod: editPayMethod,
          bankAccount: editPayAccount,
          externalReference: editPayExternalRef,
          receiptUrl: editPayReceiptUrl || null,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editPayReason.trim() || 'Payment adjusted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update payment');

      await loadProjectTransactions(project.id);
      setIsEditPaymentModalOpen(false);
      alert('Payment updated! Project receivables and bank balances recalculated instantly.');
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    }
  };

  // Delete Payment Handler
  const handleExecuteDeletePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToDelete) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'client_payment',
          id: paymentToDelete.id,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          reason: deletePayReason.trim() || 'Payment deleted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete payment');

      await loadProjectTransactions(project.id);
      setIsDeletePaymentModalOpen(false);
      setPaymentToDelete(null);
      setDeletePayReason('');
      alert('Payment deleted! Bank reserve reversed and project totals updated.');
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  // Edit Expense Handlers
  const handleOpenEditExpense = (exp: any) => {
    setEditExpenseItem(exp);
    setEditExpVendor(exp.vendor);
    setEditExpAmount(String(exp.amount));
    setEditExpDate(exp.date);
    setEditExpCategory(exp.category);
    setEditExpMethod(exp.paymentMethod || 'bank_transfer');
    setEditExpIsPaid(Boolean(exp.isPaid));
    setEditExpReason('');
    setIsEditExpenseModalOpen(true);
  };

  const handleExecuteUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editExpenseItem) return;
    const amt = parseFloat(editExpAmount);
    if (isNaN(amt) || amt <= 0) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'expense',
          id: editExpenseItem.id,
          vendor: editExpVendor.trim(),
          category: editExpCategory,
          amount: amt,
          expenseDate: editExpDate,
          paymentMethod: editExpMethod,
          isPaid: editExpIsPaid,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editExpReason.trim() || 'Project expense adjusted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to update expense');

      await loadProjectTransactions(project.id);
      setIsEditExpenseModalOpen(false);
      alert('Project expense updated! Bank balances adjusted immediately.');
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    }
  };

  // Delete Expense Handler
  const handleExecuteDeleteExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseToDelete) return;

    try {
      const res = await fetch('/api/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'expense',
          id: expenseToDelete.id,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          reason: deleteExpReason.trim() || 'Project expense deleted by director',
        }),
      });

      const resData = await res.json();
      if (!res.ok) throw new Error(resData.error || 'Failed to delete expense');

      await loadProjectTransactions(project.id);
      setIsDeleteExpenseModalOpen(false);
      setExpenseToDelete(null);
      setDeleteExpReason('');
      alert('Project expense deleted successfully!');
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    }
  };

  const handleExportPDF = () => {
    generateFinancialPDF({
      title: `Project Financial Statement: ${project.displayId}`,
      subtitle: `${project.name} • Client: ${project.clientName}`,
      period: 'Financial Period 2026',
      currency: 'LKR',
      filename: `${project.displayId}_Financial_Statement`,
      columns: [
        { header: 'Date', dataKey: 'date' },
        { header: 'Reference', dataKey: 'ref' },
        { header: 'Type / Method', dataKey: 'type' },
        { header: 'Bank Account', dataKey: 'bank' },
        { header: 'Amount (LKR)', dataKey: 'amount' },
        { header: 'Status', dataKey: 'status' },
      ],
      rows: payments.map((p) => ({
        date: formatDate(p.date),
        ref: p.referenceNo,
        type: `${p.type} (${p.method})`,
        bank: p.bankAccount,
        amount: formatLKR(p.amount),
        status: p.status.toUpperCase(),
      })),
      summaryTotals: {
        'Contract Value': formatLKR(project.contractValue),
        'Payments Received': formatLKR(validPaymentsTotal),
        'Outstanding Receivables': formatLKR(outstandingReceivable),
        'Total Incurred Costs': formatLKR(totalProjectCosts),
      },
    });
  };

  return (
    <DashboardLayout
      pageTitle={`Project Financial Ledger: ${project.displayId}`}
      pageDescription="Contract agreements, client receivable schedules, and payment satisfaction statuses."
      userRole="director"
    >
      {/* Top Bar Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <button
          onClick={() => router.push('/projects')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to All Projects</span>
        </button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenEditProject} icon={<Pencil className="w-3.5 h-3.5" />}>
            Edit Project
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteProjectModalOpen(true)}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Delete Project
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} icon={<Download className="w-3.5 h-3.5" />}>
            Export Statement
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsPaymentModalOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Record Project Payment
          </Button>
        </div>
      </div>

      {/* Main Project Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                  {project.displayId}
                </span>
                <Badge variant={paymentStatus}>
                  {paymentStatus === 'completed' ? 'Payment Settled' : 'Payment Pending'}
                </Badge>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-2">{project.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Client: <strong className="text-slate-700">{project.clientName}</strong> • Invoiced in LKR
              </p>
            </div>

            {/* Invariant Financial Metric Blocks */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-400">Agreed Contract</p>
                <p className="text-sm font-bold text-slate-900 tabular-numbers mt-0.5">
                  {formatLKR(project.contractValue)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-400">Valid Received</p>
                <p className="text-sm font-bold text-emerald-700 tabular-numbers mt-0.5">
                  {formatLKR(validPaymentsTotal)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-400">Outstanding Due</p>
                <p className="text-sm font-bold text-amber-700 tabular-numbers mt-0.5">
                  {formatLKR(outstandingReceivable)}
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-400">Client Credit</p>
                <p className="text-sm font-bold text-slate-700 tabular-numbers mt-0.5">
                  {formatLKR(clientCredit)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab 1: Client Payment Ledgers & Installments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Client Payment Installments & Receipts</CardTitle>
            <span className="text-xs font-semibold text-slate-500">{payments.length} Installments</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Posting Date</th>
                <th className="px-6 py-3.5">Transaction Ref</th>
                <th className="px-6 py-3.5">Installment Type</th>
                <th className="px-6 py-3.5">Destination Bank Account</th>
                <th className="px-6 py-3.5">Slip Ref</th>
                <th className="px-6 py-3.5 text-right">Received Amount</th>
                <th className="px-6 py-3.5 text-center">Receipt Proof</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    <Receipt className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600 text-xs">No client installments recorded yet</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                      Record advances and milestone payments received for this project.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsPaymentModalOpen(true)}
                      icon={<Plus className="w-3.5 h-3.5" />}
                    >
                      Record First Payment
                    </Button>
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5">{formatDate(p.date)}</td>
                    <td className="px-6 py-3.5 font-mono text-slate-900 font-semibold">{p.referenceNo}</td>
                    <td className="px-6 py-3.5 uppercase font-medium text-slate-800 text-[11px]">{p.type}</td>
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
                              url: p.receiptUrl!,
                              referenceNo: p.referenceNo,
                              date: p.date,
                              amount: p.amount,
                              entityName: project.clientName,
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
                        <span className="text-[11px] text-slate-400 italic">No slip</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <Badge variant={p.status}>{p.status.toUpperCase()}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditPayment(p)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                          title="Edit Payment"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setPaymentToDelete(p);
                            setIsDeletePaymentModalOpen(true);
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

      {/* Tab 2: Project Expenses & Contractor Liabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Operating Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Project Operating Expenses</CardTitle>
            <p className="text-xs text-slate-500">Incurred hosting, software, and tools for this project.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold text-[10px] uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Vendor / Category</th>
                  <th className="px-4 py-2.5 text-right">Amount (LKR)</th>
                  <th className="px-4 py-2.5 text-center">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No operating expenses allocated to this project yet.
                    </td>
                  </tr>
                ) : (
                  expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5">{formatDate(e.date)}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">{e.vendor}</p>
                        <p className="text-[11px] text-slate-400">{e.category}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-numbers">
                        {formatLKR(e.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant={e.isPaid ? 'completed' : 'pending'}>
                          {e.isPaid ? 'Paid' : 'Unpaid'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditExpense(e)}
                            className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                            title="Edit Expense"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => {
                              setExpenseToDelete(e);
                              setIsDeleteExpenseModalOpen(true);
                            }}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-3 h-3" />
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

        {/* Contract Developer Costs */}
        <Card>
          <CardHeader>
            <CardTitle>Contract Developer Costs</CardTitle>
            <p className="text-xs text-slate-500">Agreed fees, invoiced expenses, and settlement payables.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold text-[10px] uppercase border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Developer</th>
                  <th className="px-4 py-2.5 text-right">Agreed Fee</th>
                  <th className="px-4 py-2.5 text-right">Invoiced</th>
                  <th className="px-4 py-2.5 text-right">Paid</th>
                  <th className="px-4 py-2.5 text-right">Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contractors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No external contractors assigned to this project.
                    </td>
                  </tr>
                ) : (
                  contractors.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-slate-900">{c.name}</p>
                        <p className="text-[11px] text-slate-400">{c.role}</p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-numbers">{formatLKR(c.agreedFee)}</td>
                      <td className="px-4 py-2.5 text-right tabular-numbers font-medium">{formatLKR(c.invoiced)}</td>
                      <td className="px-4 py-2.5 text-right tabular-numbers text-emerald-700">{formatLKR(c.paid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-numbers font-bold text-rose-600">
                        {formatLKR(c.payable)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Record Project Payment Modal */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title={`Record Payment for ${project.displayId}`}
        description="Records client payment and reconciles project receivable balance."
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <Input
            label="Received Amount (LKR)"
            type="number"
            step="0.01"
            required
            placeholder="e.g. 200000"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Installment Type"
              value={payType}
              onChange={(e) => setPayType(e.target.value)}
            >
              <option value="advance">Advance Payment</option>
              <option value="milestone">Milestone Payment</option>
              <option value="final">Final Settlement</option>
              <option value="other">Other Payment</option>
            </Select>

            <Select
              label="Payment Method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
            >
              <option value="bank_transfer">Bank Transfer (SLIPS/CEFT)</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="online">Online Payment</option>
            </Select>
          </div>

          <Input
            label="Receiving Account / Bank"
            placeholder="e.g. Company Bank Account / Cash"
            value={payAccount}
            onChange={(e) => setPayAccount(e.target.value)}
          />

          <Input
            label="External Bank Reference / Slip Number"
            placeholder="e.g. SLIPS-8839219"
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
          />

          <ReceiptUploader
            value={payReceiptUrl}
            onChange={(url) => setPayReceiptUrl(url)}
            onRemove={() => setPayReceiptUrl('')}
            folder="projects"
            label="Upload Bank Transaction Receipt / Slip (Supabase Storage)"
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmittingPayment}>
              Post Payment Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Project Modal */}
      <Modal
        isOpen={isEditProjectModalOpen}
        onClose={() => setIsEditProjectModalOpen(false)}
        title="Edit Project Particulars"
        description="Updates project particulars immediately. Peer notification logged in Approvals."
      >
        <form onSubmit={handleExecuteUpdateProject} className="space-y-4">
          <Input
            label="Project Name"
            required
            value={editProjName}
            onChange={(e) => setEditProjName(e.target.value)}
          />
          <Input
            label="Client Organization"
            required
            value={editProjClientName}
            onChange={(e) => setEditProjClientName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Contract Value (LKR)"
              type="number"
              step="0.01"
              required
              value={editProjContractValue}
              onChange={(e) => setEditProjContractValue(e.target.value)}
            />
            <Input
              label="Start Date"
              type="date"
              required
              value={editProjStartDate}
              onChange={(e) => setEditProjStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Adjustment
            </label>
            <Input
              value={editProjReason}
              onChange={(e) => setEditProjReason(e.target.value)}
              placeholder="e.g. Scope adjustment..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsEditProjectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Project Modal */}
      <Modal
        isOpen={isDeleteProjectModalOpen}
        onClose={() => setIsDeleteProjectModalOpen(false)}
        title="Delete Project"
        description="Permanently deletes this project and dispatches notice to Approvals queue."
      >
        <form onSubmit={handleExecuteDeleteProject} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
            <p className="font-semibold">Are you sure you want to delete {project.name} ({project.displayId})?</p>
            <p className="mt-0.5">This will delete the project record immediately.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deletion Reason</label>
            <textarea
              rows={2}
              required
              value={deleteProjReason}
              onChange={(e) => setDeleteProjReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
              placeholder="e.g. Cancelled by client..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsDeleteProjectModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Delete
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Payment Modal */}
      <Modal
        isOpen={isEditPaymentModalOpen}
        onClose={() => setIsEditPaymentModalOpen(false)}
        title="Edit Client Payment"
        description="Updates payment installment. Bank balance and project ledger recalculate immediately."
      >
        <form onSubmit={handleExecuteUpdatePayment} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (LKR)"
              type="number"
              step="0.01"
              required
              value={editPayAmount}
              onChange={(e) => setEditPayAmount(e.target.value)}
            />
            <Input
              label="Date"
              type="date"
              required
              value={editPayDate}
              onChange={(e) => setEditPayDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Payment Type"
              value={editPayType}
              onChange={(e) => setEditPayType(e.target.value)}
            >
              <option value="advance">Advance</option>
              <option value="milestone">Milestone</option>
              <option value="final">Final Settlement</option>
              <option value="other">Other</option>
            </Select>
            <Select
              label="Payment Method"
              value={editPayMethod}
              onChange={(e) => setEditPayMethod(e.target.value)}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="online">Online Payment</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
            </Select>
          </div>
          <Input
            label="Bank Reference / Slip No"
            value={editPayExternalRef}
            onChange={(e) => setEditPayExternalRef(e.target.value)}
          />
          <ReceiptUploader
            value={editPayReceiptUrl}
            onChange={(url) => setEditPayReceiptUrl(url)}
            onRemove={() => setEditPayReceiptUrl('')}
            folder="projects"
            label="Replace Bank Transaction Receipt / Slip (Optional)"
          />
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Reason</label>
            <Input
              value={editPayReason}
              onChange={(e) => setEditPayReason(e.target.value)}
              placeholder="e.g. Corrected amount from bank slip..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsEditPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Payment Modal */}
      <Modal
        isOpen={isDeletePaymentModalOpen}
        onClose={() => setIsDeletePaymentModalOpen(false)}
        title="Delete Payment Installment"
        description="Permanently deletes payment. Bank balance reversed and project receivables recalculated immediately."
      >
        <form onSubmit={handleExecuteDeletePayment} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
            <p className="font-semibold">Delete payment {paymentToDelete?.referenceNo} ({formatLKR(paymentToDelete?.amount || 0)})?</p>
            <p className="mt-0.5">The funds will be deducted from company bank reserves immediately.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deletion Reason</label>
            <textarea
              rows={2}
              required
              value={deletePayReason}
              onChange={(e) => setDeletePayReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
              placeholder="e.g. Cancelled payment..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsDeletePaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Delete
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Expense Modal */}
      <Modal
        isOpen={isEditExpenseModalOpen}
        onClose={() => setIsEditExpenseModalOpen(false)}
        title="Edit Project Expense"
        description="Updates project expense. Bank deduction adjusts automatically."
      >
        <form onSubmit={handleExecuteUpdateExpense} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Vendor / Payee"
              required
              value={editExpVendor}
              onChange={(e) => setEditExpVendor(e.target.value)}
            />
            <Input
              label="Amount (LKR)"
              type="number"
              step="0.01"
              required
              value={editExpAmount}
              onChange={(e) => setEditExpAmount(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date Incurred"
              type="date"
              required
              value={editExpDate}
              onChange={(e) => setEditExpDate(e.target.value)}
            />
            <Select
              label="Payment Method"
              value={editExpMethod}
              onChange={(e) => setEditExpMethod(e.target.value)}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="credit_card">Corporate Credit Card</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="payable">Payable (Unpaid)</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="expPaidCheck"
              checked={editExpIsPaid}
              onChange={(e) => setEditExpIsPaid(e.target.checked)}
              className="rounded border-slate-300 text-slate-900"
            />
            <label htmlFor="expPaidCheck" className="text-xs text-slate-700">Settled / Paid</label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Reason</label>
            <Input
              value={editExpReason}
              onChange={(e) => setEditExpReason(e.target.value)}
              placeholder="e.g. Corrected invoice sum..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsEditExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Changes Immediately
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Expense Modal */}
      <Modal
        isOpen={isDeleteExpenseModalOpen}
        onClose={() => setIsDeleteExpenseModalOpen(false)}
        title="Delete Project Expense"
        description="Permanently deletes expense and restores bank balance if paid."
      >
        <form onSubmit={handleExecuteDeleteExpense} className="space-y-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
            <p className="font-semibold">Delete expense {expenseToDelete?.vendor} ({formatLKR(expenseToDelete?.amount || 0)})?</p>
            <p className="mt-0.5">Funds will be refunded back into bank balance immediately.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Deletion Reason</label>
            <textarea
              rows={2}
              required
              value={deleteExpReason}
              onChange={(e) => setDeleteExpReason(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded"
              placeholder="e.g. Incorrect allocation..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsDeleteExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm Delete
            </Button>
          </div>
        </form>
      </Modal>

      {/* Direct Receipt Viewer Modal */}
      <ReceiptViewerModal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        receiptUrl={selectedReceipt?.url || null}
        title="Project Financial Receipt / Proof"
        referenceNo={selectedReceipt?.referenceNo}
        date={selectedReceipt?.date}
        amount={selectedReceipt?.amount}
        entityName={selectedReceipt?.entityName}
        type={selectedReceipt?.type}
      />
    </DashboardLayout>
  );
}
