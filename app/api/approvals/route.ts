import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';

// In-memory fallback cache to ensure reliability even if database migrations are pending
let fallbackApprovalsCache: any[] = [];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const adminSupabase = createAdminClient();

    // 1. Try querying modification_approvals table
    const { data, error } = await adminSupabase
      .from('modification_approvals')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      let filtered = data;
      if (status && status !== 'all') {
        filtered = data.filter((item: any) => item.status === status);
      }
      return NextResponse.json({ success: true, data: filtered, count: filtered.length });
    }

    // 2. If table is not present yet or errored, use fallback cache
    let filteredFallback = fallbackApprovalsCache;
    if (status && status !== 'all') {
      filteredFallback = fallbackApprovalsCache.filter((item: any) => item.status === status);
    }

    return NextResponse.json({
      success: true,
      data: filteredFallback,
      count: filteredFallback.length,
      isFallback: true,
    });
  } catch (err: any) {
    console.warn('Notice in approvals GET:', err);
    return NextResponse.json({ success: true, data: fallbackApprovalsCache, count: fallbackApprovalsCache.length });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      entityType,
      entityId,
      entityReference,
      entityName,
      actionType,
      initiatorId,
      initiatorName,
      initiatorRole,
      details,
    } = body;

    const adminSupabase = createAdminClient();

    let actorId = initiatorId;
    if (!actorId) {
      try {
        const serverClient = createServerSupabaseClient();
        const {
          data: { user },
        } = await serverClient.auth.getUser();
        if (user) actorId = user.id;
      } catch {
        // fallback
      }
    }

    const finalInitiatorName = initiatorName || 'Director';
    const finalInitiatorRole = initiatorRole || 'Director';

    const newApproval = {
      id: `mod-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      company_id: COMPANY_ID,
      entity_type: entityType,
      entity_id: String(entityId),
      entity_reference: entityReference || 'REF',
      entity_name: entityName || 'Financial Entity',
      action_type: actionType, // 'update' | 'delete'
      initiator_id: actorId || null,
      initiator_name: finalInitiatorName,
      initiator_role: finalInitiatorRole,
      details: details || {},
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Try inserting into database table
    try {
      const { data, error } = await adminSupabase
        .from('modification_approvals')
        .insert({
          company_id: COMPANY_ID,
          entity_type: entityType,
          entity_id: String(entityId),
          entity_reference: entityReference || 'REF',
          entity_name: entityName || 'Financial Entity',
          action_type: actionType,
          initiator_id: actorId || null,
          initiator_name: finalInitiatorName,
          initiator_role: finalInitiatorRole,
          details: details || {},
          status: 'pending',
        })
        .select()
        .single();

      if (!error && data) {
        newApproval.id = data.id;
      }
    } catch (dbErr) {
      console.warn('Notice inserting modification approval to DB table:', dbErr);
    }

    // Keep in fallback cache
    fallbackApprovalsCache = [newApproval, ...fallbackApprovalsCache.filter((a) => a.id !== newApproval.id)];

    // Write immutable record into audit_logs
    try {
      const auditPayload: any = {
        company_id: COMPANY_ID,
        actor_id: actorId || 'a68e15d7-578e-4f20-a5a9-f44d97b1e9c3',
        actor_name: finalInitiatorName,
        actor_role: finalInitiatorRole,
        action: `${actionType.toUpperCase()}_${entityType.toUpperCase()}`,
        entity_type: entityType,
        entity_id: entityReference || String(entityId),
        reason: details?.changesSummary || `Director initiated ${actionType} on ${entityType}`,
        before_values: details?.before || null,
        after_values: details?.after || null,
        timestamp: new Date().toISOString(),
      };

      let { error: aErr } = await adminSupabase.from('audit_logs').insert(auditPayload);
      if (aErr && (aErr.message.includes('actor_name') || aErr.message.includes('actor_role'))) {
        delete auditPayload.actor_name;
        delete auditPayload.actor_role;
        await adminSupabase.from('audit_logs').insert(auditPayload);
      }
    } catch (auditErr) {
      console.warn('Notice writing to audit_logs:', auditErr);
    }

    return NextResponse.json({ success: true, data: newApproval }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating approval notice:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, reviewerName, reviewerId, reviewNotes } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status are required' }, { status: 400 });
    }

    const adminSupabase = createAdminClient();
    const reviewedAt = new Date().toISOString();
    const finalReviewerName = reviewerName || 'Director';
    const finalNotes = reviewNotes || 'Acknowledged and confirmed by board director';

    // 1. Locate the approval record to determine action type
    let targetApproval: any = fallbackApprovalsCache.find((a) => a.id === id);
    if (!targetApproval) {
      try {
        const { data: dbItem } = await adminSupabase
          .from('modification_approvals')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (dbItem) targetApproval = dbItem;
      } catch {
        // ignore
      }
    }

    // 2. If approved and action_type was 'delete': EXECUTE PERMANENT HARD DELETE
    if (status === 'approved' && targetApproval?.action_type === 'delete') {
      const entityType = targetApproval.entity_type;
      const entityId = targetApproval.entity_id;

      try {
        if (entityType === 'project') {
          // Permanently hard delete project from DB
          await adminSupabase.from('projects').delete().eq('id', entityId);
        } else if (entityType === 'client_payment') {
          // Permanently hard delete client payment & transaction
          await adminSupabase.from('client_payments').delete().eq('id', entityId);
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').delete().eq('id', txnId);
          }
        } else if (entityType === 'expense') {
          // Permanently hard delete expense & transaction
          await adminSupabase.from('expenses').delete().eq('id', entityId);
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').delete().eq('id', txnId);
          }
        }
      } catch (delErr) {
        console.warn('Notice executing hard delete on approved modification:', delErr);
      }
    }

    // 3. If rejected and action_type was 'delete': RESTORE SOFT-DELETED ENTITY
    if (status === 'rejected' && targetApproval?.action_type === 'delete') {
      const entityType = targetApproval.entity_type;
      const entityId = targetApproval.entity_id;

      try {
        if (entityType === 'project') {
          // Un-soft-delete project
          const { data: p } = await adminSupabase.from('projects').select('notes').eq('id', entityId).maybeSingle();
          if (p?.notes) {
            const restoredNotes = p.notes.replace('[SOFT_DELETED_PENDING_APPROVAL]', '').trim();
            await adminSupabase.from('projects').update({ notes: restoredNotes }).eq('id', entityId);
          }
        } else if (entityType === 'client_payment' || entityType === 'expense') {
          // Restore transaction status to posted
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').update({ status: 'posted' }).eq('id', txnId);
          }
        }
      } catch (restoreErr) {
        console.warn('Notice restoring soft-deleted record upon rejection:', restoreErr);
      }
    }

    // 4. Update approval record in DB
    try {
      await adminSupabase
        .from('modification_approvals')
        .update({
          status,
          reviewed_by: reviewerId || null,
          reviewer_name: finalReviewerName,
          reviewed_at: reviewedAt,
          review_notes: finalNotes,
          updated_at: reviewedAt,
        })
        .eq('id', id);
    } catch (dbErr) {
      console.warn('Notice updating DB modification approval:', dbErr);
    }

    // 5. Update fallback cache
    fallbackApprovalsCache = fallbackApprovalsCache.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          status,
          reviewer_name: finalReviewerName,
          reviewed_at: reviewedAt,
          review_notes: finalNotes,
          updated_at: reviewedAt,
        };
      }
      return item;
    });

    // 6. Append review sign-off to immutable audit_logs
    try {
      await adminSupabase.from('audit_logs').insert({
        company_id: COMPANY_ID,
        actor_id: reviewerId || 'b11e15d7-578e-4f20-a5a9-f44d97b1e9d4',
        actor_name: finalReviewerName,
        actor_role: 'Director Sign-off',
        action: `DIRECTOR_${status.toUpperCase()}_MODIFICATION`,
        entity_type: 'modification_approval',
        entity_id: String(id),
        reason: `${finalReviewerName} ${status === 'approved' ? 'approved & confirmed' : 'flagged'} modification: ${finalNotes}`,
        timestamp: reviewedAt,
      });
    } catch (auditErr) {
      console.warn('Notice logging review to audit_logs:', auditErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status,
        reviewer_name: finalReviewerName,
        reviewed_at: reviewedAt,
        review_notes: finalNotes,
      },
    });
  } catch (err: any) {
    console.error('Error updating approval status:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
