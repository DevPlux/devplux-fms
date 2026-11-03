import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditLog } from '@/lib/audit/audit-logger';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BANK_ACCOUNT_ID = 'b0000000-0000-0000-0000-000000000002'; // Company Bank Account
const DEFAULT_CATEGORY_ID = 'c0000000-0000-0000-0000-000000000005'; // Contract Developer Costs / Contractor & Professional Fees

// Global memory cache to prevent cold-start loss
if (!(globalThis as any).__devplux_contractors_cache__) {
  (globalThis as any).__devplux_contractors_cache__ = [];
}
if (!(globalThis as any).__devplux_approvals_cache__) {
  (globalThis as any).__devplux_approvals_cache__ = [];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'contractors.json');
const APPROVALS_DATA_FILE = path.join(DATA_DIR, 'approvals.json');

function readLocalContractors(): any[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Notice reading local contractors cache:', err);
  }
  return (globalThis as any).__devplux_contractors_cache__ || [];
}

function writeLocalContractors(contractors: any[]): void {
  try {
    (globalThis as any).__devplux_contractors_cache__ = contractors;
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(contractors, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice writing local contractors cache:', err);
  }
}

function readLocalApprovals(): any[] {
  try {
    if (fs.existsSync(APPROVALS_DATA_FILE)) {
      const content = fs.readFileSync(APPROVALS_DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function writeLocalApprovals(items: any[]): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(APPROVALS_DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
  } catch {}
}

async function recordBoardApproval(
  approvalItem: any,
  fallbackId: string,
  actorName: string,
  adminSupabase: any
) {
  const fullApproval = {
    id: fallbackId,
    ...approvalItem,
    created_at: new Date().toISOString(),
    status: 'pending',
    approvers: [actorName],
    approvals_count: 1,
    required_approvals: 3,
  };

  // 1. Persistent file store
  try {
    const local = readLocalApprovals();
    const existingIdx = local.findIndex(
      (a: any) =>
        a.id === fallbackId ||
        (String(a.entity_id) === String(approvalItem.entity_id) && a.action_type === approvalItem.action_type)
    );
    if (existingIdx >= 0) {
      local[existingIdx] = fullApproval;
    } else {
      local.unshift(fullApproval);
    }
    writeLocalApprovals(local);
  } catch {}

  // 2. Global memory cache
  try {
    if (!(globalThis as any).__devplux_approvals_cache__) {
      (globalThis as any).__devplux_approvals_cache__ = [];
    }
    const cache = (globalThis as any).__devplux_approvals_cache__;
    const cacheIdx = cache.findIndex(
      (a: any) =>
        a.id === fallbackId ||
        (String(a.entity_id) === String(approvalItem.entity_id) && a.action_type === approvalItem.action_type)
    );
    if (cacheIdx >= 0) {
      cache[cacheIdx] = fullApproval;
    } else {
      cache.unshift(fullApproval);
    }
  } catch {}

  // 3. Insert into Supabase modification_approvals (with fallback if check constraint triggers)
  try {
    const { error: insErr } = await adminSupabase.from('modification_approvals').insert(approvalItem);
    if (insErr) {
      console.warn('Notice inserting into modification_approvals (retrying with generic type):', insErr.message);
      await adminSupabase.from('modification_approvals').insert({
        ...approvalItem,
        entity_type: 'expense',
        action_type: approvalItem.action_type === 'disburse' ? 'update' : approvalItem.action_type,
        details: {
          ...approvalItem.details,
          actual_entity_type: approvalItem.entity_type,
          actual_action_type: approvalItem.action_type,
        },
      });
    }
  } catch (dbErr) {
    console.warn('Notice inserting modification approval:', dbErr);
  }
}

export async function GET(req: NextRequest) {
  try {
    const adminSupabase = createAdminClient();
    let dbContractors: any[] | null = null;

    // 1. Attempt query from Supabase contractors table
    try {
      const { data, error } = await adminSupabase
        .from('contractors')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        dbContractors = data;
      }
    } catch (dbErr) {
      console.warn('Notice querying contractors table from Supabase:', dbErr);
    }

    // 2. If Supabase returned rows, format and sync to local file
    if (dbContractors && dbContractors.length > 0) {
      const mapped = dbContractors.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email || '',
        phone: c.phone || '',
        skillSet: c.skill_set || '',
        projectId: c.project_id || null,
        projectDisplayId: c.project_display_id || 'General',
        projectName: c.project_display_id ? `Project ${c.project_display_id}` : 'General Deliverables',
        agreedFee: Number(c.agreed_fee ?? c.default_agreed_fee ?? 0),
        invoicedTotal: Number(c.invoiced_total ?? c.agreed_fee ?? c.default_agreed_fee ?? 0),
        paidTotal: Number(c.paid_total || 0),
        outstandingPayable: Number(
          c.outstanding_payable !== undefined && c.outstanding_payable !== null
            ? c.outstanding_payable
            : Math.max(0, Number(c.invoiced_total ?? c.agreed_fee ?? c.default_agreed_fee ?? 0) - Number(c.paid_total || 0))
        ),
        receiptUrl: c.receipt_url || null,
        status: c.status || (c.is_active === false ? 'inactive' : 'active'),
        createdAt: c.created_at || new Date().toISOString(),
      }));

      writeLocalContractors(mapped);
      return NextResponse.json({ success: true, contractors: mapped });
    }

    // 3. Fallback to local file / in-memory cache
    const localContractors = readLocalContractors();
    return NextResponse.json({ success: true, contractors: localContractors });
  } catch (err: any) {
    console.error('Error fetching contractors:', err);
    const fallback = readLocalContractors();
    return NextResponse.json({ success: true, contractors: fallback });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || 'create';
    const adminSupabase = createAdminClient();

    // -------------------------------------------------------------
    // ACTION: REMOVE / DELETE CONTRACTOR (DISPATCH FOR 3/5 QUORUM)
    // -------------------------------------------------------------
    if (action === 'delete') {
      const { contractorId, reason, initiatorName, initiatorRole } = body;
      if (!contractorId) {
        return NextResponse.json({ error: 'Contractor ID is required.' }, { status: 400 });
      }

      // Find contractor from DB or local cache
      let contractor: any = null;
      try {
        const { data } = await adminSupabase
          .from('contractors')
          .select('*')
          .eq('id', contractorId)
          .maybeSingle();
        if (data) {
          contractor = {
            id: data.id,
            name: data.name,
            projectDisplayId: data.project_display_id,
            agreedFee: Number(data.agreed_fee ?? data.default_agreed_fee ?? 0),
            invoicedTotal: Number(data.invoiced_total ?? data.agreed_fee ?? 0),
            paidTotal: Number(data.paid_total || 0),
            outstandingPayable: Number(data.outstanding_payable || 0),
            status: data.status,
          };
        }
      } catch {
        // ignore
      }

      if (!contractor) {
        const localList = readLocalContractors();
        contractor = localList.find((c) => String(c.id) === String(contractorId));
      }

      if (!contractor) {
        return NextResponse.json({ error: 'Contractor record not found.' }, { status: 404 });
      }

      // 1. Mark status as pending_deletion in Supabase
      try {
        await adminSupabase
          .from('contractors')
          .update({
            status: 'pending_deletion',
            updated_at: new Date().toISOString(),
          })
          .eq('id', contractor.id);
      } catch (err) {
        console.warn('Notice updating contractor status in DB:', err);
      }

      // 2. Mark status in local cache
      const localList = readLocalContractors();
      const updatedLocal = localList.map((c) => {
        if (String(c.id) === String(contractor.id)) {
          return { ...c, status: 'pending_deletion' };
        }
        return c;
      });
      writeLocalContractors(updatedLocal);

      // 3. Dispatch to modification_approvals (Requires 3/5 quorum to hard-delete)
      const actorName = initiatorName || 'Mr. Chanuka Lakshan';
      const actorRole = initiatorRole || 'Director';
      const summaryReason = reason?.trim() || 'Contract terminated / External talent removal requested';
      const changesSummary = `Contractor removal request for ${contractor.name} (${contractor.projectDisplayId || 'General'}) initiated by ${actorName}. Awaiting 3/5 Board Quorum.`;

      const approvalItem = {
        company_id: COMPANY_ID,
        entity_type: 'contractor',
        entity_id: contractor.id,
        entity_reference: `DEL-CNT-${Date.now().toString().slice(-6)}`,
        entity_name: `${contractor.name} (${contractor.projectDisplayId || 'General'})`,
        action_type: 'delete',
        initiator_name: actorName,
        initiator_role: actorRole,
        details: {
          changesSummary,
          reason: summaryReason,
          before: {
            contractorName: contractor.name,
            project: contractor.projectDisplayId || 'General',
            agreedFee: contractor.agreedFee,
            paidTotal: contractor.paidTotal,
            outstandingPayable: contractor.outstandingPayable,
          },
        },
      };

      await recordBoardApproval(
        approvalItem,
        `appr-del-cnt-${contractor.id}`,
        actorName,
        adminSupabase
      );

      // 4. Audit Log
      await recordAuditLog({
        actorName,
        actorRole,
        action: 'DELETE_CONTRACTOR_REQUESTED',
        entityType: 'contractor',
        entityId: contractor.id,
        reason: changesSummary,
        beforeValues: {
          name: contractor.name,
          status: 'active',
        },
        afterValues: {
          name: contractor.name,
          status: 'pending_deletion',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Contractor removal requested. Dispatched to Board Approvals for 3/5 quorum.',
      });
    }

    // -------------------------------------------------------------
    // ACTION: DISBURSE CONTRACTOR SETTLEMENT (WITH RECEIPT UPLOAD)
    // -------------------------------------------------------------
    if (action === 'disburse') {
      const {
        contractorId,
        amount,
        disbursementAccount,
        reference,
        receiptUrl,
        initiatorName,
        initiatorRole,
      } = body;

      const numAmt = Number(amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        return NextResponse.json({ error: 'Valid settlement amount is required.' }, { status: 400 });
      }

      // Find contractor from DB or local cache
      let contractor: any = null;
      try {
        const { data } = await adminSupabase
          .from('contractors')
          .select('*')
          .eq('id', contractorId)
          .maybeSingle();
        if (data) {
          contractor = {
            id: data.id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            skillSet: data.skill_set,
            projectId: data.project_id,
            projectDisplayId: data.project_display_id,
            agreedFee: Number(data.agreed_fee ?? data.default_agreed_fee ?? 0),
            invoicedTotal: Number(data.invoiced_total ?? data.agreed_fee ?? data.default_agreed_fee ?? 0),
            paidTotal: Number(data.paid_total || 0),
            outstandingPayable: Number(data.outstanding_payable ?? 0),
            receiptUrl: data.receipt_url || null,
            status: data.status || (data.is_active === false ? 'inactive' : 'active'),
          };
        }
      } catch {
        // ignore
      }

      if (!contractor) {
        const localList = readLocalContractors();
        contractor = localList.find((c) => String(c.id) === String(contractorId));
      }

      if (!contractor) {
        return NextResponse.json({ error: 'Contractor record not found.' }, { status: 404 });
      }

      const newPaid = Number(contractor.paidTotal || 0) + numAmt;
      const initialTotal = Number(contractor.invoicedTotal || contractor.agreedFee || 0);
      const newPayable = Math.max(0, initialTotal - newPaid);
      const newStatus = newPayable <= 0 ? 'completed' : 'active';
      const finalReceiptUrl = receiptUrl || contractor.receiptUrl || null;

      // 1. Update in Supabase (with receipt_url)
      try {
        await adminSupabase
          .from('contractors')
          .update({
            paid_total: newPaid,
            outstanding_payable: newPayable,
            receipt_url: finalReceiptUrl,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', contractor.id);
      } catch (upErr) {
        console.warn('Notice updating contractor in DB:', upErr);
      }

      // 2. Update in local file / memory cache
      const localList = readLocalContractors();
      const updatedLocal = localList.map((c) => {
        if (String(c.id) === String(contractor.id)) {
          return {
            ...c,
            paidTotal: newPaid,
            outstandingPayable: newPayable,
            receiptUrl: finalReceiptUrl,
            status: newStatus,
          };
        }
        return c;
      });
      writeLocalContractors(updatedLocal);

      // 3. Deduct Bank Account Balance
      let targetBankAccountId = DEFAULT_BANK_ACCOUNT_ID;
      try {
        const { data: accounts } = await adminSupabase
          .from('financial_accounts')
          .select('id, name, current_balance');

        if (accounts && accounts.length > 0) {
          const match = accounts.find((a: any) =>
            (disbursementAccount && a.name.toLowerCase().includes(disbursementAccount.toLowerCase())) ||
            (!disbursementAccount && a.id === DEFAULT_BANK_ACCOUNT_ID)
          );
          const accToDeduct = match || accounts[0];
          targetBankAccountId = accToDeduct.id;

          await adminSupabase
            .from('financial_accounts')
            .update({ current_balance: Number(accToDeduct.current_balance || 0) - numAmt })
            .eq('id', accToDeduct.id);
        }
      } catch (accErr) {
        console.warn('Notice updating account balance:', accErr);
      }

      // 4. Resolve Expense Category: 'Contract Developer Costs'
      let targetCategoryId = DEFAULT_CATEGORY_ID;
      const cleanCatName = 'Contract Developer Costs';
      try {
        const { data: cat } = await adminSupabase
          .from('expense_categories')
          .select('id, name')
          .ilike('name', '%Contract%')
          .limit(1)
          .maybeSingle();

        if (cat) {
          targetCategoryId = cat.id;
        } else {
          const { data: newCat } = await adminSupabase
            .from('expense_categories')
            .insert({ company_id: COMPANY_ID, name: cleanCatName })
            .select('id')
            .maybeSingle();
          if (newCat) targetCategoryId = newCat.id;
        }
      } catch (catErr) {
        console.warn('Notice resolving category:', catErr);
      }

      // 5. Post General Ledger Transaction & Expense (Links to all reports & profit calculations)
      const refNo = `DISB-${Date.now()}`;
      const taggedDescription = `[Category: ${cleanCatName}] Contractor settlement for ${contractor.name} (${contractor.projectDisplayId || 'General'})${reference ? ` [Ref: ${reference}]` : ''}`;

      try {
        const { data: txn } = await adminSupabase
          .from('transactions')
          .insert({
            company_id: COMPANY_ID,
            reference_no: refNo,
            type: 'expense',
            amount: numAmt,
            currency: 'LKR',
            transaction_date: new Date().toISOString().split('T')[0],
            description: taggedDescription,
            status: 'posted',
            created_by: null,
            posted_by: null,
            posted_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle();

        if (txn) {
          await adminSupabase.from('expenses').insert({
            transaction_id: txn.id,
            project_id: contractor.projectId || null,
            category_id: targetCategoryId,
            vendor: contractor.name,
            payment_method: 'bank_transfer',
            bank_account_id: targetBankAccountId,
            invoice_reference: reference || null,
            receipt_url: finalReceiptUrl,
            is_paid: true,
          });
        }
      } catch (txnErr) {
        console.warn('Notice recording contractor disbursement transaction:', txnErr);
      }

      // 6. Board Approvals Queue & Global Cache
      const actorName = initiatorName || 'Mr. Chanuka Lakshan';
      const actorRole = initiatorRole || 'Director';
      const changesSummary = `Contractor settlement voucher (${refNo}) of LKR ${numAmt.toLocaleString()} disbursed to ${contractor.name} for project ${contractor.projectDisplayId || 'General'}.`;

      const approvalRecord = {
        company_id: COMPANY_ID,
        entity_type: 'contractor_settlement',
        entity_id: contractor.id,
        entity_reference: refNo,
        entity_name: `${contractor.name} - Contractor Settlement`,
        action_type: 'disburse',
        initiator_name: actorName,
        initiator_role: actorRole,
        details: {
          changesSummary,
          reason: `Settlement disbursement of LKR ${numAmt.toLocaleString()} to external developer ${contractor.name}. Remaining payable: LKR ${newPayable.toLocaleString()}.`,
          after: {
            contractorName: contractor.name,
            project: contractor.projectDisplayId || 'General',
            amount: numAmt,
            remainingPayable: newPayable,
            totalPaidToDate: newPaid,
            paymentMethod: 'Bank Transfer',
            bankAccount: disbursementAccount || 'Company Bank Account',
            reference: reference || 'N/A',
            receiptUrl: finalReceiptUrl,
            isPaid: true,
          },
        },
      };

      await recordBoardApproval(
        approvalRecord,
        `appr-disb-${refNo}`,
        actorName,
        adminSupabase
      );

      // 7. Audit Log
      await recordAuditLog({
        actorName,
        actorRole,
        action: 'DISBURSE_CONTRACTOR',
        entityType: 'contractor_settlement',
        entityId: refNo,
        reason: changesSummary,
        afterValues: {
          contractorName: contractor.name,
          amount: numAmt,
          remainingPayable: newPayable,
          receiptUrl: finalReceiptUrl,
          status: newStatus,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Disbursement recorded and linked to General Ledger.',
        contractor: {
          ...contractor,
          paidTotal: newPaid,
          outstandingPayable: newPayable,
          receiptUrl: finalReceiptUrl,
          status: newStatus,
        },
      });
    }

    // -------------------------------------------------------------
    // ACTION: REGISTER NEW CONTRACTOR
    // -------------------------------------------------------------
    const {
      name,
      email,
      phone,
      skillSet,
      projectDisplayId,
      agreedFee,
      initiatorName,
      initiatorRole,
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Contractor name is required.' }, { status: 400 });
    }

    const fee = Number(agreedFee);
    if (isNaN(fee) || fee <= 0) {
      return NextResponse.json({ error: 'Agreed fee must be greater than zero.' }, { status: 400 });
    }

    // Resolve project ID if provided
    let resolvedProjectId: string | null = null;
    let resolvedDisplay = (projectDisplayId || 'General').trim();
    if (resolvedDisplay && resolvedDisplay !== 'General' && resolvedDisplay !== 'none') {
      try {
        const { data: p } = await adminSupabase
          .from('projects')
          .select('id, display_id')
          .or(`display_id.eq.${resolvedDisplay},name.eq.${resolvedDisplay}`)
          .maybeSingle();
        if (p) {
          resolvedProjectId = p.id;
          resolvedDisplay = p.display_id;
        }
      } catch {
        // ignore
      }
    }

    const newId = randomUUID();
    const newContractor = {
      id: newId,
      name: name.trim(),
      email: email?.trim() || '',
      phone: phone?.trim() || '',
      skillSet: skillSet?.trim() || '',
      projectId: resolvedProjectId,
      projectDisplayId: resolvedDisplay,
      projectName: resolvedDisplay !== 'General' ? `Project ${resolvedDisplay}` : 'General Deliverables',
      agreedFee: fee,
      invoicedTotal: fee, // deliverable committed obligation
      paidTotal: 0,
      outstandingPayable: fee,
      receiptUrl: null,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    // 1. Insert into Supabase contractors table (compatible with both schemas)
    try {
      await adminSupabase.from('contractors').insert({
        id: newId,
        company_id: COMPANY_ID,
        name: newContractor.name,
        email: newContractor.email || null,
        phone: newContractor.phone || null,
        skill_set: newContractor.skillSet || null,
        project_id: newContractor.projectId,
        project_display_id: newContractor.projectDisplayId,
        agreed_fee: fee,
        default_agreed_fee: fee,
        invoiced_total: fee,
        paid_total: 0,
        outstanding_payable: fee,
        status: 'active',
        is_active: true,
      });
    } catch (dbErr) {
      console.warn('Notice inserting contractor into Supabase:', dbErr);
    }

    // 2. Persist to local file & in-memory cache
    const currentList = readLocalContractors();
    const updatedList = [newContractor, ...currentList.filter((c) => c.id !== newId)];
    writeLocalContractors(updatedList);

    // 3. Board Approvals Queue & Global Cache
    const actorName = initiatorName || 'Mr. Chanuka Lakshan';
    const actorRole = initiatorRole || 'Director';
    const summary = `New external contractor ${newContractor.name} registered for project ${newContractor.projectDisplayId} with committed fee of LKR ${fee.toLocaleString()}.`;

    const approvalItem = {
      company_id: COMPANY_ID,
      entity_type: 'contractor',
      entity_id: newId,
      entity_reference: `CNT-${Date.now().toString().slice(-6)}`,
      entity_name: `${newContractor.name} (${newContractor.projectDisplayId})`,
      action_type: 'create',
      initiator_name: actorName,
      initiator_role: actorRole,
      details: {
        changesSummary: summary,
        reason: `Contract developer onboarding for project scope deliverable.`,
        after: {
          name: newContractor.name,
          skillSet: newContractor.skillSet,
          project: newContractor.projectDisplayId,
          agreedFee: fee,
          invoicedTotal: fee,
          paidTotal: 0,
          outstandingPayable: fee,
          status: 'active',
        },
      },
    };

    await recordBoardApproval(
      approvalItem,
      `appr-cnt-${newId}`,
      actorName,
      adminSupabase
    );

    // 4. Audit Log
    await recordAuditLog({
      actorName,
      actorRole,
      action: 'REGISTER_CONTRACTOR',
      entityType: 'contractor',
      entityId: newId,
      reason: summary,
      afterValues: {
        name: newContractor.name,
        agreedFee: fee,
        project: newContractor.projectDisplayId,
        outstandingPayable: fee,
      },
    });

    return NextResponse.json({ success: true, contractor: newContractor }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating/updating contractor:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
