
'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
                                              isOpen,
                                              onClose,
                                              title,
                                              description,
                                              children,
                                              maxWidth = 'md',
                                            }) => {

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Preserve original body overflow
    const originalOverflow = document.body.style.overflow;

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  const modalContent = (
      <div
          className="
        fixed inset-0 z-[9999]
        flex items-center justify-center
        bg-slate-900/50 backdrop-blur-sm
        p-4
        animate-in fade-in duration-200
      "
      >
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={clsx(
                'w-full bg-white rounded-lg shadow-xl',
                'border border-slate-200 overflow-hidden',
                'transform transition-all',
                maxWidths[maxWidth]
            )}
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-slate-900 break-words leading-snug">
                {title}
              </h3>

              {description && (
                  <p className="text-xs text-slate-500 mt-1 break-words leading-relaxed">
                    {description}
                  </p>
              )}
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label="Close modal"
                className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-md hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-6 max-h-[80vh] overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
  );

  // Render directly under body, outside DashboardLayout
  return createPortal(modalContent, document.body);
};
