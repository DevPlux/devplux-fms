'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Briefcase,
  ArrowDownLeft,
  ArrowUpRight,
  Users2,
  Landmark,
  CheckCircle2,
  FileBarChart,
  PieChart,
  History,
  UserCheck,
  Settings,
  Building2,
  LogOut,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { DirectorRole } from '@/types/financial';
import { getStoredDirector } from '@/lib/hooks/useCurrentDirector';

interface SidebarProps {
  userRole?: DirectorRole;
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

// Global client hydration tracker that remains true after initial client hydration pass
let isSidebarHydrated = false;

export const Sidebar: React.FC<SidebarProps> = ({
  userRole = 'director',
  userName = '',
  userEmail = '',
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const pathname = usePathname();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [mounted, setMounted] = useState<boolean>(() => isSidebarHydrated);

  useEffect(() => {
    isSidebarHydrated = true;
    setMounted(true);
  }, []);

  // Synchronously resolve real director name with zero lag; gate by mounted state to eliminate SSR hydration mismatch
  const stored = mounted ? getStoredDirector() : null;
  const effectiveName = mounted
    ? (userName && !userName.toLowerCase().startsWith('director')
        ? userName
        : stored?.name && !stored.name.toLowerCase().startsWith('director')
        ? stored.name
        : userName || '')
    : (userName && !userName.toLowerCase().startsWith('director') ? userName : '');

  useEffect(() => {
    const fetchPending = async () => {
      try {
        const res = await fetch('/api/approvals?status=pending');
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setPendingApprovalsCount(json.data.length);
        }
      } catch {
        // ignore
      }
    };

    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Projects', href: '/projects', icon: Briefcase },
    { label: 'Income', href: '/income', icon: ArrowDownLeft },
    { label: 'Expenses', href: '/expenses', icon: ArrowUpRight },
    { label: 'Contractors', href: '/contractors', icon: Users2 },
    { label: 'Accounts & Cash', href: '/accounts', icon: Landmark },
    { label: 'Approvals Queue', href: '/approvals', icon: CheckCircle2 },
    { label: 'Financial Reports', href: '/reports', icon: FileBarChart },
    { label: 'Profit Distributions', href: '/distributions', icon: PieChart },
    { label: 'Directors Register', href: '/directors', icon: Building2 },
    { label: 'Audit Trail', href: '/audit-log', icon: History },
  ];

  const secondaryNavItems = [
    { label: 'Director Profile', href: '/profile', icon: UserCheck },
    { label: 'Governance Settings', href: '/settings', icon: Settings },
  ];

  const roleLabels: Record<DirectorRole, string> = {
    managing_director: 'Director',
    finance_director: 'Director',
    director: 'Director',
  };

  // Helper to extract the director's true first letter initial, ignoring honorific prefixes (MR., Mr., etc.)
  const getDirectorInitial = (name: string): string => {
    if (!name) return '';
    const clean = name
      .trim()
      .replace(/^(mr\.|mr|mrs\.|mrs|ms\.|ms|dr\.|dr|prof\.|prof)\s*/i, '')
      .trim();
    return (clean.charAt(0) || name.charAt(0) || '').toUpperCase();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={clsx(
          'bg-slate-900 text-slate-300 flex flex-col shrink-0 h-screen sticky top-0 border-r border-slate-800 transition-all duration-300 ease-in-out z-50',
          // Desktop collapsed width vs expanded width
          isCollapsed ? 'w-20' : 'w-64',
          // Mobile responsive drawer sliding
          isMobileOpen
            ? 'fixed inset-y-0 left-0 w-64 translate-x-0 shadow-2xl'
            : 'fixed inset-y-0 left-0 -translate-x-full lg:relative lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div
          className={clsx(
            'border-b border-slate-800/80 min-h-[64px] flex items-center transition-all',
            isCollapsed && !isMobileOpen
              ? 'p-2 flex-col justify-center gap-1.5'
              : 'p-4 justify-between gap-2'
          )}
        >
          <div
            className={clsx(
              'flex items-center overflow-hidden',
              isCollapsed && !isMobileOpen ? 'justify-center' : 'gap-3'
            )}
          >
            <img
              src="/Logo.webp"
              alt="Devplux Logo"
              className={clsx(
                'object-contain rounded-md shrink-0 bg-slate-950/40 border border-slate-800',
                isCollapsed && !isMobileOpen ? 'w-8 h-8 p-0.5' : 'w-10 h-10 p-1'
              )}
            />
            {(!isCollapsed || isMobileOpen) && (
              <div className="overflow-hidden animate-in fade-in duration-200">
                <h1 className="text-sm font-bold text-white tracking-tight truncate">DEVPLUX (PVT) LTD</h1>
                <p className="text-[10px] text-slate-400 font-medium truncate">Financial Management</p>
              </div>
            )}
          </div>

          {/* Desktop Arrow Toggle Button (< when expanded, > when collapsed) */}
          {onToggleCollapse && (
            <div className="hidden lg:flex items-center justify-center">
              <button
                onClick={onToggleCollapse}
                title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
                className={clsx(
                  'rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500',
                  isCollapsed && !isMobileOpen ? 'p-1' : 'p-1.5'
                )}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          )}

          {/* Mobile Close Button */}
          {isMobileOpen && (
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div>
            {(!isCollapsed || isMobileOpen) && (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Operations & Ledgers
              </p>
            )}
            <nav className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile();
                    }}
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    className={clsx(
                      'flex items-center rounded-md text-xs font-medium transition-colors',
                      isCollapsed && !isMobileOpen
                        ? 'justify-center p-2.5'
                        : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    )}
                  >
                    <div className="relative shrink-0">
                      <Icon className={clsx('w-4 h-4', isActive ? 'text-white' : 'text-slate-400')} />
                      {item.href === '/approvals' && pendingApprovalsCount > 0 && isCollapsed && !isMobileOpen && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      )}
                    </div>
                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}
                    {item.href === '/approvals' && pendingApprovalsCount > 0 && (!isCollapsed || isMobileOpen) && (
                      <span className="ml-auto bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {pendingApprovalsCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div>
            {(!isCollapsed || isMobileOpen) && (
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Governance & Security
              </p>
            )}
            <nav className="space-y-0.5">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile();
                    }}
                    title={isCollapsed && !isMobileOpen ? item.label : undefined}
                    className={clsx(
                      'flex items-center rounded-md text-xs font-medium transition-colors',
                      isCollapsed && !isMobileOpen
                        ? 'justify-center p-2.5'
                        : 'gap-3 px-3 py-2',
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    )}
                  >
                    <Icon className={clsx('w-4 h-4 shrink-0', isActive ? 'text-white' : 'text-slate-400')} />
                    {(!isCollapsed || isMobileOpen) && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Director Profile Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div
            className={clsx(
              'flex items-center rounded-md hover:bg-slate-900/60 transition-colors',
              isCollapsed && !isMobileOpen ? 'justify-center p-1' : 'justify-between px-2 py-1.5'
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div
                suppressHydrationWarning
                title={effectiveName ? `${effectiveName} (${roleLabels[userRole] || userRole})` : 'Authenticated Director'}
                className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0"
              >
                {effectiveName ? (
                  getDirectorInitial(effectiveName)
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full bg-slate-700 animate-pulse" />
                )}
              </div>
              {(!isCollapsed || isMobileOpen) && (
                <div suppressHydrationWarning className="truncate flex-1 min-w-0">
                  {effectiveName ? (
                    <>
                      <p className="text-xs font-medium text-white truncate">{effectiveName}</p>
                      <p className="text-[10px] text-blue-400 truncate font-semibold">
                        {roleLabels[userRole] || userRole}
                      </p>
                    </>
                  ) : (
                    <div className="space-y-1 py-0.5">
                      <div className="h-3 w-24 bg-slate-800 rounded animate-pulse" />
                      <div className="h-2 w-14 bg-slate-800 rounded animate-pulse" />
                    </div>
                  )}
                </div>
              )}
            </div>

            {(!isCollapsed || isMobileOpen) && (
              <button
                onClick={onLogout}
                title="Sign out of financial system"
                className="text-slate-400 hover:text-rose-400 p-1.5 rounded transition-colors ml-1 shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
