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
import { Plus, Download, Search, Users2, DollarSign } from 'lucide-react';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import { createClient } from '@/lib/supabase/client';

export default function ContractorsPage() {
  const [contractors, setContractors] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isContractorModalOpen, setIsContractorModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedContractorForPayment, setSelectedContractorForPayment] = useState<any>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [disbursementAccount, setDisbursementAccount] = useState('Company Bank Account');

  // New Contractor Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [skills, setSkills] = useState('');
  const [projectId, setProjectId] = useState('none');
  const [customProject, setCustomProject] = useState('');
  const [agreedFee, setAgreedFee] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const supabase = createClient();
        const { data: projData } = await supabase.from('projects').select('id, display_id, name');
        if (projData && projData.length > 0) {
          setAvailableProjects(projData);
        }
      } catch (err) {
        console.warn('Notice loading projects for contractors:', err);
      }
    };
    fetchProjects();
  }, []);

  const handleAddContractor = (e: React.FormEvent) => {
    e.preventDefault();
    const fee = parseFloat(agreedFee);
    if (isNaN(fee) || fee <= 0) return;

    let projDisplay = 'General';
    if (projectId === 'custom') {
      projDisplay = customProject.trim() || 'General';
    } else if (projectId !== 'none') {
      projDisplay = projectId;
    }

    const newContractor = {
      id: `c-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      skillSet: skills.trim(),
      projectDisplayId: projDisplay,
      projectName: `Project ${projDisplay}`,
      agreedFee: fee,
      invoicedTotal: 0,
      paidTotal: 0,
      outstandingPayable: 0,
      status: 'active' as const,
    };

    setContractors([newContractor, ...contractors]);
    setIsContractorModalOpen(false);

    // Reset
    setName('');
    setEmail('');
    setPhone('');
    setSkills('');
    setAgreedFee('');
    setCustomProject('');
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(settlementAmount);
    if (isNaN(amt) || amt <= 0 || !selectedContractorForPayment) return;

    setContractors(
      contractors.map((c) => {
        if (c.id === selectedContractorForPayment.id) {
          const newPaid = c.paidTotal + amt;
          const newPayable = Math.max(0, c.invoicedTotal - newPaid);
          return {
            ...c,
            paidTotal: newPaid,
            outstandingPayable: newPayable,
          };
        }
        return c;
      })
    );

    setIsPaymentModalOpen(false);
    setSelectedContractorForPayment(null);
    setSettlementAmount('');
  };

  const filteredContractors = contractors.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.skillSet.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAgreed = contractors.reduce((acc, c) => acc + c.agreedFee, 0);
  const totalInvoiced = contractors.reduce((acc, c) => acc + c.invoicedTotal, 0);
  const totalPaid = contractors.reduce((acc, c) => acc + c.paidTotal, 0);
  const totalPayable = contractors.reduce((acc, c) => acc + c.outstandingPayable, 0);

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
            <p className="text-[11px] text-slate-400 mt-0.5">Approved developer bills</p>
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
              {filteredContractors.length === 0 ? (
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
                      <p className="text-[11px] text-slate-400">{c.skillSet || c.email}</p>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-[11px] font-semibold text-blue-800">
                      {c.projectDisplayId}
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
                      <Badge variant="completed">ACTIVE</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {c.outstandingPayable > 0 ? (
                        <button
                          onClick={() => {
                            setSelectedContractorForPayment(c);
                            setSettlementAmount(String(c.outstandingPayable));
                            setIsPaymentModalOpen(true);
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
        description="Records contracted developer commitments in general ledger under accounts payable."
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
            <Button type="submit" variant="primary">
              Register Contractor
            </Button>
          </div>
        </form>
      </Modal>

      {/* Settle Contractor Invoice Modal */}
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
            helperText="Reduces Contractor Payables (2020) and debits bank account."
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
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <Button type="button" variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Confirm Disbursement
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
