import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFallbackAuditLogs, recordAuditLog } from '@/lib/audit/audit-logger';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.toLowerCase();
    const action = searchParams.get('action');

    const adminSupabase = createAdminClient();

    let query = adminSupabase
      .from('audit_logs')
      .select('*')
      .order('timestamp', { ascending: false });

    if (action && action !== 'all') {
      query = query.eq('action', action);
    }

    const { data: dbLogs, error } = await query;

    let allLogs: any[] = [];
    if (!error && dbLogs) {
      allLogs = [...dbLogs];
    } else {
      console.warn('Notice querying audit_logs from database:', error?.message);
      allLogs = getFallbackAuditLogs();
    }

    // Merge fallback logs if DB has fewer or empty
    const fallback = getFallbackAuditLogs();
    fallback.forEach((f) => {
      if (!allLogs.some((l) => l.id === f.id || (l.timestamp === f.timestamp && l.action === f.action))) {
        allLogs.push(f);
      }
    });

    // Re-sort by timestamp descending
    allLogs.sort((a, b) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime());

    // Filter out technical test rows (such as {"test": true} or internal test actions)
    const sanitized = allLogs.filter((l) => {
      // Exclude test rows
      if (l.action === 'TEST' || l.entity_id === 'test' || l.actor_name?.toLowerCase().includes('test')) {
        return false;
      }
      if (l.before_values && typeof l.before_values === 'object' && 'test' in l.before_values) {
        return false;
      }
      if (l.after_values && typeof l.after_values === 'object' && 'test' in l.after_values) {
        return false;
      }
      return true;
    });

    // Apply search filter if present
    const filtered = sanitized.filter((l) => {
      if (!search) return true;
      const haystack = `${l.action} ${l.actor_name} ${l.entity_type} ${l.entity_id} ${l.reason}`.toLowerCase();
      return haystack.includes(search);
    });

    return NextResponse.json({
      success: true,
      data: filtered,
      total: filtered.length,
    });
  } catch (err: any) {
    console.error('Error fetching audit logs:', err);
    return NextResponse.json({
      success: false,
      error: err?.message || 'Failed to fetch audit logs',
      data: getFallbackAuditLogs(),
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actorName, actorRole, action, entityType, entityId, reason, beforeValues, afterValues } = body;

    if (!actorName || !action || !entityType || !entityId) {
      return NextResponse.json({ error: 'Missing required audit log parameters' }, { status: 400 });
    }

    const success = await recordAuditLog({
      actorName,
      actorRole: actorRole || 'Director',
      action,
      entityType,
      entityId,
      reason: reason || 'Director initiated financial action',
      beforeValues,
      afterValues,
    });

    return NextResponse.json({ success }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal audit error' }, { status: 500 });
  }
}

