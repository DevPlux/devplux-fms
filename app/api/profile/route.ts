import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalProfileByIdOrEmail, saveLocalProfile } from '@/lib/storage/profile-storage';
import { recordAuditLog } from '@/lib/audit/audit-logger';

export const dynamic = 'force-dynamic';

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001';

const CANONICAL_DIRECTORS_MAP: Record<string, string> = {
  'director1@devplux.com': 'Mr. Chanuka Lakshan',
  'director2@devplux.com': 'Mr. Lakindu Udara',
  'director3@devplux.com': 'Mr. Janindu Chamoth',
  'director4@devplux.com': 'Mr. Harsha Chathuranga',
  'director5@devplux.com': 'Mr. Amila Lakshan',
};

export async function GET() {
  try {
    const serverSupabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: No active session' }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const emailKey = (user.email || '').toLowerCase().trim();

    // 1. Fetch from profiles table
    let profile: any = null;
    try {
      const { data } = await adminSupabase
        .from('profiles')
        .select('id, full_name, email, role, must_change_password, is_active, avatar_url')
        .eq('id', user.id)
        .maybeSingle();
      profile = data;
    } catch {
      try {
        const { data } = await adminSupabase
          .from('profiles')
          .select('id, full_name, email, role, must_change_password, is_active')
          .eq('id', user.id)
          .maybeSingle();
        profile = data;
      } catch {}
    }

    // 2. Fetch shareholding from company_memberships
    const { data: membership } = await adminSupabase
      .from('company_memberships')
      .select('share_percentage, role')
      .eq('user_id', user.id)
      .maybeSingle();

    // 3. Fallback to local profile file
    const localProfile = getLocalProfileByIdOrEmail(user.id, emailKey);

    // 4. Resolve legal name and avatar URL
    const canonicalName = CANONICAL_DIRECTORS_MAP[emailKey];
    let resolvedName =
      profile?.full_name ||
      localProfile?.name ||
      user.user_metadata?.full_name;

    if (!resolvedName || resolvedName.toLowerCase().startsWith('director ')) {
      resolvedName = canonicalName || resolvedName || 'Director';
    }

    const resolvedAvatar =
      profile?.avatar_url ||
      localProfile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      null;

    const share = membership?.share_percentage !== undefined ? Number(membership.share_percentage) : 20;

    return NextResponse.json({
      success: true,
      profile: {
        id: user.id,
        name: resolvedName,
        email: user.email,
        avatarUrl: resolvedAvatar,
        role: 'Director',
        roleKey: profile?.role || 'director',
        sharePercentage: `${share.toFixed(2)}%`,
        capitalContributed: 'LKR 0.00',
        mustChangePassword: Boolean(profile?.must_change_password),
        isActive: profile ? profile.is_active !== false : true,
      },
    });
  } catch (err: any) {
    console.error('Error fetching profile:', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const serverSupabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized: No active session' }, { status: 401 });
    }

    const body = await req.json();
    const { name, avatarUrl, newPassword } = body;

    const adminSupabase = createAdminClient();
    const emailKey = (user.email || '').toLowerCase().trim();
    const nowIso = new Date().toISOString();

    const updatedName = (name || '').trim();

    // 1. If password change requested, validate complexity
    if (newPassword) {
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters long.' },
          { status: 400 }
        );
      }
      const hasUpper = /[A-Z]/.test(newPassword);
      const hasLower = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);

      if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        return NextResponse.json(
          {
            error:
              'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.',
          },
          { status: 400 }
        );
      }

      // Update password via admin client
      const { error: pwdErr } = await adminSupabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
      });

      if (pwdErr) {
        return NextResponse.json({ error: `Password update failed: ${pwdErr.message}` }, { status: 400 });
      }
    }

    // 2. Update user metadata in Supabase auth.users
    const currentUserMeta = user.user_metadata || {};
    const updatedMeta: Record<string, any> = {
      ...currentUserMeta,
    };
    if (updatedName) {
      updatedMeta.full_name = updatedName;
    }
    if (avatarUrl !== undefined) {
      updatedMeta.avatar_url = avatarUrl;
    }

    try {
      await adminSupabase.auth.admin.updateUserById(user.id, {
        user_metadata: updatedMeta,
      });
    } catch (metaErr) {
      console.warn('Notice updating auth user metadata:', metaErr);
    }

    // 3. Update public.profiles table in Supabase
    try {
      const updatePayload: Record<string, any> = {
        updated_at: nowIso,
      };
      if (updatedName) updatePayload.full_name = updatedName;
      if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl;
      if (newPassword) updatePayload.must_change_password = false;

      const { error: dbErr } = await adminSupabase
        .from('profiles')
        .update(updatePayload)
        .eq('id', user.id);

      if (dbErr && dbErr.code === '42703') {
        // avatar_url column does not exist in profiles table yet
        const safePayload: Record<string, any> = { updated_at: nowIso };
        if (updatedName) safePayload.full_name = updatedName;
        if (newPassword) safePayload.must_change_password = false;

        await adminSupabase.from('profiles').update(safePayload).eq('id', user.id);
      }
    } catch (profileErr) {
      console.warn('Notice updating profiles table in Supabase:', profileErr);
    }

    // 4. Save to local storage file for zero-latency redundancy
    saveLocalProfile({
      id: user.id,
      name: updatedName || user.user_metadata?.full_name || 'Director',
      email: user.email || '',
      avatar_url: avatarUrl !== undefined ? avatarUrl : (currentUserMeta.avatar_url || null),
      updated_at: nowIso,
    });

    // 5. Append to audit trail
    try {
      await recordAuditLog({
        companyId: COMPANY_ID,
        actorId: user.id,
        actorName: updatedName || user.user_metadata?.full_name || 'Director',
        actorRole: 'Director Profile Settings',
        action: 'DIRECTOR_PROFILE_UPDATED',
        entityType: 'profile',
        entityId: user.id,
        reason: `Director updated profile details (Legal Name: ${updatedName || 'unchanged'}, Photo: ${avatarUrl ? 'updated' : avatarUrl === null ? 'removed' : 'unchanged'}, Password: ${newPassword ? 'changed' : 'unchanged'})`,
        timestamp: nowIso,
        beforeValues: {
          legalName: 'Mr. Chanuka Lakshan',
        },
        afterValues: {
          legalName: updatedName,
          photoUpdated: Boolean(avatarUrl),
          passwordUpdated: Boolean(newPassword),
        },
      });
    } catch (auditErr) {
      console.warn('Notice recording profile update to audit_logs:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        name: updatedName || user.user_metadata?.full_name || 'Director',
        email: user.email,
        avatarUrl: avatarUrl !== undefined ? avatarUrl : (currentUserMeta.avatar_url || null),
        role: 'Director',
      },
    });
  } catch (err: any) {
    console.error('Error updating profile:', err);
    return NextResponse.json({ error: err.message || 'Failed to update profile' }, { status: 500 });
  }
}

