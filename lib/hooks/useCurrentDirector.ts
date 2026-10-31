import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface CurrentDirector {
  id: string;
  name: string;
  email: string;
  role: string;
}

export const CANONICAL_MAP: Record<string, string> = {
  'director1@devplux.com': 'MR. Chanuka',
  'director2@devplux.com': 'MR. Lakindu',
  'director3@devplux.com': 'MR. Janindu',
  'director4@devplux.com': 'Mr. Harsha',
  'director5@devplux.com': 'Mr. Amila',
};

const STORAGE_KEY = 'devplux_authenticated_director';

// Module-level in-memory cache that persists across client-side route transitions
let cachedDirectorMemory: CurrentDirector | null = null;

/**
 * Synchronously retrieves authenticated director from memory or localStorage.
 * Guarantees 0ms latency with zero flicker during tab switches and component remounts.
 */
export function getStoredDirector(): CurrentDirector | null {
  // 1. Check in-memory singleton (fastest, active during client-side navigation)
  if (
    cachedDirectorMemory &&
    cachedDirectorMemory.name &&
    !cachedDirectorMemory.name.toLowerCase().startsWith('director')
  ) {
    return cachedDirectorMemory;
  }

  if (typeof window === 'undefined') return null;

  // 2. Check dedicated localStorage entry
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.name &&
        !parsed.name.toLowerCase().startsWith('director')
      ) {
        cachedDirectorMemory = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore JSON parse or localStorage access errors
  }

  // 3. Fallback: Parse Supabase session tokens stored in browser localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          const email = (parsed?.user?.email || '').trim().toLowerCase();
          if (email) {
            const canonicalName =
              CANONICAL_MAP[email] ||
              parsed?.user?.user_metadata?.full_name ||
              '';
            if (
              canonicalName &&
              !canonicalName.toLowerCase().startsWith('director')
            ) {
              const director: CurrentDirector = {
                id: parsed?.user?.id || '',
                name: canonicalName,
                email: email,
                role: 'Director',
              };
              cachedDirectorMemory = director;
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(director));
              } catch {
                // ignore
              }
              return director;
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Persists authenticated director identity to memory and localStorage synchronously.
 */
export function setStoredDirector(director: CurrentDirector) {
  cachedDirectorMemory = director;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(director));
    } catch {
      // ignore
    }
  }
}

/**
 * Clears director cache upon user logout.
 */
export function clearStoredDirector() {
  cachedDirectorMemory = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

let isHookHydrated = false;

export function useCurrentDirector() {
  const [director, setDirector] = useState<CurrentDirector>(() => {
    if (!isHookHydrated) {
      return {
        id: '',
        name: '',
        email: '',
        role: 'Director',
      };
    }
    const stored = getStoredDirector();
    if (stored) return stored;
    return {
      id: '',
      name: '',
      email: '',
      role: 'Director',
    };
  });
  const [loading, setLoading] = useState<boolean>(() => !isHookHydrated || !getStoredDirector());

  useEffect(() => {
    isHookHydrated = true;
    let isMounted = true;

    // Immediately resolve stored identity if present upon hydration
    const stored = getStoredDirector();
    if (stored && isMounted) {
      setDirector(stored);
      setLoading(false);
    }

    async function load() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          if (json.authenticated && json.user && isMounted) {
            const resolved: CurrentDirector = {
              id: json.user.id,
              name: json.user.name,
              email: json.user.email,
              role: json.user.role || 'Director',
            };
            setStoredDirector(resolved);
            setDirector(resolved);
            setLoading(false);
            return;
          }
        }

        // Fallback to client session
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && isMounted) {
          const email = user.email || '';
          const mappedName =
            CANONICAL_MAP[email.toLowerCase()] ||
            user.user_metadata?.full_name ||
            '';

          if (mappedName) {
            const resolved: CurrentDirector = {
              id: user.id,
              name: mappedName,
              email: email,
              role: 'Director',
            };
            setStoredDirector(resolved);
            setDirector(resolved);
          }
        }
      } catch (err) {
        console.warn('Notice in useCurrentDirector:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  return { director, loading };
}
