'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ReceiptViewerModal } from '@/components/ui/ReceiptViewerModal';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import {
  DollarSign,
  TrendingUp,
  AlertCircle,
  Briefcase,
  Landmark,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Calendar,
  Eye,
  Plus,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';

export default function DashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('2026-10');
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardLoadError, setDashboardLoadError] = useState(false);
  const [summary, setSummary] = useState({
    cashBalance: 0,
    validPaymentsReceived: 0,
    outstandingReceivables: 0,
    expensesIncurred: 0,
    expensesPaid: 0,
    contractorPayables: 0,
    currentNetProfit: 0,
  });

  const [projects, setProjects] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  // Dashboard Receipt Viewer State
  const [selectedReceipt, setSelectedReceipt] = useState<{
    url: string;
    referenceNo: string;
    date: string;
    amount: number;
    entityName: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    const fetchRealData = async () => {
      setIsLoadingDashboard(true);
      setDashboardLoadError(false);
      let encounteredError = false;
      try {
        // 1. Fetch all enriched projects from robust API
        let allProjects: any[] = [];
        try {
          const res = await fetch('/api/projects');
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            allProjects = json.data;
          }
        } catch (err) {
          encounteredError = true;
          console.warn('Notice fetching projects for dashboard:', err);
        }

        if (allProjects.length === 0) {
          const supabase = createClient();
          const { data } = await supabase.from('projects').select('*').limit(10);
          if (data) allProjects = data;
        }

        let totalValid = 0;
        let totalOut = 0;

        if (allProjects && allProjects.length > 0) {
          const mapped = allProjects.map((p) => {
            const contractVal = Number(p.contract_value || 0);
            const paid = Number(p.valid_payments_total || 0);
            const out = Number(p.outstanding_receivable ?? Math.max(0, contractVal - paid));
            const credit = Number(p.client_credit || 0);
            const status = p.payment_status || (contractVal > 0 && paid >= contractVal ? 'completed' : 'pending');

            totalValid += paid;
            totalOut += out;

            return {
              id: p.id,
              displayId: p.display_id,
              name: p.name,
              clientName: p.client_name,
              contractValue: contractVal,
              validPaymentsTotal: paid,
              outstandingReceivable: out,
              clientCredit: credit,
              paymentStatus: status,
            };
          });

          setProjects(mapped);
          setSummary((prev) => ({
            ...prev,
            validPaymentsReceived: totalValid,
            outstandingReceivables: totalOut,
          }));
        }

        // 2. Fetch all transactions, client payments and expenses via /api/transactions
        let txnAccounts: any[] = [];
        try {
          const txnRes = await fetch('/api/transactions');
          const txnJson = await txnRes.json();

          if (txnJson.success) {
            if (txnJson.accounts && Array.isArray(txnJson.accounts)) {
              txnAccounts = txnJson.accounts;
            }

            const totalExp = (txnJson.expenses || []).reduce(
                (acc: number, e: any) => acc + Number(e.transactions?.amount || 0),
                0
            );
            const totalExpPaid = (txnJson.expenses || [])
                .filter((e: any) => e.is_paid)
                .reduce((acc: number, e: any) => acc + Number(e.transactions?.amount || 0), 0);

            setSummary((prev) => ({
              ...prev,
              expensesIncurred: totalExp,
              expensesPaid: totalExpPaid,
              currentNetProfit: totalValid - totalExp,
            }));

            // Build recent transactions list from client payments and expenses
            const recentList: any[] = [];

            (txnJson.payments || []).forEach((cp: any) => {
              recentList.push({
                id: cp.id,
                referenceNo: cp.transactions?.reference_no || 'TXN-PMT',
                date: cp.transactions?.transaction_date || cp.created_at?.split('T')[0],
                type: 'client_payment',
                description: `Payment for ${cp.projects?.name || 'Project'} (${cp.payment_type})`,
                amount: Number(cp.transactions?.amount || 0),
                status: cp.transactions?.status || 'posted',
                receiptUrl: cp.receipt_url || null,
                entityName: cp.projects?.client_name || 'Client',
              });
            });

            (txnJson.expenses || []).forEach((exp: any) => {
              recentList.push({
                id: exp.id,
                referenceNo: exp.transactions?.reference_no || 'EXP-BILL',
                date: exp.transactions?.transaction_date || exp.created_at?.split('T')[0],
                type: 'expense',
                description: `${exp.vendor} (${exp.expense_categories?.name || 'Operating'})`,
                amount: Number(exp.transactions?.amount || 0),
                status: exp.transactions?.status || 'posted',
                receiptUrl: exp.receipt_url || null,
                entityName: exp.vendor || 'Vendor',
              });
            });

            recentList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            if (recentList.length > 0) {
              setRecentTransactions(recentList.slice(0, 8));
            }
          }
        } catch (txnErr) {
          encounteredError = true;
          console.warn('Notice loading transactions for dashboard:', txnErr);
        }

        // 3. Fetch accounts for authoritative cash balance
        if (txnAccounts.length > 0) {
          const totalCash = txnAccounts.reduce((acc: number, a: any) => acc + Number(a.current_balance || 0), 0);
          setSummary((prev) => ({ ...prev, cashBalance: totalCash }));
        } else {
          const supabase = createClient();
          const { data: accountsData } = await supabase.from('financial_accounts').select('current_balance');
          if (accountsData && accountsData.length > 0) {
            const totalCash = accountsData.reduce((acc, a) => acc + Number(a.current_balance || 0), 0);
            setSummary((prev) => ({ ...prev, cashBalance: totalCash }));
          }
        }
      } catch (err) {
        encounteredError = true;
        console.warn('Notice loading dashboard data:', err);
      } finally {
        setDashboardLoadError(encounteredError);
        setIsLoadingDashboard(false);
        if (encounteredError) toast.error('Some dashboard data could not be loaded. Please refresh to retry.');
      }
    };

    fetchRealData();
  }, []);

  const handleExportExcel = () => {
    try {
      const data = projects.map((p) => ({
        'Project Display ID': p.displayId,
        'Project Name': p.name,
        'Client Name': p.clientName,
        'Contract Value (LKR)': p.contractValue,
        'Valid Payments (LKR)': p.validPaymentsTotal,
        'Outstanding Receivable (LKR)': p.outstandingReceivable,
        'Client Credit (LKR)': p.clientCredit,
        'Payment Status': p.paymentStatus === 'completed' ? 'Payment Complete' : 'Payment Pending',
      }));
      exportToExcel(`Devplux_Executive_Summary_${selectedPeriod}`, data, 'Executive Summary');
      toast.success('Executive summary Excel export started.');
    } catch (error) {
      console.error('Excel export failed:', error);
      toast.error('Unable to export Excel report.');
    }
  };

  const handleExportPDF = () => {
    try {
      generateFinancialPDF({
        title: 'Executive Financial Summary',
        period: `Accounting Period ${selectedPeriod}`,
        currency: 'LKR',
        filename: `Devplux_Executive_Financial_Report_${selectedPeriod}`,
        columns: [
          { header: 'Project ID', dataKey: 'displayId' },
          { header: 'Project / Client', dataKey: 'name' },
          { header: 'Contract Value', dataKey: 'contractValueFormatted' },
          { header: 'Payments Received', dataKey: 'paymentsFormatted' },
          { header: 'Outstanding', dataKey: 'outstandingFormatted' },
          { header: 'Payment Status', dataKey: 'statusFormatted' },
        ],
        rows: projects.map((p) => ({
          displayId: p.displayId,
          name: `${p.name} (${p.clientName})`,
          contractValueFormatted: formatLKR(p.contractValue),
          paymentsFormatted: formatLKR(p.validPaymentsTotal),
          outstandingFormatted: formatLKR(p.outstandingReceivable),
          statusFormatted: p.paymentStatus === 'completed' ? 'Payment Complete' : 'Payment Pending',
        })),
      });
      toast.success('Executive financial PDF generation started.');
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Unable to generate PDF report.');
    }
  };

  return (
      <DashboardLayout
          pageTitle="Executive Financial Overview"
          pageDescription="Consolidated company cash positions, client receivables, operating overhead, and verified bank transaction slips."
          userRole="director"
      >
        {/* Period Filter & Export Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-semibold text-slate-700">Financial Period:</span>
            <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="text-xs font-medium px-3 py-1.5 border border-slate-300 rounded-md bg-slate-50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="2026-10">October 2026 (Current Active)</option>
              <option value="2026-09">September 2026 (Closed)</option>
              <option value="2026-08">August 2026 (Closed)</option>
              <option value="all">Full Financial Year 2026</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportExcel} icon={<Download className="w-3.5 h-3.5" />}>
              Export Excel
            </Button>
            <Button variant="primary" size="sm" onClick={handleExportPDF} icon={<Download className="w-3.5 h-3.5" />}>
              Generate PDF
            </Button>
          </div>
        </div>

        {dashboardLoadError && !isLoadingDashboard && (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Some dashboard data may be incomplete. Reload the page to retry.
            </div>
        )}

        {/* KPI Cards Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cash Balance */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Cash & Bank Balance</span>
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Landmark className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2 tabular-numbers">
                {formatLKR(summary.cashBalance)}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span>Business Account & Cash Reserves</span>
              </div>
            </CardContent>
          </Card>

          {/* Valid Client Payments */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Valid Income Received</span>
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700 mt-2 tabular-numbers">
                {formatLKR(summary.validPaymentsReceived)}
              </p>
              <div className="flex items-center gap-1 mt-2 text-xs text-emerald-700 font-medium">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>With verified deposit slips</span>
              </div>
            </CardContent>
          </Card>

          {/* Outstanding Receivables */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Accounts Receivable</span>
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                  <AlertCircle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-700 mt-2 tabular-numbers">
                {formatLKR(summary.outstandingReceivables)}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span>Client project contract balances</span>
              </div>
            </CardContent>
          </Card>

          {/* Operating Expenses */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase">Operating Expenses</span>
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2 tabular-numbers">
                {formatLKR(summary.expensesIncurred)}
              </p>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                <span>Hosting, software & overhead</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Projects Overview */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Active Client Projects & Payment Status</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Strict payment tracking conforming to agreed milestones and client receivables.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/projects')}>
              View All Projects
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Project ID</th>
                <th className="px-6 py-3">Project & Client</th>
                <th className="px-6 py-3 text-right">Contract Value</th>
                <th className="px-6 py-3 text-right">Valid Payments</th>
                <th className="px-6 py-3 text-right">Outstanding</th>
                <th className="px-6 py-3 text-center">Payment Status</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {isLoadingDashboard ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="flex flex-col items-center justify-center gap-2 text-slate-500"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /><span className="text-xs font-medium">Loading client projects...</span></div></td></tr>
              ) : projects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Briefcase className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700 text-sm">No client projects recorded yet</p>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">
                        Create your first development contract to track advances, milestones, and client payments.
                      </p>
                      <Button
                          size="sm"
                          variant="primary"
                          onClick={() => (window.location.href = '/projects')}
                          icon={<Plus className="w-3.5 h-3.5" />}
                      >
                        Create First Project
                      </Button>
                    </td>
                  </tr>
              ) : (
                  projects.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">
                          {p.displayId}
                        </td>
                        <td className="px-6 py-3.5">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-[11px] text-slate-400">{p.clientName}</p>
                        </td>
                        <td className="px-6 py-3.5 text-right font-medium text-slate-900 tabular-numbers">
                          {formatLKR(p.contractValue)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-medium text-emerald-700 tabular-numbers">
                          {formatLKR(p.validPaymentsTotal)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-medium text-amber-700 tabular-numbers">
                          {formatLKR(p.outstandingReceivable)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <Badge variant={p.paymentStatus}>
                            {p.paymentStatus === 'completed' ? 'Payment Complete' : 'Payment Pending'}
                          </Badge>
                        </td>
                      </tr>
                  ))
              )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Ledger Activity with Direct Receipt Viewing */}
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent Financial Postings & Transaction Slips</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Auditable double-entry postings with instant Supabase Storage receipt inspection.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/audit-log')}>
              View Full Audit Trail
            </Button>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Reference No</th>
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3 text-right">Amount (LKR)</th>
                <th className="px-6 py-3 text-center">Receipt Slip</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
              {isLoadingDashboard ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center"><div className="flex flex-col items-center justify-center gap-2 text-slate-500"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /><span className="text-xs font-medium">Loading recent transactions...</span></div></td></tr>
              ) : recentTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <DollarSign className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700 text-sm">No financial transactions recorded yet</p>
                      <p className="text-xs text-slate-400 mt-0.5 mb-4">
                        Client milestone payments, advances, and business operating expenses will appear here.
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => (window.location.href = '/income')}
                            icon={<Plus className="w-3.5 h-3.5" />}
                        >
                          Record Client Receipt
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => (window.location.href = '/expenses')}
                            icon={<Plus className="w-3.5 h-3.5" />}
                        >
                          Record Operating Expense
                        </Button>
                      </div>
                    </td>
                  </tr>
              ) : (
                  recentTransactions.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-3.5">{formatDate(t.date)}</td>
                        <td className="px-6 py-3.5 font-mono text-slate-900 font-medium">
                          {t.referenceNo}
                        </td>
                        <td className="px-6 py-3.5 text-slate-800 font-medium">{t.description}</td>
                        <td className="px-6 py-3.5 uppercase text-[10px] text-slate-500 font-semibold">
                          {t.type.replace('_', ' ')}
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-slate-900 tabular-numbers">
                          {formatLKR(t.amount)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          {t.receiptUrl ? (
                              <button
                                  onClick={() =>
                                      setSelectedReceipt({
                                        url: t.receiptUrl,
                                        referenceNo: t.referenceNo,
                                        date: t.date,
                                        amount: t.amount,
                                        entityName: t.entityName || 'Business Transaction',
                                        type: t.type.replace('_', ' ').toUpperCase(),
                                      })
                                  }
                                  className="inline-flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded font-semibold transition-colors"
                                  title="View verified transaction receipt"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>View Slip</span>
                              </button>
                          ) : (
                              <span className="text-[11px] text-slate-400 italic">No slip</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <Badge variant={t.status}>{t.status.toUpperCase()}</Badge>
                        </td>
                      </tr>
                  ))
              )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Direct Dashboard Receipt Viewer Modal */}
        <ReceiptViewerModal
            isOpen={!!selectedReceipt}
            onClose={() => setSelectedReceipt(null)}
            receiptUrl={selectedReceipt?.url || null}
            title="Transaction Proof & Bank Slip"
            referenceNo={selectedReceipt?.referenceNo}
            date={selectedReceipt?.date}
            amount={selectedReceipt?.amount}
            entityName={selectedReceipt?.entityName}
            type={selectedReceipt?.type}
        />
      </DashboardLayout>
  );
}
