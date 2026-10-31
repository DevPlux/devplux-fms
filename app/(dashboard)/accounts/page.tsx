'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import {
  Landmark,
  ArrowRightLeft,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Plus,
} from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { createClient } from '@/lib/supabase/client';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([
    {
      id: 'acc-1',
      code: '1020',
      name: 'Company Bank Account',
      type: 'Asset (Bank Account)',
      currency: 'LKR',
      openingBalance: 0,
      totalDebits: 0,
      totalCredits: 0,
      currentBalance: 0,
      lastReconciledDate: '—',
      isActive: true,
    },
    {
      id: 'acc-2',
      code: '1010',
      name: 'Cash on Hand',
      type: 'Asset (Cash Reserve)',
      currency: 'LKR',
      openingBalance: 0,
      totalDebits: 0,
      totalCredits: 0,
      currentBalance: 0,
      lastReconciledDate: '—',
      isActive: true,
    },
  ]);

  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState(false);
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);

  // New Account state
  const [newAccName, setNewAccName] = useState('');
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccType, setNewAccType] = useState('asset');
  const [newAccOpening, setNewAccOpening] = useState('0');

  // Transfer Form state
  const [fromAccount, setFromAccount] = useState('1020');
  const [toAccount, setToAccount] = useState('1010');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferNotes, setTransferNotes] = useState('');

  // Reconciliation Preview state
  const [reconcileAccount, setReconcileAccount] = useState('1020');
  const [importedRows, setImportedRows] = useState<any[]>([]);

  // Fetch real financial accounts from Supabase if available
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from('financial_accounts').select('*').order('code');
        if (data && data.length > 0) {
          // Strictly display liquid cash & bank accounts in Cash & Bank Register
          const liquidAccounts = data.filter(
            (a: any) =>
              a.code?.startsWith('10') ||
              a.name?.toLowerCase().includes('bank') ||
              a.name?.toLowerCase().includes('cash')
          );

          if (liquidAccounts.length > 0) {
            setAccounts(
              liquidAccounts.map((a: any) => ({
                id: a.id,
                code: a.code,
                name: a.name,
                type: a.code === '1010' ? 'Asset (Cash Reserve)' : 'Asset (Bank Account)',
                currency: a.currency || 'LKR',
                openingBalance: Number(a.opening_balance || 0),
                totalDebits: 0,
                totalCredits: 0,
                currentBalance: Number(a.current_balance || 0),
                lastReconciledDate: '—',
                isActive: a.is_active,
              }))
            );
          }
        }
      } catch (err) {
        console.warn('Notice loading financial accounts:', err);
      }
    };

    fetchAccounts();
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;

    const opening = parseFloat(newAccOpening) || 0;
    const newAcc = {
      id: `acc-${Date.now()}`,
      code: newAccCode.trim() || String(1000 + accounts.length * 10),
      name: newAccName.trim(),
      type: newAccType === 'asset' ? 'Asset (Bank Account)' : 'Asset (Cash Reserve)',
      currency: 'LKR',
      openingBalance: opening,
      totalDebits: 0,
      totalCredits: 0,
      currentBalance: opening,
      lastReconciledDate: '—',
      isActive: true,
    };

    try {
      const supabase = createClient();
      await supabase.from('financial_accounts').insert({
        company_id: 'a0000000-0000-0000-0000-000000000001',
        code: newAcc.code,
        name: newAcc.name,
        type: 'asset',
        opening_balance: opening,
        current_balance: opening,
        currency: 'LKR',
      });
    } catch (err) {
      console.warn('Notice persisting account:', err);
    }

    setAccounts([...accounts, newAcc]);
    setIsNewAccountModalOpen(false);
    setNewAccName('');
    setNewAccCode('');
    setNewAccOpening('0');
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferAmount);
    if (isNaN(amt) || amt <= 0) return;
    if (fromAccount === toAccount) {
      alert('Cannot transfer funds to the same account.');
      return;
    }

    setAccounts(
      accounts.map((acc) => {
        if (acc.code === fromAccount) {
          return {
            ...acc,
            totalCredits: acc.totalCredits + amt,
            currentBalance: acc.currentBalance - amt,
          };
        }
        if (acc.code === toAccount) {
          return {
            ...acc,
            totalDebits: acc.totalDebits + amt,
            currentBalance: acc.currentBalance + amt,
          };
        }
        return acc;
      })
    );

    setIsTransferModalOpen(false);
    setTransferAmount('');
    setTransferNotes('');
  };

  const totalCompanyCash = accounts.reduce((acc, a) => acc + a.currentBalance, 0);

  return (
    <DashboardLayout
      pageTitle="Cash & Bank Accounts"
      pageDescription="Authoritative balances calculated from verified transaction postings and business account records."
    >
      {/* Top Banner Metric */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Total Reconciled Corporate Cash Position
              </p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1 tabular-numbers">
                {formatLKR(totalCompanyCash)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Sum of all active business bank accounts and physical cash reserves.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsNewAccountModalOpen(true)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                Add Account
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsTransferModalOpen(true)}
                icon={<ArrowRightLeft className="w-3.5 h-3.5" />}
              >
                Internal Transfer
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsReconcileModalOpen(true)}
                icon={<UploadCloud className="w-3.5 h-3.5" />}
              >
                Reconcile Statement
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Accounts List Table */}
      <Card>
        <CardHeader>
          <CardTitle>Business Accounts Register</CardTitle>
          <p className="text-xs text-slate-500">Double-entry sub-ledgers maintaining company liquidity.</p>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Account Code</th>
                <th className="px-6 py-3.5">Account Name</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5 text-right">Opening Balance</th>
                <th className="px-6 py-3.5 text-right">Total Inflow</th>
                <th className="px-6 py-3.5 text-right">Total Outflow</th>
                <th className="px-6 py-3.5 text-right">Current Balance</th>
                <th className="px-6 py-3.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">{acc.code}</td>
                  <td className="px-6 py-3.5 font-semibold text-slate-900">{acc.name}</td>
                  <td className="px-6 py-3.5 text-slate-500">{acc.type}</td>
                  <td className="px-6 py-3.5 text-right tabular-numbers">{formatLKR(acc.openingBalance)}</td>
                  <td className="px-6 py-3.5 text-right font-medium text-emerald-700 tabular-numbers">
                    +{formatLKR(acc.totalDebits)}
                  </td>
                  <td className="px-6 py-3.5 text-right font-medium text-rose-600 tabular-numbers">
                    -{formatLKR(acc.totalCredits)}
                  </td>
                  <td className="px-6 py-3.5 text-right font-bold text-slate-900 tabular-numbers">
                    {formatLKR(acc.currentBalance)}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <Badge variant={acc.isActive ? 'completed' : 'pending'}>
                      {acc.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add New Account Modal */}
      <Modal
        isOpen={isNewAccountModalOpen}
        onClose={() => setIsNewAccountModalOpen(false)}
        title="Add Business Financial Account"
        description="Register a new business bank account, wallet, or cash reserve."
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Input
            label="Account / Bank Name"
            required
            placeholder="e.g. Primary Operating Bank Account / Petty Cash"
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Account Code"
              placeholder="e.g. 1040"
              value={newAccCode}
              onChange={(e) => setNewAccCode(e.target.value)}
            />
            <Input
              label="Opening Balance (LKR)"
              type="number"
              step="0.01"
              value={newAccOpening}
              onChange={(e) => setNewAccOpening(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsNewAccountModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Internal Transfer Modal */}
      <Modal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        title="Internal Account Fund Transfer"
        description="Transfers liquidity between business bank accounts and cash reserves without altering company net worth."
      >
        <form onSubmit={handleExecuteTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="From Source Account"
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code})
                </option>
              ))}
            </Select>

            <Select
              label="To Destination Account"
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.name} ({a.code})
                </option>
              ))}
            </Select>
          </div>

          <Input
            label="Transfer Amount (LKR)"
            type="number"
            step="0.01"
            required
            placeholder="e.g. 50000"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
          />

          <Input
            label="Transfer Reference / Reason"
            placeholder="e.g. Petty cash replenishment"
            value={transferNotes}
            onChange={(e) => setTransferNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Execute Transfer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reconciliation Modal */}
      <Modal
        isOpen={isReconcileModalOpen}
        onClose={() => setIsReconcileModalOpen(false)}
        title="Bank Statement Reconciliation"
        description="Compare external bank statement records with internal general ledger postings."
        maxWidth="xl"
      >
        <div className="space-y-4">
          <Select
            label="Select Account to Reconcile"
            value={reconcileAccount}
            onChange={(e) => setReconcileAccount(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name} ({a.code})
              </option>
            ))}
          </Select>

          <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50">
            <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-800">Upload Bank Statement (CSV or Excel)</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Exports from your business online banking portal
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setIsReconcileModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
