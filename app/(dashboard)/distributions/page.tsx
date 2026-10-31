'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatLKR, formatPercentage } from '@/lib/formatting/formatters';
import { PieChart, CheckCircle2, DollarSign, Download, AlertCircle } from 'lucide-react';
import { computeDirectorAllocations } from '@/lib/financial-calculations/accounting-math';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';

interface AllocationRecord {
  directorId: string;
  name: string;
  role: string;
  sharePercentage: number;
  allocatedAmount: number;
  paidAmount: number;
  status: 'proposed' | 'finalized' | 'paid';
  disbursementMethod: string;
}

export default function ProfitDistributionPage() {
  const [period, setPeriod] = useState('October 2026');
  const [netAccountingProfit, setNetAccountingProfit] = useState(0);
  const [reserveRate, setReserveRate] = useState(20); // 20% retainage
  const reserveAmount = (netAccountingProfit * reserveRate) / 100;
  const distributablePool = Math.max(0, netAccountingProfit - reserveAmount);

  const [allocations, setAllocations] = useState<AllocationRecord[]>([
    {
      directorId: 'd1',
      name: 'MR. Chanuka',
      role: 'Director',
      sharePercentage: 20,
      allocatedAmount: 0,
      paidAmount: 0,
      status: 'proposed',
      disbursementMethod: 'Bank Transfer',
    },
    {
      directorId: 'd2',
      name: 'MR. Lakindu',
      role: 'Director',
      sharePercentage: 20,
      allocatedAmount: 0,
      paidAmount: 0,
      status: 'proposed',
      disbursementMethod: 'Bank Transfer',
    },
    {
      directorId: 'd3',
      name: 'MR. Janindu',
      role: 'Director',
      sharePercentage: 20,
      allocatedAmount: 0,
      paidAmount: 0,
      status: 'proposed',
      disbursementMethod: 'Bank Transfer',
    },
    {
      directorId: 'd4',
      name: 'Mr. Harsha',
      role: 'Director',
      sharePercentage: 20,
      allocatedAmount: 0,
      paidAmount: 0,
      status: 'proposed',
      disbursementMethod: 'Bank Transfer',
    },
    {
      directorId: 'd5',
      name: 'Mr. Amila',
      role: 'Director',
      sharePercentage: 20,
      allocatedAmount: 0,
      paidAmount: 0,
      status: 'proposed',
      disbursementMethod: 'Bank Transfer',
    },
  ]);

  const [isDisburseModalOpen, setIsDisburseModalOpen] = useState(false);
  const [selectedDirectorForPayout, setSelectedDirectorForPayout] = useState<any>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [disbursementAccount, setDisbursementAccount] = useState('Company Bank Account');

  // Load real accounting profit dynamically from authoritative ledger
  useEffect(() => {
    const fetchLiveProfit = async () => {
      try {
        let totalRev = 0;
        let totalExp = 0;

        // 1. Fetch Projects for valid revenue
        try {
          const pRes = await fetch('/api/projects');
          const pJson = await pRes.json();
          if (pJson.data && Array.isArray(pJson.data)) {
            totalRev = pJson.data.reduce((acc: number, p: any) => acc + Number(p.valid_payments_total || 0), 0);
          }
        } catch {
          // ignore
        }

        // 2. Fetch Operating Expenses
        try {
          const tRes = await fetch('/api/transactions');
          const tJson = await tRes.json();
          if (tJson.success && Array.isArray(tJson.expenses)) {
            totalExp = tJson.expenses.reduce((acc: number, e: any) => acc + Number(e.transactions?.amount || 0), 0);
          }
        } catch {
          // ignore
        }

        const calculatedProfit = Math.max(0, totalRev - totalExp);
        setNetAccountingProfit(calculatedProfit);

        // 3. Compute pool & allocations dynamically
        const reserve = (calculatedProfit * reserveRate) / 100;
        const pool = Math.max(0, calculatedProfit - reserve);

        const updated = computeDirectorAllocations(pool, [
          { directorId: 'd1', sharePercentage: 20 },
          { directorId: 'd2', sharePercentage: 20 },
          { directorId: 'd3', sharePercentage: 20 },
          { directorId: 'd4', sharePercentage: 20 },
          { directorId: 'd5', sharePercentage: 20 },
        ]);

        setAllocations((prev) =>
          prev.map((a) => {
            const found = updated.find((u) => u.directorId === a.directorId);
            return {
              ...a,
              allocatedAmount: found?.allocatedAmount || 0,
            };
          })
        );
      } catch (err) {
        console.warn('Notice loading live profit for distributions:', err);
      }
    };

    fetchLiveProfit();
  }, [reserveRate]);

  const handleRecalculatePool = (newProfit: number, newRate: number) => {
    setNetAccountingProfit(newProfit);
    setReserveRate(newRate);

    const reserve = (newProfit * newRate) / 100;
    const pool = Math.max(0, newProfit - reserve);

    const updated = computeDirectorAllocations(pool, [
      { directorId: 'd1', sharePercentage: 20 },
      { directorId: 'd2', sharePercentage: 20 },
      { directorId: 'd3', sharePercentage: 20 },
      { directorId: 'd4', sharePercentage: 20 },
      { directorId: 'd5', sharePercentage: 20 },
    ]);

    setAllocations(
      allocations.map((a) => {
        const found = updated.find((u) => u.directorId === a.directorId);
        return {
          ...a,
          allocatedAmount: found?.allocatedAmount || 0,
        };
      })
    );
  };

  const handleDisburse = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0 || !selectedDirectorForPayout) return;

    setAllocations(
      allocations.map((a) => {
        if (a.directorId === selectedDirectorForPayout.directorId) {
          const newPaid = a.paidAmount + amt;
          return {
            ...a,
            paidAmount: newPaid,
            status: newPaid >= a.allocatedAmount ? ('paid' as const) : ('finalized' as const),
            disbursementMethod: `Bank Transfer (${disbursementAccount})`,
          };
        }
        return a;
      })
    );

    setIsDisburseModalOpen(false);
    setSelectedDirectorForPayout(null);
    setPayoutAmount('');
  };

  const totalAllocated = allocations.reduce((acc, a) => acc + a.allocatedAmount, 0);
  const totalPaid = allocations.reduce((acc, a) => acc + a.paidAmount, 0);
  const totalPending = Math.max(0, totalAllocated - totalPaid);

  const handleExportExcel = () => {
    const data = allocations.map((a) => ({
      Director: a.name,
      Role: a.role,
      'Share %': `${a.sharePercentage}%`,
      'Allocated (LKR)': a.allocatedAmount,
      'Paid Out (LKR)': a.paidAmount,
      'Pending (LKR)': a.allocatedAmount - a.paidAmount,
      Status: a.status.toUpperCase(),
      'Disbursement Channel': a.disbursementMethod,
    }));
    exportToExcel(`Devplux_Profit_Distribution_${period.replace(' ', '_')}`, data, 'Distributions');
  };

  const handleExportPDF = () => {
    generateFinancialPDF({
      title: 'Board of Directors Profit Allocation Statement',
      subtitle: `Governing Shareholder Resolution for ${period}`,
      period,
      currency: 'LKR',
      filename: `Devplux_Director_Distribution_${period.replace(' ', '_')}`,
      columns: [
        { header: 'Director / Role', dataKey: 'director' },
        { header: 'Share', dataKey: 'share' },
        { header: 'Allocated Amount', dataKey: 'allocated' },
        { header: 'Disbursed', dataKey: 'paid' },
        { header: 'Status', dataKey: 'status' },
      ],
      rows: allocations.map((a) => ({
        director: `${a.name} (${a.role})`,
        share: `${a.sharePercentage}%`,
        allocated: formatLKR(a.allocatedAmount),
        paid: formatLKR(a.paidAmount),
        status: a.status.toUpperCase(),
      })),
    });
  };

  return (
    <DashboardLayout
      pageTitle="Director Profit Distributions"
      pageDescription="Audited dividend allocations based on 5 equal director shares (20% each) and retained reserve policies."
      userRole="director"
    >
      {/* Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Net Accounting Profit</p>
            <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">
              {formatLKR(netAccountingProfit)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Recognized accounting period surplus</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Retained Capital Reserve ({reserveRate}%)</p>
            <p className="text-xl font-bold text-blue-700 mt-1 tabular-numbers">
              {formatLKR(reserveAmount)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Preserved company retained earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Distributable Dividend Pool</p>
            <p className="text-xl font-bold text-emerald-700 mt-1 tabular-numbers">
              {formatLKR(distributablePool)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">80% available for director payout</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 font-semibold uppercase">Outstanding Distribution</p>
            <p className="text-xl font-bold text-amber-700 mt-1 tabular-numbers">
              {formatLKR(totalPending)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Declared dividends awaiting payout</p>
          </CardContent>
        </Card>
      </div>

      {/* Formula & Policy Configuration Strip */}
      <Card>
        <CardHeader>
          <CardTitle>Period Distribution Parameters</CardTitle>
          <p className="text-xs text-slate-500">
            Configure net period profit to automatically partition 5 equal 20% shareholder allocations.
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Recognized Net Accounting Profit (LKR)
              </label>
              <input
                type="number"
                step="0.01"
                value={netAccountingProfit || ''}
                onChange={(e) => handleRecalculatePool(parseFloat(e.target.value) || 0, reserveRate)}
                placeholder="0.00"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="w-48">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Company Retained Reserve (%):
              </label>
              <select
                value={reserveRate}
                onChange={(e) => handleRecalculatePool(netAccountingProfit, parseFloat(e.target.value))}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
              >
                <option value={10}>10% Reserve Retainage</option>
                <option value={20}>20% Reserve Retainage (Standard)</option>
                <option value={30}>30% Reserve Retainage</option>
                <option value={50}>50% High-Growth Retainage</option>
              </select>
            </div>

            <div className="flex items-center gap-2 mt-4 sm:mt-0">
              <Button variant="outline" size="sm" onClick={handleExportExcel} icon={<Download className="w-3.5 h-3.5" />}>
                Export Excel
              </Button>
              <Button variant="primary" size="sm" onClick={handleExportPDF} icon={<Download className="w-3.5 h-3.5" />}>
                Resolution PDF
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5-Director Equal Allocation Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Shareholder Governance Allocation Register</CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Governed by company incorporation charter: 5 founding directors hold 20.00% equal equity each.
            </p>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Director</th>
                <th className="px-6 py-3.5">Designated Executive Role</th>
                <th className="px-6 py-3.5 text-center">Charter Equity</th>
                <th className="px-6 py-3.5 text-right">Allocated Dividend</th>
                <th className="px-6 py-3.5 text-right">Disbursed (Paid)</th>
                <th className="px-6 py-3.5 text-right">Pending Settlement</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Disbursement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allocations.map((a) => {
                const pending = Math.max(0, a.allocatedAmount - a.paidAmount);
                return (
                  <tr key={a.directorId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-semibold text-slate-900">{a.name}</td>
                    <td className="px-6 py-3.5 text-slate-600">{a.role}</td>
                    <td className="px-6 py-3.5 text-center font-bold text-slate-900">
                      {formatPercentage(a.sharePercentage)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-slate-900 tabular-numbers">
                      {formatLKR(a.allocatedAmount)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-medium text-emerald-700 tabular-numbers">
                      {formatLKR(a.paidAmount)}
                    </td>
                    <td className="px-6 py-3.5 text-right font-bold text-amber-700 tabular-numbers">
                      {formatLKR(pending)}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <Badge variant={a.status}>{a.status.toUpperCase()}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {pending > 0 ? (
                        <button
                          onClick={() => {
                            setSelectedDirectorForPayout(a);
                            setPayoutAmount(String(pending));
                            setIsDisburseModalOpen(true);
                          }}
                          className="text-xs text-blue-700 hover:text-blue-900 font-semibold"
                        >
                          Disburse
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Settled</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Disburse Profit Modal */}
      <Modal
        isOpen={isDisburseModalOpen}
        onClose={() => setIsDisburseModalOpen(false)}
        title="Disburse Director Profit Dividend"
        description={`Record actual bank payment for ${selectedDirectorForPayout?.name}.`}
      >
        <form onSubmit={handleDisburse} className="space-y-4">
          <Input
            label="Payment Amount (LKR)"
            type="number"
            step="0.01"
            required
            value={payoutAmount}
            onChange={(e) => setPayoutAmount(e.target.value)}
          />

          <Input
            label="Disbursement Account / Bank"
            placeholder="e.g. Company Bank Account"
            value={disbursementAccount}
            onChange={(e) => setDisbursementAccount(e.target.value)}
            helperText="Enter business account used for the dividend transfer"
          />

          <Input
            label="Bank Transfer Reference / Slip Ref"
            placeholder="e.g. DIV-SLIPS-88129"
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsDisburseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Dividend Disbursement
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
