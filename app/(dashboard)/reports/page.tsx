'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatLKR } from '@/lib/formatting/formatters';
import {
  FileText,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  PieChart,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import { createClient } from '@/lib/supabase/client';

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<
    'pl' | 'income' | 'expenses' | 'projects' | 'receivables' | 'contractors'
  >('pl');
  const [period, setPeriod] = useState('2026-10');

  // Profit and Loss Breakdown - Initialized Clean
  const [revenueItems, setRevenueItems] = useState([
    { name: 'Software Development Revenue (4010)', amount: 0 },
    { name: 'Software Maintenance & API Services (4020)', amount: 0 },
  ]);

  const [expenseItems, setExpenseItems] = useState([
    { name: 'Cloud Hosting & Infrastructure (5010)', amount: 0 },
    { name: 'Domains & Software Subscriptions (5020)', amount: 0 },
    { name: 'Contract Developer Costs (5030)', amount: 0 },
    { name: 'Office & Operating Overhead (5040)', amount: 0 },
    { name: 'Marketing & Transport (5050)', amount: 0 },
  ]);

  // Receivables Aging - Initialized Clean
  const [receivablesData, setReceivablesData] = useState<any[]>([]);

  useEffect(() => {
    const fetchReportData = async () => {
      try {
        const supabase = createClient();

        // 1. Fetch Projects for Receivables via robust API
        let projects: any[] = [];
        try {
          const res = await fetch('/api/projects');
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) projects = json.data;
        } catch {
          // fallback
        }

        if (projects.length === 0) {
          const { data } = await supabase.from('projects').select('*');
          if (data) projects = data;
        }

        if (projects && projects.length > 0) {
          const mappedReceivables = projects.map((p) => {
            const contractVal = Number(p.contract_value || 0);
            const received = Number(p.valid_payments_total || 0);
            const outstanding =
              p.outstanding_receivable !== undefined && p.outstanding_receivable !== null
                ? Number(p.outstanding_receivable)
                : Math.max(0, contractVal - received);

            return {
              displayId: p.display_id,
              client: p.client_name,
              contractValue: contractVal,
              received,
              outstanding,
              daysPending: 0,
            };
          });
          setReceivablesData(mappedReceivables);

          const totalProjectRev = projects.reduce((acc, p) => acc + Number(p.valid_payments_total || 0), 0);
          setRevenueItems([
            { name: 'Software Development Revenue (4010)', amount: totalProjectRev },
            { name: 'Software Maintenance & API Services (4020)', amount: 0 },
          ]);
        }

        // 2. Fetch Expenses for P&L via robust API (ensures soft-deleted items are excluded)
        let expensesList: any[] = [];
        try {
          const txnRes = await fetch('/api/transactions');
          const txnJson = await txnRes.json();
          if (txnJson.success && Array.isArray(txnJson.expenses)) {
            expensesList = txnJson.expenses;
          }
        } catch {
          // fallback
        }

        if (expensesList.length === 0) {
          const { data: dbExp } = await supabase
            .from('expenses')
            .select('*, expense_categories(name), transactions(amount, status)');
          if (dbExp) {
            expensesList = dbExp.filter((e) => e.transactions?.status === 'posted');
          }
        }

        if (expensesList && expensesList.length > 0) {
          let hosting = 0;
          let subscriptions = 0;
          let contractors = 0;
          let office = 0;
          let marketing = 0;

          expensesList.forEach((e) => {
            const amt = Number(e.transactions?.amount || 0);
            const cat = e.expense_categories?.name || '';
            if (cat.includes('Hosting')) hosting += amt;
            else if (cat.includes('Subscription') || cat.includes('Domain')) subscriptions += amt;
            else if (cat.includes('Contractor')) contractors += amt;
            else if (cat.includes('Office') || cat.includes('Utility')) office += amt;
            else marketing += amt;
          });

          setExpenseItems([
            { name: 'Cloud Hosting & Infrastructure (5010)', amount: hosting },
            { name: 'Domains & Software Subscriptions (5020)', amount: subscriptions },
            { name: 'Contract Developer Costs (5030)', amount: contractors },
            { name: 'Office & Operating Overhead (5040)', amount: office },
            { name: 'Marketing & Transport (5050)', amount: marketing },
          ]);
        }
      } catch (err) {
        console.warn('Notice loading report data:', err);
      }
    };

    fetchReportData();
  }, []);

  const totalRevenue = revenueItems.reduce((acc, r) => acc + r.amount, 0);
  const totalExpenses = expenseItems.reduce((acc, e) => acc + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const handleExportPDF = () => {
    if (selectedReport === 'pl') {
      const rows = [
        ...revenueItems.map((r) => ({ item: r.name, category: 'Revenue', amount: formatLKR(r.amount) })),
        { item: 'TOTAL OPERATING REVENUE', category: 'Summary', amount: formatLKR(totalRevenue) },
        ...expenseItems.map((e) => ({ item: e.name, category: 'Operating Expense', amount: formatLKR(e.amount) })),
        { item: 'TOTAL OPERATING EXPENSES', category: 'Summary', amount: formatLKR(totalExpenses) },
        { item: 'NET ACCOUNTING PROFIT', category: 'Final', amount: formatLKR(netProfit) },
      ];

      generateFinancialPDF({
        title: 'Monthly Profit and Loss Statement',
        period: `Accounting Period ${period}`,
        currency: 'LKR',
        filename: `Devplux_Profit_and_Loss_${period}`,
        columns: [
          { header: 'Account / Description', dataKey: 'item' },
          { header: 'Category', dataKey: 'category' },
          { header: 'Amount (LKR)', dataKey: 'amount' },
        ],
        rows,
      });
    } else {
      const rows = receivablesData.map((r) => ({
        displayId: r.displayId,
        client: r.client,
        contract: formatLKR(r.contractValue),
        received: formatLKR(r.received),
        outstanding: formatLKR(r.outstanding),
        aging: `${r.daysPending} Days`,
      }));

      generateFinancialPDF({
        title: 'Outstanding Client Receivables Aging',
        period: `As of ${period}`,
        currency: 'LKR',
        filename: `Devplux_Receivables_Aging_${period}`,
        columns: [
          { header: 'Project ID', dataKey: 'displayId' },
          { header: 'Client Organization', dataKey: 'client' },
          { header: 'Contract Value', dataKey: 'contract' },
          { header: 'Received', dataKey: 'received' },
          { header: 'Outstanding Due', dataKey: 'outstanding' },
          { header: 'Aging Bucket', dataKey: 'aging' },
        ],
        rows,
      });
    }
  };

  const handleExportExcel = () => {
    if (selectedReport === 'pl') {
      const data = [
        ...revenueItems.map((r) => ({ Account: r.name, Category: 'Revenue', 'Amount (LKR)': r.amount })),
        { Account: 'TOTAL REVENUE', Category: 'Summary', 'Amount (LKR)': totalRevenue },
        ...expenseItems.map((e) => ({ Account: e.name, Category: 'Expense', 'Amount (LKR)': e.amount })),
        { Account: 'TOTAL EXPENSES', Category: 'Summary', 'Amount (LKR)': totalExpenses },
        { Account: 'NET PROFIT', Category: 'Final', 'Amount (LKR)': netProfit },
      ];
      exportToExcel(`Devplux_Profit_and_Loss_${period}`, data, 'Profit and Loss');
    } else {
      const data = receivablesData.map((r) => ({
        'Project ID': r.displayId,
        Client: r.client,
        'Contract Value (LKR)': r.contractValue,
        'Valid Received (LKR)': r.received,
        'Outstanding Receivable (LKR)': r.outstanding,
        'Aging (Days)': r.daysPending,
      }));
      exportToExcel(`Devplux_Receivables_Aging_${period}`, data, 'Receivables');
    }
  };

  return (
    <DashboardLayout
      pageTitle="Corporate Financial Reports"
      pageDescription="Audited financial statements, profit & loss, client receivables aging, and exportable ledgers."
      userRole="director"
    >
      {/* Report Selection Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-lg border border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedReport('pl')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              selectedReport === 'pl'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Profit & Loss (P&L)
          </button>
          <button
            onClick={() => setSelectedReport('receivables')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              selectedReport === 'receivables'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Receivables Aging
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-xs font-medium px-3 py-1.5 border border-slate-300 rounded-md bg-slate-50 text-slate-800"
          >
            <option value="2026-10">October 2026</option>
            <option value="2026-09">September 2026</option>
            <option value="2026-FY">Full FY 2026</option>
          </select>
          <Button variant="outline" size="sm" onClick={handleExportExcel} icon={<Download className="w-3.5 h-3.5" />}>
            Export Excel
          </Button>
          <Button variant="primary" size="sm" onClick={handleExportPDF} icon={<Download className="w-3.5 h-3.5" />}>
            Download PDF
          </Button>
        </div>
      </div>

      {/* Report View: Profit & Loss Statement */}
      {selectedReport === 'pl' && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Income Statement / Profit & Loss Statement</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                Accrual accounting basis. Shows recognized revenue vs operating expenses for Devplux (Pvt) Ltd.
              </p>
            </div>
          </CardHeader>
          <div className="p-6 space-y-6">
            {/* Revenue Section */}
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 border-b border-slate-200 pb-1">
                1. Operating Revenue Recognized
              </h4>
              <div className="space-y-1.5">
                {revenueItems.map((r, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 text-slate-700">
                    <span>{r.name}</span>
                    <span className="font-semibold text-slate-900 tabular-numbers">
                      {formatLKR(r.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs py-2 border-t border-slate-200 font-bold text-slate-900">
                  <span>TOTAL OPERATING REVENUE</span>
                  <span className="text-emerald-700 tabular-numbers">{formatLKR(totalRevenue)}</span>
                </div>
              </div>
            </div>

            {/* Operating Expenses Section */}
            <div>
              <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 border-b border-slate-200 pb-1">
                2. Operating Expenses Incurred
              </h4>
              <div className="space-y-1.5">
                {expenseItems.map((e, i) => (
                  <div key={i} className="flex justify-between text-xs py-1 text-slate-700">
                    <span>{e.name}</span>
                    <span className="font-semibold text-slate-900 tabular-numbers">
                      {formatLKR(e.amount)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-xs py-2 border-t border-slate-200 font-bold text-slate-900">
                  <span>TOTAL OPERATING EXPENSES</span>
                  <span className="text-slate-900 tabular-numbers">{formatLKR(totalExpenses)}</span>
                </div>
              </div>
            </div>

            {/* Net Accounting Profit Banner */}
            <div className="p-4 bg-slate-900 rounded-lg text-white flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-semibold text-slate-400">Net Accounting Profit</p>
                <p className="text-xs text-slate-400 mt-0.5">Available for reserves and director distribution</p>
              </div>
              <p className="text-2xl font-black text-white tabular-numbers">
                {formatLKR(netProfit)}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Report View: Receivables Aging */}
      {selectedReport === 'receivables' && (
        <Card>
          <CardHeader>
            <CardTitle>Accounts Receivable Aging Schedule</CardTitle>
            <p className="text-xs text-slate-500">Unpaid client balances organized by contract value and collection period.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Project ID</th>
                  <th className="px-6 py-3.5">Client Organization</th>
                  <th className="px-6 py-3.5 text-right">Agreed Contract</th>
                  <th className="px-6 py-3.5 text-right">Valid Received</th>
                  <th className="px-6 py-3.5 text-right">Outstanding Receivable</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivablesData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                      No active client receivables found.
                    </td>
                  </tr>
                ) : (
                  receivablesData.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">{r.displayId}</td>
                      <td className="px-6 py-3.5 font-medium text-slate-900">{r.client}</td>
                      <td className="px-6 py-3.5 text-right tabular-numbers font-medium text-slate-900">
                        {formatLKR(r.contractValue)}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-numbers font-medium text-emerald-700">
                        {formatLKR(r.received)}
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-numbers font-bold text-amber-700">
                        {formatLKR(r.outstanding)}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <Badge variant={r.outstanding === 0 ? 'completed' : 'pending'}>
                          {r.outstanding === 0 ? 'Fully Collected' : 'Receivable Due'}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </DashboardLayout>
  );
}
