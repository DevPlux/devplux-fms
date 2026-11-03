import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalProfileByIdOrEmail } from '@/lib/storage/profile-storage';

export const dynamic = 'force-dynamic';

const CANONICAL_DIRECTORS_MAP: Record<string, { name: string; email: string }> = {
  'director1@devplux.com': { name: 'Mr. Chanuka Lakshan', email: 'director1@devplux.com' },
  'director2@devplux.com': { name: 'Mr. Lakindu Udara', email: 'director2@devplux.com' },
  'director3@devplux.com': { name: 'Mr. Janindu Chamoth', email: 'director3@devplux.com' },
  'director4@devplux.com': { name: 'Mr. Harsha Chathuranga', email: 'director4@devplux.com' },
  'director5@devplux.com': { name: 'Mr. Amila Lakshan', email: 'director5@devplux.com' },
};

export async function GET() {
  try {
    // 1. Get authenticated user from session cookies
    const serverSupabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        message: 'No active session found',
      });
    }

    const adminSupabase = createAdminClient();
    const emailKey = (user.email || '').toLowerCase().trim();

    // 2. Query public.profiles
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

    // 3. Query company membership for share allocation
    const { data: membership } = await adminSupabase
      .from('company_memberships')
      .select('share_percentage, role')
      .eq('user_id', user.id)
      .maybeSingle();

    // 4. Resolve exact legal name and avatar
    const canonical = CANONICAL_DIRECTORS_MAP[emailKey];
    const localProfile = getLocalProfileByIdOrEmail(user.id, emailKey);

    let resolvedName =
      profile?.full_name ||
      localProfile?.name ||
      user.user_metadata?.full_name;

    const isPlaceholder = !resolvedName || resolvedName.toLowerCase().startsWith('director ');

    if (isPlaceholder) {
      resolvedName = canonical?.name || resolvedName || 'Director';
    }

    // Auto-sync profile name if it was a placeholder
    if (profile && canonical && isPlaceholder) {
      try {
        await adminSupabase
          .from('profiles')
          .update({ full_name: canonical.name, role: 'director' })
          .eq('id', user.id);
      } catch {
        // ignore background sync errors
      }
    }

    const resolvedAvatar =
      profile?.avatar_url ||
      localProfile?.avatar_url ||
      user.user_metadata?.avatar_url ||
      null;

    const share = membership?.share_percentage !== undefined ? Number(membership.share_percentage) : 20;

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: resolvedName,
        avatarUrl: resolvedAvatar,
        role: 'Director',
        roleKey: 'director',
        sharePercentage: `${share.toFixed(2)}%`,
        capitalContributed: 'LKR 0.00',
        mustChangePassword: Boolean(profile?.must_change_password),
        isActive: profile ? profile.is_active !== false : true,
      },
    });
  } catch (err: any) {
    console.error('Error fetching current user:', err);
    return NextResponse.json({
      success: false,
      authenticated: false,
      error: err?.message || 'Failed to authenticate user',
    });
  }
}

