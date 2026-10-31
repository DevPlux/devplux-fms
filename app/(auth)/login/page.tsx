'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { setStoredDirector, CANONICAL_MAP } from '@/lib/hooks/useCurrentDirector';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || 'Invalid corporate credentials.');
        setIsLoading(false);
        return;
      }

      if (data.user) {
        const cleanEmail = email.trim().toLowerCase();
        const canonicalName = CANONICAL_MAP[cleanEmail] || data.user.user_metadata?.full_name || '';

        // Query profile to inspect first-login password change mandate
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, must_change_password, role')
          .eq('id', data.user.id)
          .maybeSingle();

        const resolvedName = canonicalName || profile?.full_name || 'Director';

        // Pre-seed in-memory & localStorage cache synchronously before route push
        setStoredDirector({
          id: data.user.id,
          name: resolvedName,
          email: cleanEmail,
          role: profile?.role || 'Director',
        });

        // Display corporate authorization success feedback
        setSuccessMessage(`Login successful! Welcome, ${resolvedName}. Redirecting to ledger...`);

        setTimeout(() => {
          if (profile?.must_change_password) {
            router.push('/change-password');
          } else {
            router.push('/dashboard');
          }
        }, 800);
      }
    } catch {
      setError('An unexpected connection error occurred. Please verify network status.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <img
          src="/Logo.webp"
          alt="Devplux Logo"
          className="w-16 h-16 object-contain mx-auto mb-2 drop-shadow-md"
        />
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          DEVPLUX (PVT) LTD
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Executive Financial Management System & Corporate Ledger
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg border border-slate-200 sm:px-10">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600 mb-6">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Authorized access restricted to Devplux directors only.</span>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-md bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-xs text-emerald-800 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="font-medium">
                <span>{successMessage}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Director Corporate Email"
              type="email"
              required
              disabled={Boolean(successMessage) || isLoading}
              placeholder="e.g. director1@devplux.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <Input
              label="Password"
              type="password"
              required
              disabled={Boolean(successMessage) || isLoading}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full"
                isLoading={isLoading}
                disabled={Boolean(successMessage)}
              >
                {successMessage ? 'Authorized ✓ Redirecting...' : 'Authenticate as Director'}
              </Button>
            </div>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4 text-center">
            <p className="text-[11px] text-slate-400">
              Devplux (Pvt) Ltd | Multi-Director Governance
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
