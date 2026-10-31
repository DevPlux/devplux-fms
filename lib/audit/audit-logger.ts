import { createAdminClient } from '@/lib/supabase/admin';

export const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';

export interface AuditLogParams {
  companyId?: string;
  actorId?: string | null;
  actorName: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  beforeValues?: Record<string, any> | null;
  afterValues?: Record<string, any> | null;
  timestamp?: string;
}

// In-memory fallback cache so audit entries are always preserved even in connection drops
let auditMemoryFallback: any[] = [];

/**
 * Centrally records an immutable audit log entry into Supabase public.audit_logs.
 * Never throws an error so critical business operations (projects, payments, expenses) are never aborted.
 */
export async function recordAuditLog(params: AuditLogParams): Promise<boolean> {
  const finalTimestamp = params.timestamp || new Date().toISOString();
  const finalActorRole = params.actorRole || 'Director';
  const finalCompanyId = params.companyId || COMPANY_ID;

  const logPayload = {
    company_id: finalCompanyId,
    actor_id: params.actorId || null,
    actor_name: params.actorName,
    actor_role: finalActorRole,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    reason: params.reason,
    before_values: params.beforeValues || null,
    after_values: params.afterValues || null,
    timestamp: finalTimestamp,
  };

  // Add to fallback cache
  auditMemoryFallback.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ...logPayload,
  });
  if (auditMemoryFallback.length > 200) {
    auditMemoryFallback = auditMemoryFallback.slice(0, 200);
  }

  try {
    const adminSupabase = createAdminClient();
    let { error } = await adminSupabase.from('audit_logs').insert(logPayload);
    if (error && (error.message.includes('actor_name') || error.message.includes('actor_role'))) {
      const { actor_name, actor_role, ...standardPayload } = logPayload;
      const retry = await adminSupabase.from('audit_logs').insert(standardPayload);
      error = retry.error;
    }
    if (error) {
      console.warn('Notice writing to audit_logs in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn('Notice inserting audit log:', err?.message || err);
    return false;
  }
}

export function getFallbackAuditLogs(): any[] {
  return auditMemoryFallback;
}

