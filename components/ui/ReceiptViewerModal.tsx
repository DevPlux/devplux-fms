'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ExternalLink,
  Download,
  FileText,
  Image as ImageIcon,
  Video,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ShieldCheck,
  Calendar,
  Building,
} from 'lucide-react';
import { getReceiptFileType } from '@/lib/supabase/storage';
import { formatLKR, formatDate } from '@/lib/formatting/formatters';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptUrl: string | null;
  title?: string;
  referenceNo?: string;
  date?: string;
  amount?: number;
  entityName?: string;
  type?: string;
}

export function ReceiptViewerModal({
                                     isOpen,
                                     onClose,
                                     receiptUrl,
                                     title = 'Bank Transaction Receipt Slip',
                                     referenceNo,
                                     date,
                                     amount,
                                     entityName,
                                     type,
                                   }: ReceiptViewerModalProps) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || !receiptUrl) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, receiptUrl, onClose]);

  if (!isMounted || !isOpen || !receiptUrl) return null;

  const fileType = getReceiptFileType(receiptUrl);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };

  return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-xs animate-in fade-in duration-200">
        <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Modal Top Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:px-6 border-b border-slate-200 bg-slate-50/80 gap-3">
            <div>
              <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded">
                <ShieldCheck className="w-3 h-3 text-emerald-700" />
                Verified Receipt
              </span>
                {referenceNo && (
                    <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {referenceNo}
                </span>
                )}
                {type && (
                    <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wide">
                  • {type}
                </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                {entityName && (
                    <span className="text-xs text-slate-500 flex items-center gap-1 font-medium">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                      {entityName}
                </span>
                )}
                {date && (
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDate(date)}
                </span>
                )}
                {amount !== undefined && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {formatLKR(amount)}
                </span>
                )}
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1.5 rounded-md transition-colors shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>Open in New Tab</span>
              </a>

              <a
                  href={receiptUrl}
                  download
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1.5 rounded-md transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Download</span>
              </a>

              <button
                  onClick={onClose}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors ml-1"
                  aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content Viewer Body */}
          <div className="relative flex-1 p-4 sm:p-6 overflow-auto bg-slate-900/5 flex flex-col items-center justify-center min-h-[450px]">
            {/* 1. PDF Viewer */}
            {fileType === 'pdf' && (
                <div className="w-full h-full flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-t-lg border-t border-x border-slate-200">
                <span className="flex items-center gap-1.5 font-medium">
                  <FileText className="w-4 h-4 text-rose-600" />
                  PDF Transaction Document
                </span>
                    <span className="text-[11px] text-slate-400 font-mono">Adobe Acrobat / PDF Standard</span>
                  </div>
                  <iframe
                      src={`${receiptUrl}#toolbar=1`}
                      className="w-full h-[620px] rounded-b-lg border border-slate-200 shadow-md bg-white"
                      title="PDF Receipt Document Viewer"
                  />
                </div>
            )}

            {/* 2. Image Viewer (JPG, JPEG, PNG) */}
            {fileType === 'image' && (
                <div className="w-full flex flex-col items-center">
                  {/* Image Controls Floating Toolbar */}
                  <div className="flex items-center gap-1 mb-3 bg-white/90 backdrop-blur-xs px-3 py-1.5 rounded-full border border-slate-200 shadow-sm z-10">
                    <button
                        onClick={handleZoomIn}
                        className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                        title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleZoomOut}
                        className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                        title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleRotate}
                        className="p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-full"
                        title="Rotate 90deg"
                    >
                      <RotateCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleResetZoom}
                        className="text-xs px-2 py-0.5 text-slate-600 hover:text-slate-900 font-medium"
                    >
                      Reset ({Math.round(zoomLevel * 100)}%)
                    </button>
                  </div>

                  {/* Scalable Image Container */}
                  <div className="w-full max-h-[620px] overflow-auto flex items-center justify-center p-2 rounded-lg bg-slate-950/5 border border-slate-200/80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={receiptUrl}
                        alt={title}
                        style={{
                          transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                          transition: 'transform 0.2s ease-out',
                        }}
                        className="max-h-[580px] max-w-full object-contain rounded shadow-lg bg-white"
                    />
                  </div>
                </div>
            )}

            {/* 3. Video Viewer (WEBM) */}
            {fileType === 'video' && (
                <div className="w-full flex flex-col items-center">
                  <div className="w-full flex items-center justify-between text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-t-lg border-t border-x border-slate-200">
                <span className="flex items-center gap-1.5 font-medium">
                  <Video className="w-4 h-4 text-indigo-600" />
                  WEBM Video Slip / Transaction Screen Recording
                </span>
                    <span className="text-[11px] text-slate-400 font-mono">HTML5 Video</span>
                  </div>
                  <div className="w-full bg-black rounded-b-lg overflow-hidden flex items-center justify-center shadow-lg border border-slate-200">
                    <video
                        src={receiptUrl}
                        controls
                        playsInline
                        className="w-full max-h-[580px] bg-black"
                    >
                      Your browser does not support the WEBM video tag.
                    </video>
                  </div>
                </div>
            )}

            {/* 4. Other / Fallback */}
            {fileType === 'other' && (
                <div className="text-center p-8 bg-white rounded-lg border border-slate-200 shadow-sm max-w-md">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-slate-900">Document Available</h4>
                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    This document is saved in Supabase Storage. You can download or view it in a new browser window.
                  </p>
                  <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-slate-900 text-white text-xs px-4 py-2 rounded-md font-medium hover:bg-slate-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open File Directly
                  </a>
                </div>
            )}
          </div>

          {/* Modal Bottom Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 border-t border-slate-200 bg-white text-xs text-slate-500 gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Supabase Cloud Storage • Encrypted at rest • Bucket: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">receipts</code></span>
            </div>
            <button
                onClick={onClose}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition-colors text-xs"
            >
              Close Viewer
            </button>
          </div>
        </div>
      </div>
      , document.body
  );
}
