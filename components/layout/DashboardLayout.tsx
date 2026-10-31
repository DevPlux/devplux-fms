'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { DirectorRole } from '@/types/financial';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  getStoredDirector,
  setStoredDirector,
  clearStoredDirector,
  CANONICAL_MAP,
} from '@/lib/hooks/useCurrentDirector';

interface DashboardLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  pageDescription?: string;
  userRole?: DirectorRole;
  userName?: string;
  userEmail?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  pageTitle,
  pageDescription,
  userRole,
  userName,
  userEmail,
}) => {
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Synchronously initialize director profile from persistent memory/storage cache
  // Eliminates all 100-300ms network lag / flicker during tab transitions
  const [currentRole, setCurrentRole] = useState<DirectorRole>(userRole || 'director');
  const [currentName, setCurrentName] = useState<string>(() => {
    if (userName && !userName.toLowerCase().startsWith('director')) return userName;
    const stored = getStoredDirector();
    if (stored?.name && !stored.name.toLowerCase().startsWith('director')) return stored.name;
    return userName || '';
  });
  const [currentEmail, setCurrentEmail] = useState<string>(() => {
    if (userEmail && userEmail !== 'director@devplux.com') return userEmail;
    const stored = getStoredDirector();
    if (stored?.email) return stored.email;
    return userEmail || '';
  });

  useEffect(() => {
    let isMounted = true;

    const loadAuthUser = async () => {
      try {
        // 1. Try server-verified API endpoint
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const json = await res.json();
          if (json.authenticated && json.user && isMounted) {
            setCurrentRole('director');
            setCurrentName(json.user.name);
            setCurrentEmail(json.user.email);
            setStoredDirector({
              id: json.user.id,
              name: json.user.name,
              email: json.user.email,
              role: json.user.role || 'Director',
            });
            return;
          }
        }

        // 2. Fallback to browser Supabase client
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
            setCurrentRole('director');
            setCurrentName(mappedName);
            setCurrentEmail(email);
            setStoredDirector({
              id: user.id,
              name: mappedName,
              email: email,
              role: 'Director',
            });
          }
        }
      } catch {
        // Keep cached values
      }
    };

    loadAuthUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load saved sidebar collapsed preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('devplux_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('devplux_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Keyboard shortcut Ctrl+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = async () => {
    try {
      clearStoredDirector();
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    router.push('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <Sidebar
        userRole={currentRole}
        userName={currentName}
        userEmail={currentEmail}
        onLogout={handleLogout}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          pageTitle={pageTitle}
          pageDescription={pageDescription}
          userRole={currentRole}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};
