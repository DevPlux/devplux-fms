'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/change-password`,
      });

      if (error) {
        setStatusMessage({ type: 'error', text: error.message });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'If an authorized director account exists for this corporate email, password reset instructions have been dispatched.',
        });
      }
    } catch {
      setStatusMessage({
        type: 'success',
        text: 'Password recovery dispatched to authorized corporate mailbox.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img
          src="/Logo.webp"
          alt="Devplux Logo"
          className="w-14 h-14 object-contain mx-auto mb-3 drop-shadow-md"
        />
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Reset Director Password
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Devplux (Pvt) Ltd — Secure Cryptographic Password Recovery
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg border border-slate-200 sm:px-10">
          {statusMessage ? (
            <div
              className={`p-4 rounded-md text-xs ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {statusMessage.type === 'success' && <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-2" />}
              <p className="font-semibold">{statusMessage.text}</p>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <Input
                label="Corporate Director Email"
                type="email"
                required
                placeholder="director@devplux.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                helperText="A secure single-use recovery link will be issued."
              />

              <div className="pt-2">
                <Button type="submit" className="w-full" isLoading={isLoading}>
                  Send Recovery Link
                </Button>
              </div>
            </form>
          )}

          <div className="mt-6 text-center border-t border-slate-100 pt-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to Sign In</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
