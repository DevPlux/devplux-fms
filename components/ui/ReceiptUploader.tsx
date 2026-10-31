'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Video,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import {
  uploadReceiptToStorage,
  getReceiptFileType,
  formatFileSize,
  ReceiptUploadResult,
} from '@/lib/supabase/storage';

interface ReceiptUploaderProps {
  value?: string | null;
  onChange: (url: string, fileMeta?: { fileName: string; fileSize: number; mimeType: string }) => void;
  onRemove?: () => void;
  folder?: 'income' | 'expenses' | 'projects' | 'general';
  bucket?: string;
  onUploadSuccess?: (url: string) => void;
  label?: string;
  helperText?: string;
  required?: boolean;
}

export function ReceiptUploader({
  value,
  onChange,
  onRemove,
  folder = 'general',
  bucket,
  onUploadSuccess,
  label = 'Bank Transaction Receipt / Slip',
  helperText = 'Attach proof of transaction (PDF, JPG, JPEG, PNG, WEBM up to 25MB)',
  required = false,
}: ReceiptUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedMeta, setUploadedMeta] = useState<{
    fileName: string;
    fileSize: number;
    mimeType: string;
    isMockFallback?: boolean;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setError(null);

    // Validate size (25MB)
    if (file.size > 25 * 1024 * 1024) {
      setError('File size exceeds the 25MB limit.');
      return;
    }

    // Validate format
    const name = file.name.toLowerCase();
    const isAllowed =
      name.endsWith('.pdf') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.png') ||
      name.endsWith('.webm') ||
      file.type === 'application/pdf' ||
      file.type.startsWith('image/') ||
      file.type.includes('webm');

    if (!isAllowed) {
      setError('Invalid format. Only PDF, JPG, JPEG, PNG, and WEBM files are accepted.');
      return;
    }

    try {
      setIsUploading(true);
      const result: ReceiptUploadResult = await uploadReceiptToStorage(file, { folder });

      if (result.success && result.url) {
        setUploadedMeta({
          fileName: result.fileName,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
          isMockFallback: result.isMockFallback,
        });
        onChange(result.url, {
          fileName: result.fileName,
          fileSize: result.fileSize,
          mimeType: result.mimeType,
        });
        if (onUploadSuccess) {
          onUploadSuccess(result.url);
        }
      } else {
        setError('Failed to upload receipt. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error uploading file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedMeta(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onRemove) {
      onRemove();
    } else {
      onChange('');
    }
  };

  const fileType = getReceiptFileType(value || '', uploadedMeta?.mimeType);

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[10px] text-slate-400 font-mono">PDF • JPG • PNG • WEBM</span>
        </div>
      )}

      {/* Upload Box or Attached Preview */}
      {value ? (
        <div className="relative flex items-center justify-between p-3 bg-slate-50 border border-emerald-200 rounded-lg group transition-all">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-md bg-white border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
              {fileType === 'pdf' ? (
                <FileText className="w-5 h-5 text-rose-500" />
              ) : fileType === 'video' ? (
                <Video className="w-5 h-5 text-indigo-500" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={value}
                  alt="Receipt Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to icon if preview fails
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {uploadedMeta?.fileName || 'Attached Receipt Slip'}
                </p>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <span className="uppercase font-mono text-[10px] bg-slate-200 px-1 py-0.2 rounded font-semibold text-slate-700">
                  {fileType}
                </span>
                {uploadedMeta?.fileSize ? <span>• {formatFileSize(uploadedMeta.fileSize)}</span> : null}
                <span className="text-emerald-700 font-medium">• Supabase Storage</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 transition-colors"
            >
              Preview
            </a>
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-slate-900 bg-slate-100/70'
              : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileSelect(e.target.files[0]);
              }
            }}
            accept=".pdf,.jpg,.jpeg,.png,.webm,application/pdf,image/jpeg,image/png,video/webm"
            className="hidden"
          />

          {isUploading ? (
            <div className="flex flex-col items-center justify-center py-2">
              <Loader2 className="w-6 h-6 text-slate-900 animate-spin mb-2" />
              <p className="text-xs font-semibold text-slate-900">Uploading to Supabase Storage...</p>
              <p className="text-[11px] text-slate-500">Encrypting & generating verifiable URL</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 mb-2 shadow-2xs">
                <UploadCloud className="w-5 h-5 text-slate-700" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                <span className="text-slate-900 underline underline-offset-2">Click to upload</span> or drag and drop
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bank transaction slip, deposit slip, or invoice proof
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 font-medium">
                  PDF
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 font-medium">
                  JPG / JPEG
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 font-medium">
                  PNG
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 font-medium">
                  WEBM
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2 rounded border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {helperText && !error && !value && (
        <p className="text-[11px] text-slate-400">{helperText}</p>
      )}
    </div>
  );
}
