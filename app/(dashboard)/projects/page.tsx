'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';
import { Plus, Search, Filter, Briefcase, Download, ArrowUpRight, Pencil, Trash2, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { exportToExcel } from '@/lib/utilities/excel-export';
import { generateFinancialPDF } from '@/lib/utilities/pdf-export';
import Link from 'next/link';
import { useCurrentDirector } from '@/lib/hooks/useCurrentDirector';
import { toast } from 'sonner';

interface ProjectRecord {
  id: string;
  displayId: string;
  name: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  contractValue: number;
  validPaymentsTotal: number;
  outstandingReceivable: number;
  clientCredit: number;
  paymentStatus: 'pending' | 'completed';
  startDate: string;
  notes?: string;
}

export default function ProjectsPage() {
  const { director: currentDirector } = useCurrentDirector();

  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [projectsLoadError, setProjectsLoadError] = useState(false);
  const [expandedProjectIds, setExpandedProjectIds] = useState<string[]>([]);
  const toggleProject = (id: string) => setExpandedProjectIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state for New Project
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [contractValue, setContractValue] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Form state for Editing Project
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editClientEmail, setEditClientEmail] = useState('');
  const [editClientPhone, setEditClientPhone] = useState('');
  const [editContractValue, setEditContractValue] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');

  // Delete State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecord | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const fetchProjects = async () => {
    setIsLoadingProjects(true);
    setProjectsLoadError(false);
    try {
      let data: any[] = [];
      let apiFailed = false;
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error('Projects API request failed');
        const json = await res.json();
        if (json.data) data = json.data;
      } catch {
        apiFailed = true;
      }

      if (!data || data.length === 0) {
        const supabase = createClient();
        const { data: dbData, error: dbError } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
        if (dbError) {
          if (apiFailed) throw dbError;
        } else if (dbData) {
          data = dbData;
        }
      }

      if (data && data.length > 0) {
        setProjects(
            data.map((p) => {
              const contractVal = Number(p.contract_value || 0);
              const paid = Number(p.valid_payments_total || 0);
              const out =
                  p.outstanding_receivable !== null && p.outstanding_receivable !== undefined
                      ? Number(p.outstanding_receivable)
                      : Math.max(0, contractVal - paid);
              const status =
                  p.payment_status || (contractVal > 0 && paid >= contractVal ? 'completed' : 'pending');

              return {
                id: p.id,
                displayId: p.display_id,
                name: p.name,
                clientName: p.client_name,
                clientEmail: p.client_email,
                clientPhone: p.client_phone,
                contractValue: contractVal,
                validPaymentsTotal: paid,
                outstandingReceivable: out,
                clientCredit: Number(p.client_credit || 0),
                paymentStatus: status,
                startDate: p.start_date,
                notes: p.notes,
              };
            })
        );
      } else {
        setProjects([]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      setProjectsLoadError(true);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const val = parseFloat(contractValue);
    if (isNaN(val) || val <= 0) {
      toast.error('Invalid contract value', {
        description: 'Please enter a valid positive contract value.',
      });
      setIsSubmitting(false);
      return;
    }

    const newDisplayId = `DPL-2026-000${projects.length + 1}`;
    const newProject: ProjectRecord = {
      id: `p-${Date.now()}`,
      displayId: newDisplayId,
      name: projectName,
      clientName: clientName,
      clientEmail: clientEmail,
      clientPhone: clientPhone,
      contractValue: val,
      validPaymentsTotal: 0,
      outstandingReceivable: val,
      clientCredit: 0,
      paymentStatus: 'pending',
      startDate: startDate,
      notes: notes,
    };

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          clientName: clientName,
          clientEmail: clientEmail || undefined,
          clientPhone: clientPhone || undefined,
          contractValue: val,
          currency: 'LKR',
          startDate: startDate,
          paymentSchedule: [
            {
              title: 'Full Contract Milestone',
              expectedDate: startDate,
              amount: val,
            },
          ],
          notes: notes || undefined,
        }),
      });
      const resData = await res.json();
      if (!res.ok) {
        toast.error('Project creation failed', {
          description: resData.error || 'Failed to save project to database.',
        });
        setIsSubmitting(false);
        return;
      }

      if (resData.data) {
        newProject.id = resData.data.id;
        newProject.displayId = resData.data.display_id || newDisplayId;
      }

      setProjects([newProject, ...projects]);
      setIsModalOpen(false);

      // Success toast - only after successful API response
      toast.success('Project created successfully!', {
        description: `${projectName} has been registered in the DevPlux Financial Projects Register.`,
        duration: 4000,
      });

      // Reset form
      setProjectName('');
      setClientName('');
      setClientEmail('');
      setClientPhone('');
      setContractValue('');
      setNotes('');
    } catch (err: any) {
      toast.error('Something went wrong', {
        description: err instanceof Error
            ? err.message
            : 'Unable to create project. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (p: ProjectRecord) => {
    setEditId(p.id);
    setEditName(p.name);
    setEditClientName(p.clientName);
    setEditClientEmail(p.clientEmail || '');
    setEditClientPhone(p.clientPhone || '');
    setEditContractValue(String(p.contractValue));
    setEditStartDate(p.startDate);
    setEditNotes(p.notes || '');
    setEditReason('');
    setIsEditModalOpen(true);
  };

  const handleExecuteUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(editContractValue);
    if (isNaN(val) || val <= 0) {
      alert('Please enter a valid positive contract value');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          name: editName,
          clientName: editClientName,
          clientEmail: editClientEmail || null,
          clientPhone: editClientPhone || null,
          contractValue: val,
          startDate: editStartDate,
          notes: editNotes || null,
          initiatorName: currentDirector.name,
          initiatorRole: 'Director',
          modificationReason: editReason.trim() || 'Director adjusted project contract details',
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to update project');
      }

      // Optimistically update project in state
      setProjects((prev) =>
          prev.map((p) => {
            if (p.id === editId) {
              const out = Math.max(0, val - p.validPaymentsTotal);
              const cred = Math.max(0, p.validPaymentsTotal - val);
              const status = val > 0 && p.validPaymentsTotal >= val ? 'completed' : 'pending';
              return {
                ...p,
                name: editName,
                clientName: editClientName,
                clientEmail: editClientEmail,
                clientPhone: editClientPhone,
                contractValue: val,
                startDate: editStartDate,
                notes: editNotes,
                outstandingReceivable: out,
                clientCredit: cred,
                paymentStatus: status,
              };
            }
            return p;
          })
      );

      setIsEditModalOpen(false);
      alert('Project updated successfully! Real-time calculations updated and peer approval notification dispatched.');
    } catch (err: any) {
      alert(`Update Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExecuteDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToDelete) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects?id=${projectToDelete.id}&initiatorName=${encodeURIComponent(currentDirector.name)}&reason=${encodeURIComponent(deleteReason || 'Project deleted')}`, {
        method: 'DELETE',
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to delete project');
      }

      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      setDeleteReason('');
      alert('Project deleted successfully. Balances recalculated and logged in Approvals queue.');
    } catch (err: any) {
      alert(`Delete Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
        p.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.paymentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalContractValue = projects.reduce((acc, p) => acc + p.contractValue, 0);
  const totalReceived = projects.reduce((acc, p) => acc + p.validPaymentsTotal, 0);
  const totalReceivables = projects.reduce((acc, p) => acc + p.outstandingReceivable, 0);

  const handleExport = () => {
    const data = filteredProjects.map((p) => ({
      'Project Display ID': p.displayId,
      'Project Name': p.name,
      'Client Name': p.clientName,
      'Contract Value (LKR)': p.contractValue,
      'Payments Received (LKR)': p.validPaymentsTotal,
      'Outstanding Receivable (LKR)': p.outstandingReceivable,
      'Client Credit (LKR)': p.clientCredit,
      'Payment Status': p.paymentStatus === 'completed' ? 'Payment Complete' : 'Payment Pending',
      'Start Date': p.startDate,
    }));
    exportToExcel('Devplux_Projects_Register', data, 'Projects');
  };

  return (
      <DashboardLayout
          pageTitle="Financial Projects Register"
          pageDescription="Contract agreements, client receivable schedules, and payment satisfaction statuses."
          userRole="director"
      >
        {/* Financial Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Total Contract Value</p>
              <p className="text-xl font-bold text-slate-900 mt-1 tabular-numbers">
                {formatLKR(totalContractValue)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Agreed client development contracts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Valid Payments Received</p>
              <p className="text-xl font-bold text-emerald-700 mt-1 tabular-numbers">
                {formatLKR(totalReceived)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Posted client installment receipts</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500 font-semibold uppercase">Outstanding Receivables</p>
              <p className="text-xl font-bold text-amber-700 mt-1 tabular-numbers">
                {formatLKR(totalReceivables)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Pending client payments</p>
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
                  placeholder="Search by ID, name, client..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                  variant={statusFilter === 'all' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
              >
                All
              </Button>
              <Button
                  variant={statusFilter === 'pending' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('pending')}
              >
                Pending
              </Button>
              <Button
                  variant={statusFilter === 'completed' ? 'primary' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('completed')}
              >
                Complete
              </Button>
            </div>
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
              New Project
            </Button>
          </div>
        </div>

        {/* Compact, expandable Projects Register — no horizontal scrolling */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Briefcase className="h-4 w-4 shrink-0 text-slate-500" />
                <CardTitle>Client Development Projects ({filteredProjects.length})</CardTitle>
              </div>
              {!isLoadingProjects && !projectsLoadError && (
                  <span className="shrink-0 text-xs text-slate-400">{filteredProjects.length} records</span>
              )}
            </div>
          </CardHeader>
          <div className="w-full">
            {isLoadingProjects ? (
                <div role="status" className="flex min-h-44 flex-col items-center justify-center gap-3 px-4 py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">Loading projects...</span>
                  <span className="text-xs text-slate-400">Fetching financial project records</span>
                </div>
            ) : projectsLoadError ? (
                <div className="px-5 py-12 text-center text-sm">
                  <p className="font-medium text-rose-700">Unable to load projects.</p>
                  <p className="mt-1 text-slate-500">Please check your connection and try again.</p>
                  <button type="button" onClick={fetchProjects} className="mt-3 rounded-md border border-slate-200 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50">Retry loading</button>
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-slate-400">No matching projects found.</div>
            ) : (
                <table className="w-full table-fixed text-left text-xs text-slate-600">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="w-[53%] px-3 py-3 sm:px-5">Project / Client</th>
                    <th className="w-[23%] px-2 py-3 text-right sm:px-4">Contract</th>
                    <th className="w-[17%] px-2 py-3 text-center sm:px-4">Status</th>
                    <th className="w-[7%] px-2 py-3 text-center"><span className="sr-only">Expand</span></th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                  {filteredProjects.map((p) => {
                    const expanded = expandedProjectIds.includes(p.id);
                    return (
                        <React.Fragment key={p.id}>
                          <tr className="cursor-pointer transition-colors hover:bg-slate-50" onClick={() => toggleProject(p.id)}>
                            <td className="min-w-0 px-3 py-4 sm:px-5">
                              <div className="truncate font-semibold text-slate-900" title={p.name}>{p.name}</div>
                              <div className="mt-1 truncate text-[11px] text-slate-500" title={`${p.displayId} • ${p.clientName}`}>{p.displayId} · {p.clientName}</div>
                            </td>
                            <td className="px-2 py-4 text-right font-semibold tabular-nums text-slate-900 sm:px-4">
                              <span className="block truncate" title={formatLKR(p.contractValue)}>{formatLKR(p.contractValue)}</span>
                            </td>
                            <td className="px-2 py-4 text-center sm:px-4">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${p.paymentStatus === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {p.paymentStatus === 'completed' ? 'Complete' : 'Pending'}
                          </span>
                            </td>
                            <td className="px-2 py-4 text-center">
                              <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} details for ${p.name}`} aria-expanded={expanded} onClick={(e) => { e.stopPropagation(); toggleProject(p.id); }} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </td>
                          </tr>
                          {expanded && (
                              <tr className="bg-slate-50/70">
                                <td colSpan={4} className="px-4 py-5 sm:px-6">
                                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                                    <div className="min-w-0 space-y-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Project information</p>
                                      <p className="break-words font-semibold text-slate-900">{p.name}</p>
                                      <p className="font-mono text-slate-600">{p.displayId}</p>
                                      <p className="text-slate-600">Start: {p.startDate ? formatDate(p.startDate) : '—'}</p>
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Client details</p>
                                      <p className="break-words font-medium text-slate-900">{p.clientName}</p>
                                      {p.clientEmail && <p className="break-all text-slate-600">{p.clientEmail}</p>}
                                      {p.clientPhone && <p className="text-slate-600">{p.clientPhone}</p>}
                                    </div>
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Financial summary</p>
                                      <p>Contract: <span className="font-semibold text-slate-900">{formatLKR(p.contractValue)}</span></p>
                                      <p>Received: <span className="font-semibold text-emerald-700">{formatLKR(p.validPaymentsTotal)}</span></p>
                                      <p>Receivable: <span className="font-semibold text-amber-700">{formatLKR(p.outstandingReceivable)}</span></p>
                                      <p>Credit: <span className="font-semibold text-slate-700">{formatLKR(p.clientCredit)}</span></p>
                                    </div>
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Actions</p>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Link href={`/projects/${p.id}`} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-3 py-2 font-semibold text-blue-700 hover:bg-blue-100">Ledger <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                                        <button type="button" onClick={() => handleOpenEdit(p)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 hover:bg-slate-100"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                                        <button type="button" onClick={() => { setProjectToDelete(p); setIsDeleteModalOpen(true); }} className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-3 py-2 font-medium text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                                      </div>
                                    </div>
                                  </div>
                                  {p.notes && <div className="mt-4 border-t border-slate-200 pt-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Financial notes</p><p className="whitespace-pre-wrap break-words text-slate-600">{p.notes}</p></div>}
                                </td>
                              </tr>
                          )}
                        </React.Fragment>
                    );
                  })}
                  </tbody>
                </table>
            )}
          </div>
        </Card>

        {/* New Project Modal */}
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="Register Financial Project"
            description="Creates a project record with an auto-generated unique identifier (DPL-YYYY-XXXX)."
            maxWidth="lg"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            <Input
                label="Project Name"
                required
                placeholder="e.g. Enterprise Cloud ERP Implementation"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Client Organization"
                  required
                  placeholder="e.g. Acme Lanka (Pvt) Ltd"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
              />
              <Input
                  label="Client Billing Email"
                  type="email"
                  placeholder="billing@acmelanka.com"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Agreed Contract Value (LKR)"
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 750000"
                  value={contractValue}
                  onChange={(e) => setContractValue(e.target.value)}
                  helperText="Authoritative contract sum for client receivables."
              />
              <Input
                  label="Project Start Date"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contract Terms & Financial Notes
              </label>
              <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Payment milestone schedules, advance agreements, invoicing instructions..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isSubmitting}>
                Create Financial Project
              </Button>
            </div>
          </form>
        </Modal>

        {/* Edit Project Modal */}
        <Modal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            title="Edit Financial Project"
            description="Updates project particulars immediately. Peer directors will be alerted in the Approvals section."
            maxWidth="lg"
        >
          <form onSubmit={handleExecuteUpdate} className="space-y-4">
            <Input
                label="Project Name"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Client Organization"
                  required
                  value={editClientName}
                  onChange={(e) => setEditClientName(e.target.value)}
              />
              <Input
                  label="Client Billing Email"
                  type="email"
                  value={editClientEmail}
                  onChange={(e) => setEditClientEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                  label="Agreed Contract Value (LKR)"
                  type="number"
                  step="0.01"
                  required
                  value={editContractValue}
                  onChange={(e) => setEditContractValue(e.target.value)}
                  helperText="Updates client receivable totals immediately."
              />
              <Input
                  label="Project Start Date"
                  type="date"
                  required
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Financial Notes
              </label>
              <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Modification (Logged for Director Approvals Queue)
              </label>
              <Input
                  placeholder="e.g. Contract value amended per supplementary agreement..."
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
            title="Confirm Project Deletion"
            description="Permanently removes this project record. All calculations will update instantly."
        >
          <form onSubmit={handleExecuteDelete} className="space-y-4">
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Are you sure you want to delete {projectToDelete?.name}?</p>
                <p className="mt-0.5 text-rose-700">
                  This action is executed immediately in real time. A notice will be logged in the Approvals queue indicating that {currentDirector.name} performed this deletion.
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
                  placeholder="e.g. Cancelled project by mutual client consent..."
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
      </DashboardLayout>
  );
}
