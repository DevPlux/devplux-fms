'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { KeyRound, CheckCircle, AlertCircle } from 'lucide-react';
import { changePasswordSchema } from '@/lib/validation/auth-schema';
import { setStoredDirector, CANONICAL_MAP } from '@/lib/hooks/useCurrentDirector';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate using Zod schema
    const validation = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validation.success) {
      setError(validation.error.errors[0]?.message || 'Invalid password format');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('Your session has expired. Please sign in again.');
        setIsLoading(false);
        router.push('/login');
        return;
      }

      // 1. Update auth password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false },
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
        setIsLoading(false);
        return;
      }

      // 2. Clear must_change_password flag via secure server API (bypasses RLS limits)
      try {
        await fetch('/api/auth/complete-setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, email: user.email }),
        });
      } catch (syncErr) {
        console.warn('API sync notice:', syncErr);
      }

      // 3. Fallback client-side update
      try {
        await supabase
          .from('profiles')
          .update({
            must_change_password: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      } catch (profileErr) {
        console.warn('Direct profile update notice:', profileErr);
      }

      const cleanEmail = (user.email || '').trim().toLowerCase();
      const canonicalName = CANONICAL_MAP[cleanEmail] || user.user_metadata?.full_name || '';
      if (canonicalName) {
        setStoredDirector({
          id: user.id,
          name: canonicalName,
          email: cleanEmail,
          role: 'Director',
        });
      }

      setSuccess(true);
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    } catch {
      setError('An unexpected error occurred. Please try again.');
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
          First-Login Password Setup
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Corporate governance requires all directors to replace their initial temporary password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-lg border border-slate-200 sm:px-10">
          {success ? (
            <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-emerald-900">
                Password Successfully Updated
              </h3>
              <p className="text-xs text-emerald-700 mt-1">
                Redirecting to executive financial dashboard...
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 rounded-md bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Temporary / Current Password"
                  type="password"
                  required
                  placeholder="Enter initial password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />

                <Input
                  label="New Secure Password"
                  type="password"
                  required
                  placeholder="Minimum 8 characters with symbols & numbers"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  helperText="Must contain uppercase, lowercase, number, and special character."
                />

                <Input
                  label="Confirm New Password"
                  type="password"
                  required
                  placeholder="Re-enter new secure password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />

                <div className="pt-2">
                  <Button type="submit" className="w-full" isLoading={isLoading}>
                    Enact Password & Access Dashboard
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
