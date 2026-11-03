
'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Clock } from 'lucide-react';
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
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };

    updateTime();

    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, []);

  const formattedDate = currentTime
      ? currentTime.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      : '-- --- ----';

  const formattedTime = currentTime
      ? currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      : '--:--:--';

  return (
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between shrink-0 sticky top-0 z-10 shadow-xs">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
            {pageTitle}
          </h2>

          {pageDescription && (
              <p className="text-xs text-slate-500 hidden md:block">
                {pageDescription}
              </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Accounting Period Pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-semibold text-slate-900">Period:</span>
            <span>{currentPeriod}</span>
          </div>

          {/* Live Date & Time */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-100 text-xs text-slate-700">
            <Clock className="w-4 h-4 text-blue-600 shrink-0" />

            <div className="flex items-center gap-2">
            <span className="hidden lg:inline text-slate-600 font-medium">
              {formattedDate}
            </span>

              <span className="font-semibold text-blue-800 tabular-nums whitespace-nowrap">
              {formattedTime}
            </span>
            </div>
          </div>
        </div>
      </header>
  );
};
