
'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  setStoredDirector,
  CANONICAL_MAP,
} from '@/lib/hooks/useCurrentDirector';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLoading) return;

    setIsLoading(true);

    let navigationStarted = false;

    try {
      const supabase = createClient();

      // Original authentication logic
      const { data, error: authError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

      if (authError) {
        toast.error('Authentication failed', {
          description:
              authError.message ||
              'Invalid corporate credentials.',
        });
        return;
      }

      if (data.user) {
        // Original email and canonical name resolution
        const cleanEmail = email.trim().toLowerCase();

        const canonicalName =
            CANONICAL_MAP[cleanEmail] ||
            data.user.user_metadata?.full_name ||
            '';

        // Original profile query
        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, must_change_password, role')
            .eq('id', data.user.id)
            .maybeSingle();

        const resolvedName =
            canonicalName ||
            profile?.full_name ||
            'Director';

        // Original director cache logic
        setStoredDirector({
          id: data.user.id,
          name: resolvedName,
          email: cleanEmail,
          role: profile?.role || 'Director',
        });

        // Sonner success notification
        toast.success('Login successful', {
          description: `Welcome, ${resolvedName}! Redirecting to ledger...`,
          duration: 4000,
        });

        // Preserve original redirect behavior
        navigationStarted = true;

        setTimeout(() => {
          if (profile?.must_change_password) {
            router.push('/change-password');
          } else {
            router.push('/dashboard');
          }
        }, 800);

      } else {
        toast.error('Authentication failed', {
          description: 'Unable to verify your account.',
        });
      }

    } catch (error) {
      console.error('Login error:', error);

      toast.error('Connection error', {
        description:
            'An unexpected connection error occurred. Please verify network status.',
      });

    } finally {
      // Keep spinner active after successful login
      // until the login page unmounts.
      if (!navigationStarted) {
        setIsLoading(false);
      }
    }
  };

  return (
      <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-slate-900 px-4 py-12 sm:px-6 lg:px-8">

        {/* Subtle corporate grid */}
        <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage: `
            linear-gradient(to right, #94A3B8 1px, transparent 1px),
            linear-gradient(to bottom, #94A3B8 1px, transparent 1px)
          `,
              backgroundSize: '64px 64px',
              maskImage:
                  'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
              WebkitMaskImage:
                  'linear-gradient(to bottom, transparent, black 25%, black 75%, transparent)',
            }}
        />

        {/* Company branding */}
        <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center">
          <img
              src="/Logo.webp"
              alt="DevPlux Logo"
              className="mx-auto mb-2 h-16 w-16 object-contain drop-shadow-md"
          />

          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
            DEVPLUX (PVT) LTD
          </h2>

          <p className="mt-1 text-xs text-slate-400">
            Executive Financial Management System & Corporate Ledger
          </p>
        </div>

        {/* Login card */}
        <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-xl sm:px-10">

            {/* Security notice */}
            <div className="mb-6 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <ShieldCheck className="h-4 w-4 shrink-0 text-blue-600" />

              <span>
              Authorized access restricted to DevPlux directors only.
            </span>
            </div>

            {/* Login form */}
            <form onSubmit={handleLogin} className="space-y-4">

              {/* Email */}
              <Input
                  label="Director Corporate Email"
                  type="email"
                  required
                  disabled={isLoading}
                  autoComplete="username"
                  placeholder="e.g. director1@devplux.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
              />

              {/* Password */}
              <div className="relative">
                <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    disabled={isLoading}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-12"
                />

                {/* Password visibility */}
                <button
                    type="button"
                    onClick={() =>
                        setShowPassword((prev) => !prev)
                    }
                    disabled={isLoading}
                    className="absolute bottom-1 right-2 rounded p-1 text-slate-400 transition-colors hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={
                      showPassword
                          ? 'Hide password'
                          : 'Show password'
                    }
                    aria-pressed={showPassword}
                    title={
                      showPassword
                          ? 'Hide password'
                          : 'Show password'
                    }
                >
                  {showPassword ? (
                      <EyeOff className="h-5 w-5" />
                  ) : (
                      <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Login button */}
              <div className="pt-2">
                <Button
                    type="submit"
                    className="w-full"
                    isLoading={isLoading}
                    disabled={isLoading}
                >
                  {isLoading
                      ? 'Authenticating...'
                      : 'Authenticate as Director'}
                </Button>
              </div>

            </form>

            {/* Footer */}
            <div className="mt-6 border-t border-slate-100 pt-4 text-center">
              <p className="text-[11px] text-slate-400">
                DevPlux (Pvt) Ltd | Multi-Director Governance
              </p>
            </div>

          </div>
        </div>

      </div>
  );
}
