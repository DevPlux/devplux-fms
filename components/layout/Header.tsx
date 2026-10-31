'use client';

import React from 'react';
import { Calendar, ShieldCheck } from 'lucide-react';
import { DirectorRole } from '@/types/financial';

interface HeaderProps {
  pageTitle: string;
  pageDescription?: string;
  userRole?: DirectorRole;
  currentPeriod?: string;
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  pageDescription,
  currentPeriod = 'October 2026 (Open)',
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-xs">
      <div>
        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">{pageTitle}</h2>
        {pageDescription && (
          <p className="text-xs text-slate-500 hidden md:block">{pageDescription}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Accounting Period Pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="font-semibold text-slate-900">Period:</span>
          <span>{currentPeriod}</span>
        </div>

        {/* Security Status Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="hidden xs:inline">RLS Active</span>
        </div>
      </div>
    </header>
  );
};
