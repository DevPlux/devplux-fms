import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import fs from 'fs';
import path from 'path';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';

// Persistent global caches across Next.js reloads and development server HMR
if (!(globalThis as any).__devplux_approvals_cache__) {
  (globalThis as any).__devplux_approvals_cache__ = [];
}
if (!(globalThis as any).__devplux_reviewed_approvals__) {
  (globalThis as any).__devplux_reviewed_approvals__ = new Map<string, any>();
}

const getApprovalsCache = (): any[] => (globalThis as any).__devplux_approvals_cache__;
const setApprovalsCache = (items: any[]) => {
  (globalThis as any).__devplux_approvals_cache__ = items;
};
const getReviewedMap = (): Map<string, any> => (globalThis as any).__devplux_reviewed_approvals__;

const DATA_DIR = path.join(process.cwd(), 'data');
const APPROVALS_DATA_FILE = path.join(DATA_DIR, 'approvals.json');

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const adminSupabase = createAdminClient();
    const reviewedMap = getReviewedMap();
    const cache = getApprovalsCache();
    const localApprovals = readLocalApprovals();

    // 1. Fetch from modification_approvals table if present in DB
    let dbApprovals: any[] = [];
    try {
      const { data, error } = await adminSupabase
        .from('modification_approvals')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && Array.isArray(data)) {
        dbApprovals = data.map((item: any) => {
          if (item.details?.actual_entity_type) {
            return {
              ...item,
              entity_type: item.details.actual_entity_type,
              action_type: item.details.actual_action_type || item.action_type,
            };
          }
          return item;
        });
      }
    } catch {
      // ignore
    }

    // 2. Fetch authoritative expenses from Supabase
    let dbExpenses: any[] = [];
    try {
      const { data: exps } = await adminSupabase
        .from('expenses')
        .select(`
          id,
          vendor,
          category_id,
          is_paid,
          created_at,
          transactions (
            id,
            reference_no,
            amount,
            status,
            description,
            transaction_date,
            created_by
          ),
          expense_categories (name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      if (exps) dbExpenses = exps;
    } catch (e) {
      console.warn('Notice querying expenses in approvals:', e);
    }

    // Fetch profile names for directors
    const profileMap = new Map<string, string>();
    try {
      const { data: profiles } = await adminSupabase.from('profiles').select('id, full_name');
      if (profiles) {
        profiles.forEach((p: any) => profileMap.set(p.id, p.full_name));
      }
    } catch {
      // ignore
    }

    // Track existing entity and record IDs
    const registeredEntityIds = new Set<string>();
    dbApprovals.forEach((a: any) => {
      if (a.entity_id) registeredEntityIds.add(String(a.entity_id));
      if (a.entity_reference) registeredEntityIds.add(String(a.entity_reference));
      if (a.id) registeredEntityIds.add(String(a.id));
    });
    cache.forEach((a: any) => {
      if (a.entity_id) registeredEntityIds.add(String(a.entity_id));
      if (a.entity_reference) registeredEntityIds.add(String(a.entity_reference));
      if (a.id) registeredEntityIds.add(String(a.id));
    });
    localApprovals.forEach((a: any) => {
      if (a.entity_id) registeredEntityIds.add(String(a.entity_id));
      if (a.entity_reference) registeredEntityIds.add(String(a.entity_reference));
      if (a.id) registeredEntityIds.add(String(a.id));
    });

    // 3. Synthesize approvals for any DB expenses not yet in the approvals register
    const synthesizedExpenses: any[] = [];
    dbExpenses.forEach((exp: any) => {
      const txn = (exp.transactions as any) || {};
      const refNo = txn.reference_no || `EXP-${String(exp.id).slice(0, 8)}`;
      if (registeredEntityIds.has(String(exp.id)) || registeredEntityIds.has(refNo)) {
        return;
      }

      const isSoftDeleted =
        txn.status === 'reversed' || String(txn.description || '').includes('[SOFT_DELETED_PENDING_APPROVAL]');
      const catMatch = String(txn.description || '').match(/\[Category:\s*([^\]]+)\]/);
      const category = catMatch?.[1]?.trim() || exp.expense_categories?.name || 'Operating Expense';
      const actorName = profileMap.get(txn.created_by) || 'Mr. Chanuka Lakshan';
      const amount = Number(txn.amount || 0);

      const reviewRecord = reviewedMap.get(exp.id) || reviewedMap.get(refNo) || reviewedMap.get(`appr-${exp.id}`);
      const initialApprovers = reviewRecord?.approvers || [actorName];
      const approvalsCount = reviewRecord?.approvals_count || initialApprovers.length;
      const isQuorum = approvalsCount >= 3;

      synthesizedExpenses.push({
        id: `appr-${exp.id}`,
        company_id: COMPANY_ID,
        entity_type: 'expense',
        entity_id: exp.id,
        entity_reference: refNo,
        entity_name: `${exp.vendor} - ${category}`,
        action_type: isSoftDeleted ? 'delete' : 'create',
        initiator_id: txn.created_by || null,
        initiator_name: actorName,
        initiator_role: 'Director',
        approvers: initialApprovers,
        approvals_count: approvalsCount,
        required_approvals: 3,
        details: {
          changesSummary: isSoftDeleted
            ? `Expense ${refNo} (${exp.vendor}) soft-deleted by ${actorName}.`
            : `New operating expense voucher (${refNo}) for ${exp.vendor} recorded by ${actorName}. Amount: LKR ${amount.toLocaleString()}. Category: ${category}.`,
          reason: txn.description?.replace(/\[Category:\s*[^\]]+\]\s*/g, '').trim() || 'Operating expense voucher',
          after: {
            amount,
            vendor: exp.vendor,
            category,
            is_paid: exp.is_paid,
            transaction_id: txn.id,
          },
        },
        status: reviewRecord ? (reviewRecord.status === 'rejected' ? 'rejected' : isQuorum ? 'approved' : 'pending') : 'pending',
        reviewer_name: reviewRecord?.reviewer_name,
        reviewed_at: reviewRecord?.reviewed_at,
        review_notes: reviewRecord?.review_notes,
        flagged_by: reviewRecord?.flagged_by,
        created_at: exp.created_at || txn.transaction_date || new Date().toISOString(),
        updated_at: exp.created_at || txn.transaction_date || new Date().toISOString(),
      });
    });

    // 4. Merge all sources in precedence: Synthesized < Local Approvals < Memory Cache < DB Table
    const mergedMap = new Map<string, any>();

    synthesizedExpenses.forEach((item) => mergedMap.set(item.id, item));

    localApprovals.forEach((item) => {
      const rev =
        reviewedMap.get(item.id) ||
        reviewedMap.get(item.entity_id) ||
        reviewedMap.get(item.entity_reference);
      if (rev) {
        item.status = rev.status;
        item.reviewer_name = rev.reviewer_name;
        item.reviewed_at = rev.reviewed_at;
        item.review_notes = rev.review_notes;
        item.approvers = rev.approvers || item.approvers || [item.initiator_name];
        item.approvals_count = rev.approvals_count || item.approvals_count || item.approvers.length;
        item.flagged_by = rev.flagged_by || item.flagged_by;
      }
      mergedMap.set(item.id, item);
    });

    cache.forEach((item) => {
      const rev =
        reviewedMap.get(item.id) ||
        reviewedMap.get(item.entity_id) ||
        reviewedMap.get(item.entity_reference);
      if (rev) {
        item.status = rev.status;
        item.reviewer_name = rev.reviewer_name;
        item.reviewed_at = rev.reviewed_at;
        item.review_notes = rev.review_notes;
        item.approvers = rev.approvers || item.approvers || [item.initiator_name];
        item.approvals_count = rev.approvals_count || item.approvals_count || item.approvers.length;
        item.flagged_by = rev.flagged_by || item.flagged_by;
      }
      mergedMap.set(item.id, item);
    });

    dbApprovals.forEach((item) => {
      const rev =
        reviewedMap.get(item.id) ||
        reviewedMap.get(item.entity_id) ||
        reviewedMap.get(item.entity_reference);
      if (rev) {
        item.status = rev.status;
        item.reviewer_name = rev.reviewer_name;
        item.reviewed_at = rev.reviewed_at;
        item.review_notes = rev.review_notes;
        item.approvers = rev.approvers || item.approvers || [item.initiator_name];
        item.approvals_count = rev.approvals_count || item.approvals_count || (item.approvers?.length || 1);
        item.flagged_by = rev.flagged_by || item.flagged_by;
      }
      mergedMap.set(item.id, item);
    });

    // 5. Authoritative scan for ANY contractor marked pending_deletion
    try {
      let contractorsList: any[] = [];
      const { data: cData } = await adminSupabase.from('contractors').select('*');
      if (cData && Array.isArray(cData)) contractorsList = cData;

      const cDataFile = path.join(process.cwd(), 'data', 'contractors.json');
      if (fs.existsSync(cDataFile)) {
        try {
          const localC = JSON.parse(fs.readFileSync(cDataFile, 'utf-8'));
          if (Array.isArray(localC)) {
            localC.forEach((lc: any) => {
              if (!contractorsList.some((c: any) => String(c.id) === String(lc.id))) {
                contractorsList.push(lc);
              }
            });
          }
        } catch {}
      }

      contractorsList.forEach((c: any) => {
        if (c.status === 'pending_deletion') {
          const delId = `appr-del-cnt-${c.id}`;
          const entityRef = `DEL-CNT-${String(c.id).slice(0, 8)}`;
          const reviewRecord =
            reviewedMap.get(delId) ||
            reviewedMap.get(c.id) ||
            reviewedMap.get(entityRef);

          const initialApprovers = reviewRecord?.approvers || ['Mr. Chanuka Lakshan'];
          const approvalsCount = reviewRecord?.approvals_count || initialApprovers.length;
          const isQuorum = approvalsCount >= 3;

          const synthesizedContractorApproval = {
            id: delId,
            company_id: COMPANY_ID,
            entity_type: 'contractor',
            entity_id: c.id,
            entity_reference: entityRef,
            entity_name: `${c.name} (${c.project_display_id || c.projectDisplayId || 'General'})`,
            action_type: 'delete',
            initiator_id: null,
            initiator_name: 'Mr. Chanuka Lakshan',
            initiator_role: 'Director',
            approvers: initialApprovers,
            approvals_count: approvalsCount,
            required_approvals: 3,
            details: {
              changesSummary: `Contractor removal request for ${c.name} (${c.project_display_id || c.projectDisplayId || 'General'}) awaiting 3/5 Board Quorum.`,
              reason: 'Contract concluded / Contractor removal requested',
              before: {
                contractorName: c.name,
                project: c.project_display_id || c.projectDisplayId || 'General',
                agreedFee: Number(c.agreed_fee ?? c.agreedFee ?? 0),
                paidTotal: Number(c.paid_total ?? c.paidTotal ?? 0),
                outstandingPayable: Number(c.outstanding_payable ?? c.outstandingPayable ?? 0),
              },
            },
            status: reviewRecord ? (reviewRecord.status === 'rejected' ? 'rejected' : isQuorum ? 'approved' : 'pending') : 'pending',
            reviewer_name: reviewRecord?.reviewer_name,
            reviewed_at: reviewRecord?.reviewed_at,
            review_notes: reviewRecord?.review_notes,
            created_at: c.updated_at || c.created_at || new Date().toISOString(),
            updated_at: c.updated_at || c.created_at || new Date().toISOString(),
          };

          mergedMap.set(delId, synthesizedContractorApproval);
        }
      });
    } catch (cErr) {
      console.warn('Notice querying contractors for approvals:', cErr);
    }

    const allItems = Array.from(mergedMap.values()).map((item) => {
      const approvers = item.approvers || (item.initiator_name ? [item.initiator_name] : ['Initiating Director']);
      const count = item.approvals_count || approvers.length;
      return {
        ...item,
        approvers,
        approvals_count: count,
        required_approvals: 3,
        status: item.status === 'rejected' ? 'rejected' : count >= 3 ? 'approved' : 'pending',
      };
    }).sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );

    let filtered = allItems;
    if (status && status !== 'all') {
      filtered = allItems.filter((item: any) => item.status === status);
    }

    return NextResponse.json({
      success: true,
      data: filtered,
      count: filtered.length,
    });
  } catch (err: any) {
    console.warn('Notice in approvals GET:', err);
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
    });
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
    const finalReviewerName = (reviewerName || 'Director').trim();

    // 1. Locate the approval record to determine action type and initiator
    const currentCache = getApprovalsCache();
    const localApprovals = readLocalApprovals();

    let targetApproval: any =
      currentCache.find((a) => a.id === id || a.entity_id === id) ||
      localApprovals.find((a) => a.id === id || a.entity_id === id);

    if (!targetApproval) {
      try {
        const { data: dbItem } = await adminSupabase
          .from('modification_approvals')
          .select('*')
          .or(`id.eq.${id},entity_id.eq.${id}`)
          .maybeSingle();
        if (dbItem) targetApproval = dbItem;
      } catch {
        // ignore
      }
    }

    // Check initiator restriction: Initiator CANNOT approve their own action
    const initiatorName = (targetApproval?.initiator_name || '').trim();
    if (status === 'approved' && initiatorName && initiatorName.toLowerCase() === finalReviewerName.toLowerCase()) {
      return NextResponse.json(
        { error: 'You are the initiating director. Two independent peer directors must approve.' },
        { status: 403 }
      );
    }

    // 2. Compute 3/5 Quorum Approvals
    let existingApprovers: string[] = targetApproval?.approvers || [];
    if (existingApprovers.length === 0 && initiatorName) {
      existingApprovers = [initiatorName];
    }

    let updatedApprovers = existingApprovers;
    let finalStatus = status;
    let isQuorumReached = false;
    let finalNotes = reviewNotes || '';

    if (status === 'approved') {
      updatedApprovers = Array.from(new Set([...existingApprovers, finalReviewerName]));
      const count = updatedApprovers.length;
      isQuorumReached = count >= 3;
      finalStatus = isQuorumReached ? 'approved' : 'pending';

      const peerApprovers = updatedApprovers.filter((n) => n.toLowerCase() !== initiatorName.toLowerCase());
      finalNotes = isQuorumReached
        ? `Board Quorum (3/5) achieved! Approved by ${updatedApprovers.join(', ')}.`
        : `Peer approval (${peerApprovers.length}/2) recorded by ${finalReviewerName}. Total: ${count}/3. Awaiting peer sign-off.`;
    } else if (status === 'rejected') {
      finalStatus = 'rejected';
      finalNotes = reviewNotes || `Flagged for clarification by ${finalReviewerName}`;
    }

    // 3. If approved AND 3/5 Quorum reached AND action_type was 'delete': EXECUTE PERMANENT HARD DELETE
    if (isQuorumReached && targetApproval?.action_type === 'delete') {
      const entityType = targetApproval.entity_type;
      const entityId = targetApproval.entity_id;

      try {
        if (entityType === 'project') {
          await adminSupabase.from('projects').delete().eq('id', entityId);
        } else if (entityType === 'client_payment') {
          await adminSupabase.from('client_payments').delete().eq('id', entityId);
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').delete().eq('id', txnId);
          }
        } else if (entityType === 'expense') {
          await adminSupabase.from('expenses').delete().eq('id', entityId);
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').delete().eq('id', txnId);
          }
        } else if (entityType === 'contractor') {
          await adminSupabase.from('contractors').delete().eq('id', entityId);
          try {
            const dataFile = path.join(process.cwd(), 'data', 'contractors.json');
            if (fs.existsSync(dataFile)) {
              const list = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
              if (Array.isArray(list)) {
                fs.writeFileSync(dataFile, JSON.stringify(list.filter((c: any) => String(c.id) !== String(entityId)), null, 2), 'utf-8');
              }
            }
            if ((globalThis as any).__devplux_contractors_cache__) {
              (globalThis as any).__devplux_contractors_cache__ = (globalThis as any).__devplux_contractors_cache__.filter((c: any) => String(c.id) !== String(entityId));
            }
          } catch {
            // ignore
          }
        }
      } catch (delErr) {
        console.warn('Notice executing hard delete on approved modification:', delErr);
      }
    }

    // 4. If rejected and action_type was 'delete': RESTORE SOFT-DELETED ENTITY
    if (status === 'rejected' && targetApproval?.action_type === 'delete') {
      const entityType = targetApproval.entity_type;
      const entityId = targetApproval.entity_id;

      try {
        if (entityType === 'project') {
          const { data: p } = await adminSupabase.from('projects').select('notes').eq('id', entityId).maybeSingle();
          if (p?.notes) {
            const restoredNotes = p.notes.replace('[SOFT_DELETED_PENDING_APPROVAL]', '').trim();
            await adminSupabase.from('projects').update({ notes: restoredNotes }).eq('id', entityId);
          }
        } else if (entityType === 'client_payment' || entityType === 'expense') {
          const txnId = targetApproval.details?.before?.transaction_id || targetApproval.details?.before?.transactionId;
          if (txnId) {
            await adminSupabase.from('transactions').update({ status: 'posted' }).eq('id', txnId);
          }
        } else if (entityType === 'contractor') {
          await adminSupabase.from('contractors').update({ status: 'active' }).eq('id', entityId);
          try {
            const dataFile = path.join(process.cwd(), 'data', 'contractors.json');
            if (fs.existsSync(dataFile)) {
              const list = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
              if (Array.isArray(list)) {
                const updated = list.map((c: any) => String(c.id) === String(entityId) ? { ...c, status: 'active' } : c);
                fs.writeFileSync(dataFile, JSON.stringify(updated, null, 2), 'utf-8');
              }
            }
            if ((globalThis as any).__devplux_contractors_cache__) {
              (globalThis as any).__devplux_contractors_cache__ = (globalThis as any).__devplux_contractors_cache__.map((c: any) => String(c.id) === String(entityId) ? { ...c, status: 'active' } : c);
            }
          } catch {
            // ignore
          }
        }
      } catch (restoreErr) {
        console.warn('Notice restoring soft-deleted record upon rejection:', restoreErr);
      }
    }

    // 5. Update approval record in DB
    try {
      await adminSupabase
        .from('modification_approvals')
        .update({
          status: finalStatus,
          reviewed_by: reviewerId || null,
          reviewer_name: updatedApprovers.join(', '),
          reviewed_at: reviewedAt,
          review_notes: finalNotes,
          updated_at: reviewedAt,
          details: {
            ...(targetApproval?.details || {}),
            approvers: updatedApprovers,
            approvals_count: updatedApprovers.length,
            required_approvals: 3,
            flagged_by: status === 'rejected' ? finalReviewerName : null,
          },
        })
        .or(`id.eq.${id},entity_id.eq.${id}`);
    } catch (dbErr) {
      console.warn('Notice updating DB modification approval:', dbErr);
    }

    // 6. Update in persistent approvals file, global reviewed map, and memory cache
    const reviewedMap = getReviewedMap();
    const reviewData = {
      status: finalStatus,
      reviewer_name: updatedApprovers.join(', '),
      reviewed_at: reviewedAt,
      review_notes: finalNotes,
      approvers: updatedApprovers,
      approvals_count: updatedApprovers.length,
      required_approvals: 3,
      flagged_by: status === 'rejected' ? finalReviewerName : null,
    };

    reviewedMap.set(id, reviewData);
    if (targetApproval?.entity_id) {
      reviewedMap.set(targetApproval.entity_id, reviewData);
      reviewedMap.set(`appr-del-cnt-${targetApproval.entity_id}`, reviewData);
    }
    if (targetApproval?.entity_reference) {
      reviewedMap.set(targetApproval.entity_reference, reviewData);
    }

    // Update in local file
    try {
      const apps = readLocalApprovals();
      const updated = apps.map((item: any) => {
        if (item.id === id || item.entity_id === id || (targetApproval && item.id === targetApproval.id)) {
          return {
            ...item,
            status: finalStatus,
            reviewer_name: updatedApprovers.join(', '),
            reviewed_at: reviewedAt,
            review_notes: finalNotes,
            approvers: updatedApprovers,
            approvals_count: updatedApprovers.length,
            required_approvals: 3,
            flagged_by: status === 'rejected' ? finalReviewerName : null,
            updated_at: reviewedAt,
          };
        }
        return item;
      });
      writeLocalApprovals(updated);
    } catch {}

    setApprovalsCache(
      currentCache.map((item) => {
        if (item.id === id || item.entity_id === id || (targetApproval && item.id === targetApproval.id)) {
          return {
            ...item,
            status: finalStatus,
            reviewer_name: updatedApprovers.join(', '),
            reviewed_at: reviewedAt,
            review_notes: finalNotes,
            approvers: updatedApprovers,
            approvals_count: updatedApprovers.length,
            required_approvals: 3,
            flagged_by: status === 'rejected' ? finalReviewerName : null,
            updated_at: reviewedAt,
          };
        }
        return item;
      })
    );

    // 7. Append sign-off to immutable audit_logs
    try {
      await adminSupabase.from('audit_logs').insert({
        company_id: COMPANY_ID,
        actor_id: reviewerId || 'b11e15d7-578e-4f20-a5a9-f44d97b1e9d4',
        actor_name: finalReviewerName,
        actor_role: 'Director Sign-off',
        action: `DIRECTOR_${status.toUpperCase()}_MODIFICATION`,
        entity_type: 'modification_approval',
        entity_id: String(id),
        reason: `${finalReviewerName} ${status === 'approved' ? (isQuorumReached ? 'approved (Board Quorum 3/5 achieved)' : 'approved (Peer Sign-off 1/2)') : 'flagged'}: ${finalNotes}`,
        timestamp: reviewedAt,
      });
    } catch (auditErr) {
      console.warn('Notice logging review to audit_logs:', auditErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: finalStatus,
        approvers: updatedApprovers,
        approvals_count: updatedApprovers.length,
        required_approvals: 3,
        isQuorumReached,
        reviewer_name: updatedApprovers.join(', '),
        reviewed_at: reviewedAt,
        review_notes: finalNotes,
      },
    });
  } catch (err: any) {
    console.error('Error updating approval status:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
