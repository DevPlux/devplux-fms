'use client';

import React, { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatLKR } from '@/lib/formatting/formatters';
import { Settings, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [activePeriod, setActivePeriod] = useState({
    id: 'd0000000-0000-0000-0000-000000000001',
    name: 'October 2026',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    status: 'open' as 'open' | 'closed',
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
  });

  const [mdThreshold, setMdThreshold] = useState('500000');
  const [fdThreshold] = useState('200000');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closingNotes, setClosingNotes] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const handleUpdateThresholds = () => {
    const threshold = Number(mdThreshold);
    if (!mdThreshold.trim() || !Number.isFinite(threshold) || threshold < 0) {
      toast.error('Invalid approval limit', {
        description: 'Enter a valid non-negative amount in LKR.',
      });
      return;
    }

    toast.success('Threshold updated for this session', {
      description: 'The value is not yet saved to the database.',
    });
  };

  const handleExecuteClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (isClosing) return;
    if (!closingNotes.trim()) {
      toast.error('Audit notes required', {
        description: 'Enter your monthly close audit notes.',
      });
      return;
    }
    if (activePeriod.status === 'closed') {
      toast.error('Period already closed');
      return;
    }

    setIsClosing(true);
    // Existing simulated close behavior is preserved; no server request occurs.
    window.setTimeout(() => {
      setActivePeriod((prev) => ({ ...prev, status: 'closed' }));
      setIsClosing(false);
      setIsCloseModalOpen(false);
      toast.success('Period marked closed for this session', {
        description: 'No database seal or ledger lock was performed.',
      });
    }, 600);
  };

  return (
      <DashboardLayout
          pageTitle="Governance & Accounting Settings"
          pageDescription="Separation of duties thresholds, company registration info, and monthly period close controls."
          userRole="director"
      >
        <div className="space-y-6">
          {/* Company Registration Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-600" />
                <CardTitle>Corporate Identity & Accounting Standards</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Company Legal Name</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">Devplux (Pvt) Ltd</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Registration Number</p>
                  <p className="text-sm font-mono font-semibold text-slate-900 mt-1">PV-00289144</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Authoritative Currency</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">LKR (Sri Lankan Rupee)</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Separation of Duties & Self-Approval Thresholds */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <CardTitle>Separation of Duties Policy & Thresholds</CardTitle>
              </div>
              <p className="text-xs text-slate-500">
                Guarantees independent director authorization for significant financial disbursements.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                <Input
                    label="Director Self-Approval Limit (LKR)"
                    type="number"
                    value={mdThreshold}
                    onChange={(e) => setMdThreshold(e.target.value)}
                    helperText="Disbursements exceeding this threshold require peer director sign-off."
                />
              </div>
              <div>
                <Button variant="primary" size="sm" onClick={handleUpdateThresholds}>
                  Update Policy Thresholds
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Accounting Period Close */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                <CardTitle>Monthly Accounting Period Close Workflow</CardTitle>
              </div>
              <p className="text-xs text-slate-500">
                Period closing seals transactions. Backdated modifications are strictly rejected by PostgreSQL triggers.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">{activePeriod.name}</span>
                    <Badge variant={activePeriod.status === 'open' ? 'open' : 'closed'}>
                      {activePeriod.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Dates: {activePeriod.startDate} to {activePeriod.endDate} • Net Profit: {formatLKR(activePeriod.netProfit)}
                  </p>
                </div>

                {activePeriod.status === 'open' ? (
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setIsCloseModalOpen(true)}
                        icon={<Lock className="w-3.5 h-3.5" />}
                    >
                      Seal & Close Period
                    </Button>
                ) : (
                    <div className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold px-3 py-1.5 bg-purple-50 rounded-md border border-purple-200">
                      <Lock className="w-4 h-4 text-purple-600" />
                      <span>Period Sealed & Locked</span>
                    </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Period Close Modal */}
        <Modal
            isOpen={isCloseModalOpen}
            onClose={() => setIsCloseModalOpen(false)}
            title={`Seal Accounting Period: ${activePeriod.name}`}
            description="Irreversible operation without authorized adjustment workflow. All general ledger postings will be finalized."
        >
          <form onSubmit={handleExecuteClose} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Financial Integrity Seal:</p>
                <p className="mt-0.5">
                  Closing this period will lock Revenue ({formatLKR(activePeriod.totalRevenue)}) and Expenses ({formatLKR(activePeriod.totalExpenses)}).
                  Any subsequent modifications will require authorized journal adjustment.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Close Audit Notes (Mandatory)
              </label>
              <textarea
                  rows={3}
                  required
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="e.g. Verified bank reconciliations, client receipts posted, all contractor payables checked..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setIsCloseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" isLoading={isClosing}>
                Confirm & Lock Accounting Period
              </Button>
            </div>
          </form>
        </Modal>
      </DashboardLayout>
  );
}
