import React from 'react';
import { clsx } from 'clsx';

export type BadgeVariant =
  | 'pending'
  | 'completed'
  | 'approved'
  | 'rejected'
  | 'danger'
  | 'posted'
  | 'reversed'
  | 'draft'
  | 'open'
  | 'closed'
  | 'neutral'
  | 'info'
  | 'proposed'
  | 'finalized'
  | 'paid';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  className,
}) => {
  const styles: Record<BadgeVariant, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    approved: 'bg-blue-50 text-blue-700 border-blue-200',
    rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    posted: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
    reversed: 'bg-slate-100 text-slate-600 border-slate-300 line-through',
    draft: 'bg-slate-100 text-slate-700 border-slate-200',
    open: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    closed: 'bg-purple-50 text-purple-700 border-purple-200',
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    info: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    proposed: 'bg-amber-50 text-amber-800 border-amber-300',
    finalized: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold',
    paid: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
        styles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
