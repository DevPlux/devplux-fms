import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientPaymentSchema } from '@/lib/validation/payment-schema';
import { expenseSchema } from '@/lib/validation/expense-schema';
import { recordAuditLog } from '@/lib/audit/audit-logger';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_BANK_ACCOUNT_ID = 'b0000000-0000-0000-0000-000000000002'; // Company Bank Account
const DEFAULT_CATEGORY_ID = 'c0000000-0000-0000-0000-000000000001'; // Cloud Hosting & Servers

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const type = searchParams.get('type');

    const adminSupabase = createAdminClient();

    // 1. Fetch Client Payments
    let paymentsQuery = adminSupabase
      .from('client_payments')
      .select(`
        id,
        transaction_id,
        payment_type,
        payment_method,
        external_reference,
        receipt_url,
        notes,
        created_at,
        transactions (
          id,
          reference_no,
          amount,
          currency,
          transaction_date,
          status,
          description
        ),
        projects (
          id,
          display_id,
          name,
          client_name
        ),
        financial_accounts (
          id,
          name,
          code
        )
      `)
      .order('created_at', { ascending: false });

    if (projectId) {
      let targetProjId = projectId;
      if (!UUID_REGEX.test(targetProjId)) {
        const { data: pRec } = await adminSupabase
          .from('projects')
          .select('id')
          .or(`display_id.eq.${targetProjId},name.eq.${targetProjId}`)
          .maybeSingle();
        if (pRec) targetProjId = pRec.id;
      }
      paymentsQuery = paymentsQuery.eq('project_id', targetProjId);
    }

    const { data: payments } = await paymentsQuery;

    // 2. Fetch Expenses if requested
    let expenses: any[] = [];
    if (!type || type === 'expense') {
      let expQuery = adminSupabase
        .from('expenses')
        .select(`
          id,
          transaction_id,
          project_id,
          vendor,
          payment_method,
          invoice_reference,
          receipt_url,
          is_paid,
          created_at,
          transactions (
            id,
            reference_no,
            amount,
            currency,
            transaction_date,
            description,
            status
          ),
          expense_categories (
            id,
            name
          ),
          projects (
            id,
            display_id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (projectId) {
        let targetProjId = projectId;
        if (!UUID_REGEX.test(targetProjId)) {
          const { data: pRec } = await adminSupabase
            .from('projects')
            .select('id')
            .or(`display_id.eq.${targetProjId},name.eq.${targetProjId}`)
            .maybeSingle();
          if (pRec) targetProjId = pRec.id;
        }
        expQuery = expQuery.eq('project_id', targetProjId);
      }

      const { data: expData } = await expQuery;
      if (expData) expenses = expData;
    }

    const isSoftDeletedTxn = (item: any) => {
      const status = item?.transactions?.status;
      const desc = String(item?.transactions?.description || '');
      return status === 'reversed' || desc.includes('[SOFT_DELETED_PENDING_APPROVAL]');
    };

    const activePayments = (payments || []).filter((p: any) => !isSoftDeletedTxn(p));
    const activeExpenses = (expenses || []).filter((e: any) => !isSoftDeletedTxn(e));

    // Fetch authoritative financial account balances
    const { data: accounts } = await adminSupabase
      .from('financial_accounts')
      .select('id, name, type, account_number, current_balance, currency')
      .order('name');

    return NextResponse.json({
      success: true,
      payments: activePayments,
      expenses: activeExpenses,
      accounts: accounts || [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actionType, ...payload } = body;

    const adminSupabase = createAdminClient();

    // 1. Resolve Acting User ID (Session or Fallback Managing Director)
    let userId: string | null = null;
    try {
      const serverClient = createServerSupabaseClient();
      const {
        data: { user },
      } = await serverClient.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // ignore
    }

    if (!userId) {
      const { data: defaultProfile } = await adminSupabase
        .from('profiles')
        .select('id')
        .limit(1)
        .maybeSingle();

      userId = defaultProfile?.id || 'a68e15d7-578e-4f20-a5a9-f44d97b1e9c3';
    }

    // 2. Process Client Payment
    if (actionType === 'client_payment') {
      const validation = clientPaymentSchema.safeParse(payload);
      if (!validation.success) {
        return NextResponse.json({ error: 'Validation failed', details: validation.error.format() }, { status: 422 });
      }

      const p = validation.data;
      const refNo = `TXN-${Date.now()}`;

      // Resolve Project UUID
      let targetProjectId = p.projectId;
      if (!UUID_REGEX.test(targetProjectId)) {
        const { data: projRecord } = await adminSupabase
          .from('projects')
          .select('id')
          .or(`display_id.eq.${targetProjectId},name.eq.${targetProjectId}`)
          .limit(1)
          .maybeSingle();

        if (projRecord) {
          targetProjectId = projRecord.id;
        } else {
          // Fallback to first available project or create a default one
          const { data: firstProj } = await adminSupabase.from('projects').select('id').limit(1).maybeSingle();
          if (firstProj) {
            targetProjectId = firstProj.id;
          } else {
            return NextResponse.json({ error: 'No valid project found to link this payment to.' }, { status: 400 });
          }
        }
      }

      // Resolve Bank Account UUID
      let targetBankAccountId = p.bankAccountId;
      if (!targetBankAccountId || !UUID_REGEX.test(targetBankAccountId)) {
        if (p.bankAccount && p.bankAccount.toLowerCase().includes('cash')) {
          targetBankAccountId = 'b0000000-0000-0000-0000-000000000001'; // Cash on Hand
        } else {
          targetBankAccountId = DEFAULT_BANK_ACCOUNT_ID; // Company Bank Account
        }
      }

      // Insert Canonical Transaction
      const { data: txn, error: txnError } = await adminSupabase
        .from('transactions')
        .insert({
          company_id: COMPANY_ID,
          reference_no: refNo,
          type: 'client_payment',
          amount: p.amount,
          currency: p.currency,
          transaction_date: p.paymentDate,
          description: `Client installment for project ${p.projectId} (${p.paymentType})`,
          status: 'posted',
          created_by: userId,
          posted_by: userId,
          posted_at: new Date().toISOString(),
          idempotency_key: p.idempotencyKey || null,
        })
        .select()
        .single();

      if (txnError) {
        console.error('Error inserting transaction:', txnError);
        return NextResponse.json({ error: txnError.message }, { status: 400 });
      }

      // Insert Client Payment sub-ledger detail
      const { data: cp, error: cpError } = await adminSupabase
        .from('client_payments')
        .insert({
          transaction_id: txn.id,
          project_id: targetProjectId,
          payment_type: p.paymentType,
          payment_method: p.paymentMethod,
          external_reference: p.externalReference || null,
          bank_account_id: targetBankAccountId,
          receipt_url: p.receiptUrl || null,
          notes: p.notes || null,
        })
        .select()
        .single();

      if (cpError) {
        console.error('Error inserting client payment:', cpError);
        return NextResponse.json({ error: cpError.message }, { status: 400 });
      }

      // Update Bank Account Balance
      try {
        const { data: acc } = await adminSupabase
          .from('financial_accounts')
          .select('current_balance')
          .eq('id', targetBankAccountId)
          .maybeSingle();

        if (acc) {
          await adminSupabase
            .from('financial_accounts')
            .update({ current_balance: Number(acc.current_balance || 0) + Number(p.amount) })
            .eq('id', targetBankAccountId);
        }
      } catch (balErr) {
        console.warn('Notice updating account balance:', balErr);
      }

      // Recalculate & Update Project Financials and Payment Status
      try {
        const { data: projRecord } = await adminSupabase
          .from('projects')
          .select('id, contract_value')
          .eq('id', targetProjectId)
          .maybeSingle();

        if (projRecord) {
          const contractVal = Number(projRecord.contract_value || 0);

          const { data: allProjPayments } = await adminSupabase
            .from('client_payments')
            .select(`
              id,
              transactions!inner (
                amount,
                status
              )
            `)
            .eq('project_id', targetProjectId);

          let totalPaid = 0;
          if (allProjPayments) {
            totalPaid = allProjPayments.reduce((sum: number, cur: any) => {
              if (cur.transactions?.status === 'posted') {
                return sum + Number(cur.transactions?.amount || 0);
              }
              return sum;
            }, 0);
          }

          const outstanding = Math.max(0, contractVal - totalPaid);
          const credit = Math.max(0, totalPaid - contractVal);
          const status = contractVal > 0 && totalPaid >= contractVal ? 'completed' : 'pending';

          await adminSupabase
            .from('projects')
            .update({
              valid_payments_total: totalPaid,
              outstanding_receivable: outstanding,
              client_credit: credit,
              payment_status: status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', targetProjectId);
        }
      } catch (projErr) {
        console.warn('Notice updating project financials:', projErr);
      }

      // Record audit log for client payment
      let actorName = 'Director';
      try {
        const { data: prof } = await adminSupabase.from('profiles').select('full_name').eq('id', userId || '').maybeSingle();
        if (prof?.full_name) actorName = prof.full_name;
      } catch {
        // ignore
      }

      await recordAuditLog({
        actorId: userId,
        actorName,
        actorRole: 'Director',
        action: 'RECORD_PAYMENT',
        entityType: 'client_payment',
        entityId: refNo,
        reason: `Client installment received for project ${p.projectId} (${p.paymentType}). Amount: LKR ${Number(p.amount).toLocaleString()}. Method: ${p.paymentMethod}.`,
        afterValues: {
          amount: Number(p.amount),
          paymentType: p.paymentType,
          paymentMethod: p.paymentMethod,
          paymentDate: p.paymentDate,
          status: 'posted',
        },
      });

      return NextResponse.json({ success: true, transaction: txn, clientPayment: cp }, { status: 201 });
    }

    // 3. Process Expense
    if (actionType === 'expense') {
      const validation = expenseSchema.safeParse(payload);
      if (!validation.success) {
        return NextResponse.json({ error: 'Validation failed', details: validation.error.format() }, { status: 422 });
      }

      const e = validation.data;
      const refNo = `EXP-${Date.now()}`;

      // Resolve Category UUID
      let targetCategoryId = e.categoryId;
      if (!targetCategoryId || !UUID_REGEX.test(targetCategoryId)) {
        if (e.category) {
          const { data: catRecord } = await adminSupabase
            .from('expense_categories')
            .select('id')
            .ilike('name', `%${e.category}%`)
            .limit(1)
            .maybeSingle();

          targetCategoryId = catRecord?.id || DEFAULT_CATEGORY_ID;
        } else {
          targetCategoryId = DEFAULT_CATEGORY_ID;
        }
      }

      // Resolve Bank Account UUID
      let targetBankAccountId = e.bankAccountId;
      if (!targetBankAccountId || !UUID_REGEX.test(targetBankAccountId)) {
        targetBankAccountId = DEFAULT_BANK_ACCOUNT_ID;
      }

      // Resolve Project UUID if provided
      let targetProjectId: string | null = null;
      if (e.projectId && UUID_REGEX.test(e.projectId)) {
        targetProjectId = e.projectId;
      } else if (e.projectId) {
        const { data: pRecord } = await adminSupabase
          .from('projects')
          .select('id')
          .eq('display_id', e.projectId)
          .limit(1)
          .maybeSingle();
        targetProjectId = pRecord?.id || null;
      }

      // Insert Canonical Transaction
      const { data: txn, error: txnError } = await adminSupabase
        .from('transactions')
        .insert({
          company_id: COMPANY_ID,
          reference_no: refNo,
          type: 'expense',
          amount: e.amount,
          currency: e.currency,
          transaction_date: e.expenseDate,
          description: e.description || `${e.vendor} - Operating Expense`,
          status: 'posted',
          created_by: userId,
          posted_by: userId,
          posted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (txnError) {
        console.error('Error inserting expense transaction:', txnError);
        return NextResponse.json({ error: txnError.message }, { status: 400 });
      }

      // Insert Expense detail
      const { data: exp, error: expError } = await adminSupabase
        .from('expenses')
        .insert({
          transaction_id: txn.id,
          project_id: targetProjectId,
          category_id: targetCategoryId,
          vendor: e.vendor,
          payment_method: e.paymentMethod,
          bank_account_id: targetBankAccountId,
          invoice_reference: e.invoiceReference || null,
          receipt_url: e.receiptUrl || null,
          is_paid: e.isPaid,
        })
        .select()
        .single();

      if (expError) {
        console.error('Error inserting expense details:', expError);
        return NextResponse.json({ error: expError.message }, { status: 400 });
      }

      // Update Bank Account Balance if paid
      if (e.isPaid) {
        try {
          const { data: acc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', targetBankAccountId)
            .maybeSingle();

          if (acc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(acc.current_balance || 0) - Number(e.amount) })
              .eq('id', targetBankAccountId);
          }
        } catch (balErr) {
          console.warn('Notice updating account balance:', balErr);
        }
      }

      // Record audit log for expense
      let expActorName = 'Director';
      try {
        const { data: prof } = await adminSupabase.from('profiles').select('full_name').eq('id', userId || '').maybeSingle();
        if (prof?.full_name) expActorName = prof.full_name;
      } catch {
        // ignore
      }

      await recordAuditLog({
        actorId: userId,
        actorName: expActorName,
        actorRole: 'Director',
        action: 'POST_EXPENSE',
        entityType: 'expense',
        entityId: refNo,
        reason: `Expense voucher posted to ${e.vendor}. Amount: LKR ${Number(e.amount).toLocaleString()}. Paid status: ${e.isPaid ? 'Settled' : 'Accrued'}.`,
        afterValues: {
          vendor: e.vendor,
          amount: Number(e.amount),
          paymentMethod: e.paymentMethod,
          isPaid: e.isPaid,
          status: 'posted',
        },
      });

      return NextResponse.json({ success: true, transaction: txn, expense: exp }, { status: 201 });
    }

    return NextResponse.json({ error: 'Unrecognized actionType' }, { status: 400 });
  } catch (err: any) {
    console.error('Unhandled transaction API error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      actionType,
      id,
      initiatorName = 'MR. Chanuka',
      initiatorRole = 'Director',
      modificationReason = 'Updated transaction record',
      ...payload
    } = body;

    if (!id || !actionType) {
      return NextResponse.json({ error: 'id and actionType are required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. UPDATE CLIENT PAYMENT
    if (actionType === 'client_payment') {
      const { data: oldCp, error: fetchErr } = await adminSupabase
        .from('client_payments')
        .select(`
          id,
          transaction_id,
          project_id,
          payment_type,
          payment_method,
          bank_account_id,
          receipt_url,
          external_reference,
          transactions (
            id,
            reference_no,
            amount,
            transaction_date,
            description,
            status
          ),
          projects (
            id,
            display_id,
            name,
            contract_value
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr || !oldCp) {
        return NextResponse.json({ error: 'Client payment not found' }, { status: 404 });
      }

      const oldAmount = Number((oldCp.transactions as any)?.amount || 0);
      const newAmount = payload.amount !== undefined ? Number(payload.amount) : oldAmount;
      const oldBankId = oldCp.bank_account_id || DEFAULT_BANK_ACCOUNT_ID;
      const newBankId = payload.bankAccountId || oldBankId;

      // Update Canonical Transaction
      await adminSupabase
        .from('transactions')
        .update({
          amount: newAmount,
          transaction_date: payload.paymentDate || (oldCp.transactions as any)?.transaction_date,
          description: payload.description || (oldCp.transactions as any)?.description,
        })
        .eq('id', oldCp.transaction_id);

      // Update Client Payment detail
      await adminSupabase
        .from('client_payments')
        .update({
          payment_type: payload.paymentType || oldCp.payment_type,
          payment_method: payload.paymentMethod || oldCp.payment_method,
          bank_account_id: newBankId,
          external_reference: payload.externalReference ?? oldCp.external_reference,
          receipt_url: payload.receiptUrl ?? oldCp.receipt_url,
          notes: payload.notes ?? null,
        })
        .eq('id', id);

      // Adjust Bank Account Balances
      try {
        if (oldBankId === newBankId) {
          const delta = newAmount - oldAmount;
          if (delta !== 0) {
            const { data: acc } = await adminSupabase
              .from('financial_accounts')
              .select('current_balance')
              .eq('id', newBankId)
              .maybeSingle();

            if (acc) {
              await adminSupabase
                .from('financial_accounts')
                .update({ current_balance: Number(acc.current_balance || 0) + delta })
                .eq('id', newBankId);
            }
          }
        } else {
          // Subtract oldAmount from oldBank, add newAmount to newBank
          const { data: oldAcc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', oldBankId)
            .maybeSingle();
          if (oldAcc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(oldAcc.current_balance || 0) - oldAmount })
              .eq('id', oldBankId);
          }

          const { data: newAcc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', newBankId)
            .maybeSingle();
          if (newAcc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(newAcc.current_balance || 0) + newAmount })
              .eq('id', newBankId);
          }
        }
      } catch (bankErr) {
        console.warn('Notice updating bank balance in PUT client_payment:', bankErr);
      }

      // Recalculate Project Financials
      const projId = oldCp.project_id;
      if (projId) {
        try {
          const { data: projRecord } = await adminSupabase
            .from('projects')
            .select('id, contract_value')
            .eq('id', projId)
            .maybeSingle();

          if (projRecord) {
            const contractVal = Number(projRecord.contract_value || 0);
            const { data: allProjPayments } = await adminSupabase
              .from('client_payments')
              .select(`
                id,
                transactions!inner (
                  amount,
                  status
                )
              `)
              .eq('project_id', projId);

            let totalPaid = 0;
            if (allProjPayments) {
              totalPaid = allProjPayments.reduce((sum: number, cur: any) => {
                if (cur.transactions?.status === 'posted') {
                  return sum + Number(cur.transactions?.amount || 0);
                }
                return sum;
              }, 0);
            }

            const outstanding = Math.max(0, contractVal - totalPaid);
            const credit = Math.max(0, totalPaid - contractVal);
            const status = contractVal > 0 && totalPaid >= contractVal ? 'completed' : 'pending';

            await adminSupabase
              .from('projects')
              .update({
                valid_payments_total: totalPaid,
                outstanding_receivable: outstanding,
                client_credit: credit,
                payment_status: status,
                updated_at: new Date().toISOString(),
              })
              .eq('id', projId);
          }
        } catch (projErr) {
          console.warn('Notice recalculating project financials:', projErr);
        }
      }

      // Post Notification to Modification Approvals Queue
      const refNo = (oldCp.transactions as any)?.reference_no || 'TXN';
      const projName = (oldCp.projects as any)?.name || 'Project';
      const changesSummary = `Client payment ${refNo} (${projName}) modified by ${initiatorName}. Amount: LKR ${oldAmount.toLocaleString()} → LKR ${newAmount.toLocaleString()}.`;

      try {
        await fetch(`${req.nextUrl.origin}/api/approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'client_payment',
            entityId: id,
            entityReference: refNo,
            entityName: `Payment for ${projName}`,
            actionType: 'update',
            initiatorName,
            initiatorRole,
            details: {
              changesSummary,
              reason: modificationReason,
              before: { amount: oldAmount, type: oldCp.payment_type },
              after: { amount: newAmount, type: payload.paymentType || oldCp.payment_type },
            },
          }),
        }).catch((e) => console.warn('Notice sending approval notification:', e));
      } catch (e) {
        // ignore
      }

      await recordAuditLog({
        actorName: initiatorName,
        actorRole: initiatorRole,
        action: 'UPDATE_CLIENT_PAYMENT',
        entityType: 'client_payment',
        entityId: refNo,
        reason: modificationReason || changesSummary,
        beforeValues: {
          amount: oldAmount,
          paymentType: oldCp.payment_type,
        },
        afterValues: {
          amount: newAmount,
          paymentType: payload.paymentType || oldCp.payment_type,
        },
      });

      return NextResponse.json({ success: true, message: 'Client payment updated successfully' });
    }

    // 2. UPDATE EXPENSE
    if (actionType === 'expense') {
      const { data: oldExp, error: fetchErr } = await adminSupabase
        .from('expenses')
        .select(`
          id,
          transaction_id,
          project_id,
          vendor,
          category_id,
          payment_method,
          bank_account_id,
          invoice_reference,
          receipt_url,
          is_paid,
          transactions (
            id,
            reference_no,
            amount,
            transaction_date,
            description,
            status
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr || !oldExp) {
        return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
      }

      const oldAmount = Number((oldExp.transactions as any)?.amount || 0);
      const newAmount = payload.amount !== undefined ? Number(payload.amount) : oldAmount;
      const oldIsPaid = Boolean(oldExp.is_paid);
      const newIsPaid = payload.isPaid !== undefined ? Boolean(payload.isPaid) : oldIsPaid;
      const oldBankId = oldExp.bank_account_id || DEFAULT_BANK_ACCOUNT_ID;
      const newBankId = payload.bankAccountId || oldBankId;

      // Update Canonical Transaction
      await adminSupabase
        .from('transactions')
        .update({
          amount: newAmount,
          transaction_date: payload.expenseDate || (oldExp.transactions as any)?.transaction_date,
          description: payload.description || (oldExp.transactions as any)?.description,
        })
        .eq('id', oldExp.transaction_id);

      // Update Expense detail
      await adminSupabase
        .from('expenses')
        .update({
          vendor: payload.vendor || oldExp.vendor,
          payment_method: payload.paymentMethod || oldExp.payment_method,
          bank_account_id: newBankId,
          invoice_reference: payload.invoiceReference ?? oldExp.invoice_reference,
          receipt_url: payload.receiptUrl ?? oldExp.receipt_url,
          is_paid: newIsPaid,
        })
        .eq('id', id);

      // Adjust Bank Account Balances
      try {
        // If old was paid, reverse old deduction (+oldAmount)
        if (oldIsPaid) {
          const { data: acc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', oldBankId)
            .maybeSingle();
          if (acc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(acc.current_balance || 0) + oldAmount })
              .eq('id', oldBankId);
          }
        }
        // If new is paid, deduct new amount (-newAmount)
        if (newIsPaid) {
          const { data: acc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', newBankId)
            .maybeSingle();
          if (acc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(acc.current_balance || 0) - newAmount })
              .eq('id', newBankId);
          }
        }
      } catch (bankErr) {
        console.warn('Notice updating bank balance in PUT expense:', bankErr);
      }

      // Post Notification to Modification Approvals Queue
      const refNo = (oldExp.transactions as any)?.reference_no || 'EXP';
      const vendorName = payload.vendor || oldExp.vendor;
      const changesSummary = `Expense to ${vendorName} (${refNo}) updated by ${initiatorName}. Amount: LKR ${oldAmount.toLocaleString()} → LKR ${newAmount.toLocaleString()}.`;

      try {
        await fetch(`${req.nextUrl.origin}/api/approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'expense',
            entityId: id,
            entityReference: refNo,
            entityName: `${vendorName} - Operating Expense`,
            actionType: 'update',
            initiatorName,
            initiatorRole,
            details: {
              changesSummary,
              reason: modificationReason,
              before: { amount: oldAmount, vendor: oldExp.vendor, is_paid: oldIsPaid },
              after: { amount: newAmount, vendor: vendorName, is_paid: newIsPaid },
            },
          }),
        }).catch((e) => console.warn('Notice sending approval notification:', e));
      } catch (e) {
        // ignore
      }

      await recordAuditLog({
        actorName: initiatorName,
        actorRole: initiatorRole,
        action: 'UPDATE_EXPENSE',
        entityType: 'expense',
        entityId: refNo,
        reason: modificationReason || changesSummary,
        beforeValues: {
          vendor: oldExp.vendor,
          amount: oldAmount,
          isPaid: oldIsPaid,
        },
        afterValues: {
          vendor: vendorName,
          amount: newAmount,
          isPaid: newIsPaid,
        },
      });

      return NextResponse.json({ success: true, message: 'Expense updated successfully' });
    }

    return NextResponse.json({ error: 'Unrecognized actionType' }, { status: 400 });
  } catch (err: any) {
    console.error('Unhandled PUT error in transactions API:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let actionType = searchParams.get('actionType');
    let id = searchParams.get('id');
    let initiatorName = searchParams.get('initiatorName') || 'MR. Chanuka';
    let initiatorRole = searchParams.get('initiatorRole') || 'Director';
    let reason = searchParams.get('reason') || 'Transaction deleted by director';

    if (!id || !actionType) {
      try {
        const body = await req.json();
        if (body.actionType) actionType = body.actionType;
        if (body.id) id = body.id;
        if (body.initiatorName) initiatorName = body.initiatorName;
        if (body.initiatorRole) initiatorRole = body.initiatorRole;
        if (body.reason) reason = body.reason;
      } catch {
        // no body
      }
    }

    if (!id || !actionType) {
      return NextResponse.json({ error: 'id and actionType are required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. DELETE CLIENT PAYMENT
    if (actionType === 'client_payment') {
      const { data: cp, error: fetchErr } = await adminSupabase
        .from('client_payments')
        .select(`
          id,
          transaction_id,
          project_id,
          bank_account_id,
          transactions (
            id,
            reference_no,
            amount,
            status
          ),
          projects (
            id,
            display_id,
            name
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr || !cp) {
        return NextResponse.json({ error: 'Client payment not found' }, { status: 404 });
      }

      const amount = Number((cp.transactions as any)?.amount || 0);
      const bankId = cp.bank_account_id || DEFAULT_BANK_ACCOUNT_ID;
      const refNo = (cp.transactions as any)?.reference_no || 'TXN';
      const projId = cp.project_id;
      const projName = (cp.projects as any)?.name || 'Project';

      // Reverse bank balance immediately (subtracting the deleted client payment)
      if ((cp.transactions as any)?.status === 'posted') {
        try {
          const { data: acc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', bankId)
            .maybeSingle();

          if (acc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(acc.current_balance || 0) - amount })
              .eq('id', bankId);
          }
        } catch (bankErr) {
          console.warn('Notice reversing bank balance in DELETE client_payment:', bankErr);
        }
      }

      // Soft Delete: Mark transaction as reversed and pending approval so ledger recalculates immediately
      if (cp.transaction_id) {
        const currentDesc = (cp.transactions as any)?.description || '';
        await adminSupabase
          .from('transactions')
          .update({
            status: 'reversed',
            description: `${currentDesc} [SOFT_DELETED_PENDING_APPROVAL]`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', cp.transaction_id);
      }

      // Recalculate Project Financials
      if (projId) {
        try {
          const { data: projRecord } = await adminSupabase
            .from('projects')
            .select('id, contract_value')
            .eq('id', projId)
            .maybeSingle();

          if (projRecord) {
            const contractVal = Number(projRecord.contract_value || 0);
            const { data: remainingPayments } = await adminSupabase
              .from('client_payments')
              .select('transactions!inner(amount, status)')
              .eq('project_id', projId);

            let totalPaid = 0;
            if (remainingPayments) {
              totalPaid = remainingPayments.reduce((sum: number, cur: any) => {
                if (cur.transactions?.status === 'posted') {
                  return sum + Number(cur.transactions?.amount || 0);
                }
                return sum;
              }, 0);
            }

            const outstanding = Math.max(0, contractVal - totalPaid);
            const credit = Math.max(0, totalPaid - contractVal);
            const status = contractVal > 0 && totalPaid >= contractVal ? 'completed' : 'pending';

            await adminSupabase
              .from('projects')
              .update({
                valid_payments_total: totalPaid,
                outstanding_receivable: outstanding,
                client_credit: credit,
                payment_status: status,
                updated_at: new Date().toISOString(),
              })
              .eq('id', projId);
          }
        } catch (projErr) {
          console.warn('Notice recalculating project financials after delete:', projErr);
        }
      }

      // Post Notification to Modification Approvals Queue
      const changesSummary = `Client payment ${refNo} (LKR ${amount.toLocaleString()}) for "${projName}" deleted by ${initiatorName}. Bank and project receivables updated.`;

      try {
        await fetch(`${req.nextUrl.origin}/api/approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'client_payment',
            entityId: id,
            entityReference: refNo,
            entityName: `Payment for ${projName}`,
            actionType: 'delete',
            initiatorName,
            initiatorRole,
            details: {
              changesSummary,
              reason,
              before: {
                amount,
                reference_no: refNo,
                project: projName,
              },
            },
          }),
        }).catch((e) => console.warn('Notice sending approval notification:', e));
      } catch (e) {
        // ignore
      }

      await recordAuditLog({
        actorName: initiatorName,
        actorRole: initiatorRole,
        action: 'DELETE_CLIENT_PAYMENT',
        entityType: 'client_payment',
        entityId: refNo,
        reason: reason || changesSummary,
        beforeValues: {
          referenceNo: refNo,
          amount,
          project: projName,
          status: 'posted',
        },
        afterValues: {
          status: 'reversed',
          softDeleted: true,
        },
      });

      return NextResponse.json({ success: true, message: 'Client payment deleted successfully' });
    }

    // 2. DELETE EXPENSE
    if (actionType === 'expense') {
      const { data: exp, error: fetchErr } = await adminSupabase
        .from('expenses')
        .select(`
          id,
          transaction_id,
          vendor,
          bank_account_id,
          is_paid,
          transactions (
            id,
            reference_no,
            amount,
            status
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr || !exp) {
        return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
      }

      const amount = Number((exp.transactions as any)?.amount || 0);
      const bankId = exp.bank_account_id || DEFAULT_BANK_ACCOUNT_ID;
      const refNo = (exp.transactions as any)?.reference_no || 'EXP';
      const vendor = exp.vendor;

      // If expense was paid, reverse deduction by adding amount back to bank balance
      if (exp.is_paid) {
        try {
          const { data: acc } = await adminSupabase
            .from('financial_accounts')
            .select('current_balance')
            .eq('id', bankId)
            .maybeSingle();

          if (acc) {
            await adminSupabase
              .from('financial_accounts')
              .update({ current_balance: Number(acc.current_balance || 0) + amount })
              .eq('id', bankId);
          }
        } catch (bankErr) {
          console.warn('Notice reversing bank balance in DELETE expense:', bankErr);
        }
      }

      // Soft Delete: Mark transaction as reversed and pending approval so ledger recalculates immediately
      if (exp.transaction_id) {
        const currentDesc = (exp.transactions as any)?.description || '';
        await adminSupabase
          .from('transactions')
          .update({
            status: 'reversed',
            description: `${currentDesc} [SOFT_DELETED_PENDING_APPROVAL]`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', exp.transaction_id);
      }

      // Post Notification to Modification Approvals Queue
      const changesSummary = `Expense to ${vendor} (${refNo}, LKR ${amount.toLocaleString()}) deleted by ${initiatorName}. Bank account balance restored.`;

      try {
        await fetch(`${req.nextUrl.origin}/api/approvals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entityType: 'expense',
            entityId: id,
            entityReference: refNo,
            entityName: `${vendor} Expense`,
            actionType: 'delete',
            initiatorName,
            initiatorRole,
            details: {
              changesSummary,
              reason,
              before: {
                amount,
                vendor,
                reference_no: refNo,
                is_paid: exp.is_paid,
              },
            },
          }),
        }).catch((e) => console.warn('Notice sending approval notification:', e));
      } catch (e) {
        // ignore
      }

      await recordAuditLog({
        actorName: initiatorName,
        actorRole: initiatorRole,
        action: 'DELETE_EXPENSE',
        entityType: 'expense',
        entityId: refNo,
        reason: reason || changesSummary,
        beforeValues: {
          referenceNo: refNo,
          vendor,
          amount,
          isPaid: exp.is_paid,
          status: 'posted',
        },
        afterValues: {
          status: 'reversed',
          softDeleted: true,
        },
      });

      return NextResponse.json({ success: true, message: 'Expense deleted successfully' });
    }

    return NextResponse.json({ error: 'Unrecognized actionType' }, { status: 400 });
  } catch (err: any) {
    console.error('Unhandled DELETE error in transactions API:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

