import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLocalProfiles } from '@/lib/storage/profile-storage';

export const dynamic = 'force-dynamic';

export interface DirectorRecord {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: 'director';
  roleTitle: 'Director';
  sharePercentage: number;
  capitalContributed: number;
  mustChangePassword: boolean;
  isActive: boolean;
  updatedAt?: string;
}

const CANONICAL_DIRECTORS: Array<Omit<DirectorRecord, 'id'>> = [
  {
    name: 'Mr. Chanuka Lakshan',
    email: 'director1@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    name: 'Mr. Lakindu Udara',
    email: 'director2@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    name: 'Mr. Janindu Chamoth',
    email: 'director3@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    name: 'Mr. Harsha Chathuranga',
    email: 'director4@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
  {
    name: 'Mr. Amila Lakshan',
    email: 'director5@devplux.com',
    role: 'director',
    roleTitle: 'Director',
    sharePercentage: 20.0,
    capitalContributed: 0,
    mustChangePassword: true,
    isActive: true,
  },
];

const CANONICAL_NAMES_BY_EMAIL: Record<string, string> = {
  'director1@devplux.com': 'Mr. Chanuka Lakshan',
  'director2@devplux.com': 'Mr. Lakindu Udara',
  'director3@devplux.com': 'Mr. Janindu Chamoth',
  'director4@devplux.com': 'Mr. Harsha Chathuranga',
  'director5@devplux.com': 'Mr. Amila Lakshan',
};

export async function GET() {
  try {
    const adminSupabase = createAdminClient();
    const localProfiles = getLocalProfiles();

    // 1. Fetch live profiles from Supabase database (with avatar_url fallback)
    let profiles: any[] | null = null;
    let profilesError: any = null;
    try {
      const { data, error } = await adminSupabase
        .from('profiles')
        .select('id, full_name, email, role, must_change_password, is_active, avatar_url, created_at, updated_at')
        .order('created_at', { ascending: true });
      profiles = data;
      profilesError = error;
    } catch {
      try {
        const { data, error } = await adminSupabase
          .from('profiles')
          .select('id, full_name, email, role, must_change_password, is_active, created_at, updated_at')
          .order('created_at', { ascending: true });
        profiles = data;
        profilesError = error;
      } catch (err) {
        profilesError = err;
      }
    }

    // 2. Fetch company memberships for live shareholdings
    const { data: memberships } = await adminSupabase
      .from('company_memberships')
      .select('user_id, share_percentage, role');

    const membershipMap = new Map<string, any>();
    if (memberships) {
      memberships.forEach((m: any) => {
        membershipMap.set(m.user_id, m);
      });
    }

    if (!profilesError && profiles && profiles.length > 0) {
      const dbDirectorsByEmail = new Map<string, any>();
      profiles.forEach((p: any) => {
        if (p.email) {
          dbDirectorsByEmail.set(p.email.toLowerCase().trim(), p);
        }
      });

      // Synchronize canonical directors with live database profiles
      const enrichedDirectors: DirectorRecord[] = CANONICAL_DIRECTORS.map((canonical, idx) => {
        const emailKey = canonical.email.toLowerCase();
        const dbProfile = dbDirectorsByEmail.get(emailKey);
        const localProf = localProfiles[emailKey] || (dbProfile ? localProfiles[dbProfile.id] : null);

        if (dbProfile) {
          const mem = membershipMap.get(dbProfile.id);
          const share = mem?.share_percentage !== undefined ? Number(mem.share_percentage) : canonical.sharePercentage;

          let displayName = dbProfile.full_name || localProf?.name;
          if (
            !displayName ||
            displayName.toLowerCase().startsWith('director ')
          ) {
            displayName = CANONICAL_NAMES_BY_EMAIL[emailKey] || dbProfile.full_name || canonical.name;
          }

          const avatarUrl = dbProfile.avatar_url || localProf?.avatar_url || undefined;

          return {
            id: dbProfile.id,
            name: displayName,
            email: dbProfile.email,
            avatarUrl,
            role: 'director' as const,
            roleTitle: 'Director' as const,
            sharePercentage: share,
            capitalContributed: 0,
            mustChangePassword: Boolean(dbProfile.must_change_password),
            isActive: dbProfile.is_active !== false,
            updatedAt: dbProfile.updated_at,
          };
        }

        const localFallback = localProfiles[emailKey];
        return {
          id: `canonical-${idx + 1}`,
          ...canonical,
          name: localFallback?.name || canonical.name,
          avatarUrl: localFallback?.avatar_url || undefined,
          mustChangePassword: true,
        };
      });

      // Also include any other non-canonical director accounts found in DB
      profiles.forEach((p: any) => {
        const emailKey = (p.email || '').toLowerCase().trim();
        if (emailKey && !CANONICAL_DIRECTORS.some((c) => c.email.toLowerCase() === emailKey)) {
          const mem = membershipMap.get(p.id);
          const localFallback = localProfiles[emailKey] || localProfiles[p.id];
          enrichedDirectors.push({
            id: p.id,
            name: p.full_name || localFallback?.name || 'Director',
            email: p.email,
            avatarUrl: p.avatar_url || localFallback?.avatar_url || undefined,
            role: 'director' as const,
            roleTitle: 'Director' as const,
            sharePercentage: mem?.share_percentage ? Number(mem.share_percentage) : 0,
            capitalContributed: 0,
            mustChangePassword: Boolean(p.must_change_password),
            isActive: p.is_active !== false,
            updatedAt: p.updated_at,
          });
        }
      });

      return NextResponse.json({
        success: true,
        data: enrichedDirectors,
      });
    }

    // Fallback if profiles table is empty or pending seed
    return NextResponse.json({
      success: true,
      data: CANONICAL_DIRECTORS.map((d, idx) => ({
        id: `d${idx + 1}`,
        ...d,
        mustChangePassword: true,
      })),
      isFallback: true,
    });
  } catch (err: any) {
    console.warn('Notice in directors GET:', err?.message || err);
    return NextResponse.json({
      success: true,
      data: CANONICAL_DIRECTORS.map((d, idx) => ({
        id: `d${idx + 1}`,
        ...d,
        mustChangePassword: true,
      })),
      isFallback: true,
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { directorId, email, mustChangePassword } = body;

    const adminSupabase = createAdminClient();

    let query = adminSupabase.from('profiles').update({
      must_change_password: Boolean(mustChangePassword),
      updated_at: new Date().toISOString(),
    });

    if (directorId && !directorId.startsWith('canonical-') && !directorId.startsWith('d')) {
      query = query.eq('id', directorId);
    } else if (email) {
      query = query.eq('email', email);
    } else {
      return NextResponse.json(
        { success: false, error: 'Valid director id or corporate email required.' },
        { status: 400 }
      );
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (directorId && !directorId.startsWith('canonical-') && !directorId.startsWith('d')) {
      try {
        await adminSupabase.auth.admin.updateUserById(directorId, {
          user_metadata: { must_change_password: Boolean(mustChangePassword) },
        });
      } catch {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Director authentication status updated successfully.',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Error updating director status' },
      { status: 500 }
    );
  }
}

