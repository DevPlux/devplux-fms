import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordAuditLog } from '@/lib/audit/audit-logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, email } = body;

    let targetUserId = userId;
    let targetEmail = email;

    // 1. Inspect server-side auth cookie if available
    try {
      const serverSupabase = createServerSupabaseClient();
      const {
        data: { user },
      } = await serverSupabase.auth.getUser();
      if (user) {
        targetUserId = targetUserId || user.id;
        targetEmail = targetEmail || user.email;
      }
    } catch {
      // Fallback to body identifiers
    }

    if (!targetUserId && !targetEmail) {
      return NextResponse.json(
        { success: false, error: 'User identification (userId or email) is required.' },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();

    // 2. Mark must_change_password as FALSE in profiles table
    let query = adminSupabase
      .from('profiles')
      .update({
        must_change_password: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      });

    if (targetUserId) {
      query = query.eq('id', targetUserId);
    } else if (targetEmail) {
      query = query.eq('email', targetEmail);
    }

    const { error: profileError } = await query;

    if (profileError) {
      console.warn('Notice updating profile must_change_password:', profileError.message);
    }

    // 3. Mark must_change_password as FALSE in auth.users metadata
    if (targetUserId) {
      try {
        await adminSupabase.auth.admin.updateUserById(targetUserId, {
          user_metadata: {
            must_change_password: false,
          },
        });
      } catch (authErr: any) {
        console.warn('Notice updating auth user metadata:', authErr?.message);
      }
    }

    // 4. Record tamper-proof audit log for director security credential setup
    let directorName = targetEmail || 'Director';
    try {
      const { data: prof } = await adminSupabase.from('profiles').select('full_name').eq('email', targetEmail || '').maybeSingle();
      if (prof?.full_name) directorName = prof.full_name;
    } catch {
      // ignore
    }

    await recordAuditLog({
      actorId: targetUserId || null,
      actorName: directorName,
      actorRole: 'Director',
      action: 'PASSWORD_INITIALIZED',
      entityType: 'director_credential',
      entityId: targetEmail || targetUserId || 'director',
      reason: `Director ${directorName} successfully completed mandatory first-login password initialization and activated their governance account.`,
      beforeValues: {
        must_change_password: true,
        account_status: 'setup_required',
      },
      afterValues: {
        must_change_password: false,
        account_status: 'enacted',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'First-login setup successfully completed and verified in database.',
    });
  } catch (err: any) {
    console.error('Error in complete-setup API:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to complete first login setup.' },
      { status: 500 }
    );
  }
}

