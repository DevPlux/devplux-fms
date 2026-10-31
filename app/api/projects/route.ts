import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { projectSchema } from '@/lib/validation/project-schema';
import { recordAuditLog } from '@/lib/audit/audit-logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    const adminSupabase = createAdminClient();

    // 1. Fetch all client payments to compute real-time verified ledger totals
    const { data: allPayments } = await adminSupabase
      .from('client_payments')
      .select(`
        project_id,
        transactions (
          amount,
          status,
          description
        )
      `);

    const paymentsByProject: Record<string, number> = {};
    if (allPayments) {
      allPayments.forEach((cp: any) => {
        const txnStatus = cp.transactions?.status;
        const txnDesc = String(cp.transactions?.description || '');
        const isSoftDeletedTxn = txnStatus === 'reversed' || txnDesc.includes('[SOFT_DELETED_PENDING_APPROVAL]');

        if (!isSoftDeletedTxn && txnStatus === 'posted' && cp.project_id) {
          paymentsByProject[cp.project_id] =
            (paymentsByProject[cp.project_id] || 0) + Number(cp.transactions?.amount || 0);
        }
      });
    }

    const enrichProject = (proj: any) => {
      const contractVal = Number(proj.contract_value || 0);
      const paidTotal =
        paymentsByProject[proj.id] !== undefined
          ? paymentsByProject[proj.id]
          : Number(proj.valid_payments_total || 0);
      const outstanding = Math.max(0, contractVal - paidTotal);
      const credit = Math.max(0, paidTotal - contractVal);
      const status = contractVal > 0 && paidTotal >= contractVal ? 'completed' : 'pending';

      return {
        ...proj,
        contract_value: contractVal,
        valid_payments_total: paidTotal,
        outstanding_receivable: outstanding,
        client_credit: credit,
        payment_status: status,
      };
    };

    const isSoftDeleted = (p: any) => {
      return (
        p.status === 'deleted' ||
        p.is_deleted === true ||
        (p.notes && String(p.notes).includes('[SOFT_DELETED_PENDING_APPROVAL]'))
      );
    };

    if (id) {
      const { data, error } = await adminSupabase
        .from('projects')
        .select('*')
        .or(`id.eq.${id},display_id.eq.${id}`)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (data && isSoftDeleted(data)) {
        return NextResponse.json({ data: null });
      }
      return NextResponse.json({ data: data ? enrichProject(data) : null });
    }

    const { data, error } = await adminSupabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const activeProjects = (data || []).filter((p: any) => !isSoftDeleted(p));
    const enriched = activeProjects.map(enrichProject);
    return NextResponse.json({ data: enriched });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = projectSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 422 }
      );
    }

    let userId: string | null = null;
    try {
      const supabase = createServerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // fallback
    }

    const adminSupabase = createAdminClient();
    const displayId = `DPL-2026-${Date.now().toString().slice(-4)}`;

    let schedule = validation.data.paymentSchedule;
    if (typeof schedule === 'string') {
      schedule = [
        {
          title: 'Full Contract Milestone',
          expectedDate: validation.data.startDate,
          amount: validation.data.contractValue,
        },
      ];
    }

    const basePayload: any = {
      company_id: 'a0000000-0000-0000-0000-000000000001',
      name: validation.data.name,
      client_name: validation.data.clientName,
      client_email: validation.data.clientEmail || null,
      client_phone: validation.data.clientPhone || null,
      contract_value: validation.data.contractValue,
      currency: validation.data.currency || 'LKR',
      start_date: validation.data.startDate,
      payment_schedule: schedule,
      notes: validation.data.notes || null,
      created_by: userId,
    };

    // First attempt: insert with display_id
    let { data, error } = await adminSupabase
      .from('projects')
      .insert({
        ...basePayload,
        display_id: displayId,
      })
      .select()
      .single();

    // Fallback: if display_id column does not exist or trigger creates it
    if (error && error.message.includes('display_id')) {
      const retry = await adminSupabase
        .from('projects')
        .insert(basePayload)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Error inserting project into database:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Write audit log entry for project creation
    let creatorName = 'Director';
    try {
      const { data: creatorProf } = await adminSupabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId || '')
        .maybeSingle();
      if (creatorProf?.full_name) creatorName = creatorProf.full_name;
    } catch {
      // ignore
    }

    await recordAuditLog({
      actorId: userId,
      actorName: creatorName,
      actorRole: 'Director',
      action: 'CREATE_PROJECT',
      entityType: 'project',
      entityId: data.display_id || data.id,
      reason: `Project "${data.name}" initialized with contract value of LKR ${Number(data.contract_value).toLocaleString()}. Client: ${data.client_name}.`,
      afterValues: {
        name: data.name,
        clientName: data.client_name,
        contractValue: Number(data.contract_value),
        currency: data.currency,
        startDate: data.start_date,
      },
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    console.error('Fatal error creating project:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      name,
      clientName,
      clientEmail,
      clientPhone,
      contractValue,
      currency,
      startDate,
      notes,
      initiatorName = 'Director',
      initiatorRole = 'Director',
      modificationReason = 'Updated project details',
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. Fetch current project state
    const { data: oldProject, error: fetchErr } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !oldProject) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 2. Perform live update in DB immediately
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updatePayload.name = name;
    if (clientName !== undefined) updatePayload.client_name = clientName;
    if (clientEmail !== undefined) updatePayload.client_email = clientEmail;
    if (clientPhone !== undefined) updatePayload.client_phone = clientPhone;
    if (contractValue !== undefined) updatePayload.contract_value = contractValue;
    if (currency !== undefined) updatePayload.currency = currency;
    if (startDate !== undefined) updatePayload.start_date = startDate;
    if (notes !== undefined) updatePayload.notes = notes;

    const { data: updatedProject, error: updateErr } = await adminSupabase
      .from('projects')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    // 3. Post notification to approvals for peer directors to review
    const changesSummary = `Project "${updatedProject.name}" (${updatedProject.display_id || id}) updated by ${initiatorName}. Contract Value: LKR ${Number(oldProject.contract_value).toLocaleString()} -> LKR ${Number(updatedProject.contract_value).toLocaleString()}.`;

    try {
      const approvalPayload = {
        entityType: 'project',
        entityId: id,
        entityReference: updatedProject.display_id || id,
        entityName: updatedProject.name,
        actionType: 'update',
        initiatorName,
        initiatorRole,
        details: {
          changesSummary,
          reason: modificationReason,
          before: oldProject,
          after: updatedProject,
        },
      };

      await fetch(`${req.nextUrl.origin}/api/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvalPayload),
      }).catch((e) => console.warn('Notice sending approval notification:', e));
    } catch (notifErr) {
      console.warn('Notice creating approval log:', notifErr);
    }

    // Direct audit log write
    await recordAuditLog({
      actorName: initiatorName,
      actorRole: initiatorRole,
      action: 'UPDATE_PROJECT',
      entityType: 'project',
      entityId: updatedProject.display_id || id,
      reason: modificationReason || changesSummary,
      beforeValues: {
        name: oldProject.name,
        clientName: oldProject.client_name,
        contractValue: Number(oldProject.contract_value),
      },
      afterValues: {
        name: updatedProject.name,
        clientName: updatedProject.client_name,
        contractValue: Number(updatedProject.contract_value),
      },
    });

    return NextResponse.json({ success: true, data: updatedProject });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');
    let initiatorName = searchParams.get('initiatorName') || 'Director';
    let initiatorRole = searchParams.get('initiatorRole') || 'Director';
    let reason = searchParams.get('reason') || 'Project deleted by director';

    if (!id) {
      try {
        const body = await req.json();
        id = body.id;
        if (body.initiatorName) initiatorName = body.initiatorName;
        if (body.initiatorRole) initiatorRole = body.initiatorRole;
        if (body.reason) reason = body.reason;
      } catch {
        // no body
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // 1. Fetch current project state
    const { data: project, error: fetchErr } = await adminSupabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 2. SOFT DELETE: Mark project as soft-deleted in DB immediately so calculations update instantly
    const softDeleteMarker = '[SOFT_DELETED_PENDING_APPROVAL]';
    const updatedNotes = (project.notes ? project.notes + ' ' : '') + softDeleteMarker;

    const { error: softDeleteErr } = await adminSupabase
      .from('projects')
      .update({
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (softDeleteErr) {
      return NextResponse.json({ error: softDeleteErr.message }, { status: 400 });
    }

    // 3. Post notification to approvals for peer directors to review & execute hard delete
    const changesSummary = `Project "${project.name}" (${project.display_id || id}) soft-deleted by ${initiatorName}. Contract value was LKR ${Number(project.contract_value).toLocaleString()}. Calculations updated immediately. Pending board director sign-off for permanent hard delete.`;

    try {
      const approvalPayload = {
        entityType: 'project',
        entityId: id,
        entityReference: project.display_id || id,
        entityName: project.name,
        actionType: 'delete',
        initiatorName,
        initiatorRole,
        details: {
          changesSummary,
          reason,
          before: project,
        },
      };

      await fetch(`${req.nextUrl.origin}/api/approvals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvalPayload),
      }).catch((e) => console.warn('Notice sending approval notification:', e));
    } catch (notifErr) {
      console.warn('Notice creating approval log:', notifErr);
    }

    // Direct audit log write
    await recordAuditLog({
      actorName: initiatorName,
      actorRole: initiatorRole,
      action: 'DELETE_PROJECT',
      entityType: 'project',
      entityId: project.display_id || id,
      reason: reason || changesSummary,
      beforeValues: {
        name: project.name,
        clientName: project.client_name,
        contractValue: Number(project.contract_value),
        status: 'active',
      },
      afterValues: {
        status: 'reversed',
        softDeleted: true,
      },
    });

    return NextResponse.json({ success: true, message: 'Project soft-deleted successfully' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
