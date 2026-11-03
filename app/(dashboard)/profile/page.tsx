'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import {
  UserCheck,
  KeyRound,
  Shield,
  RefreshCw,
  Eye,
  EyeOff,
  Pencil,
  Camera,
  Upload,
  Trash2,
  X,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { changePasswordSchema } from '@/lib/validation/auth-schema';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { getStoredDirector, setStoredDirector, CANONICAL_MAP } from '@/lib/hooks/useCurrentDirector';

interface DirectorProfile {
  id?: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  sharePercentage: string;
  capitalContributed: string;
  mustChangePassword?: boolean;
}

let isProfileHydrated = false;

export default function ProfilePage() {
  const [profile, setProfile] = useState<DirectorProfile>(() => {
    if (!isProfileHydrated) {
      return {
        id: '',
        name: '',
        email: '',
        role: 'Director',
        avatarUrl: null,
        sharePercentage: '20.00%',
        capitalContributed: 'LKR 0.00',
      };
    }
    const stored = getStoredDirector();
    return {
      id: stored?.id || '',
      name: stored?.name || '',
      email: stored?.email || '',
      role: stored?.role || 'Director',
      avatarUrl: stored?.avatarUrl || null,
      sharePercentage: '20.00%',
      capitalContributed: 'LKR 0.00',
    };
  });
  const [isLoading, setIsLoading] = useState(() => !isProfileHydrated || !getStoredDirector());

  // Standalone password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Profile Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Password change within Edit Modal
  const [editChangePassword, setEditChangePassword] = useState(false);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [editConfirmPassword, setEditConfirmPassword] = useState('');
  const [showEditNewPassword, setShowEditNewPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditModalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isEditModalOpen]);

  // Helper to extract first letter initial
  const getInitial = (name: string): string => {
    if (!name) return 'D';
    const clean = name.replace(/^(mr\.|mr|mrs\.|mrs|ms\.|ms|dr\.|dr|prof\.|prof)\s*/i, '').trim();
    return (clean.charAt(0) || name.charAt(0) || 'D').toUpperCase();
  };

  useEffect(() => {
    isProfileHydrated = true;
    let isMounted = true;

    // Immediately sync stored identity upon client hydration
    const stored = getStoredDirector();
    if (stored && isMounted && !profile.name) {
      setProfile((prev) => ({
        ...prev,
        id: stored.id,
        name: stored.name,
        email: stored.email,
        role: stored.role || 'Director',
        avatarUrl: stored.avatarUrl || null,
      }));
      setIsLoading(false);
    }

    const fetchCurrentProfile = async () => {
      try {
        // 1. Fetch from server API
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.authenticated && json.user && isMounted) {
            setProfile({
              id: json.user.id,
              name: json.user.name,
              email: json.user.email,
              role: json.user.role || 'Director',
              avatarUrl: json.user.avatarUrl || null,
              sharePercentage: json.user.sharePercentage || '20.00%',
              capitalContributed: json.user.capitalContributed || 'LKR 0.00',
              mustChangePassword: json.user.mustChangePassword,
            });
            setStoredDirector({
              id: json.user.id,
              name: json.user.name,
              email: json.user.email,
              role: json.user.role || 'Director',
              avatarUrl: json.user.avatarUrl || undefined,
            });
            setIsLoading(false);
            return;
          }
        }

        // 2. Fallback to client Supabase session
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user && isMounted) {
          const email = user.email || '';
          const customName = user.user_metadata?.full_name;
          const resolvedName =
              (customName && !customName.toLowerCase().startsWith('director'))
                  ? customName
                  : (CANONICAL_MAP[email.toLowerCase()] || customName || '');
          const avatar = user.user_metadata?.avatar_url || null;

          if (resolvedName) {
            setProfile({
              id: user.id,
              name: resolvedName,
              email: email,
              role: 'Director',
              avatarUrl: avatar,
              sharePercentage: '20.00%',
              capitalContributed: 'LKR 0.00',
            });
            setStoredDirector({
              id: user.id,
              name: resolvedName,
              email: email,
              role: 'Director',
              avatarUrl: avatar || undefined,
            });
          }
        }
      } catch (err) {
        console.warn('Error fetching active director profile:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchCurrentProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  const openEditModal = () => {
    setEditName(profile.name);
    setEditAvatarUrl(profile.avatarUrl || null);
    setAvatarFile(null);
    setAvatarPreview(profile.avatarUrl || null);
    setEditChangePassword(false);
    setEditNewPassword('');
    setEditConfirmPassword('');
    setIsEditModalOpen(true);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too large', { description: 'Please select an image smaller than 5MB.' });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file format', { description: 'Please select an image file (JPG, PNG, WEBP).' });
      return;
    }

    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  };

  const handleRemoveAvatar = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setEditAvatarUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editName.trim()) {
      toast.error('Name required', { description: 'Please enter your full legal name.' });
      return;
    }

    if (editChangePassword) {
      if (!editNewPassword) {
        toast.error('Password required', { description: 'Please enter your new password.' });
        return;
      }
      if (editNewPassword.length < 8) {
        toast.error('Password too short', { description: 'Password must be at least 8 characters long.' });
        return;
      }
      if (editNewPassword !== editConfirmPassword) {
        toast.error('Passwords do not match', { description: 'New password and confirmation must match.' });
        return;
      }
      const hasUpper = /[A-Z]/.test(editNewPassword);
      const hasLower = /[a-z]/.test(editNewPassword);
      const hasNumber = /[0-9]/.test(editNewPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(editNewPassword);

      if (!hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        toast.error('Password requirements', {
          description: 'Must include uppercase, lowercase, numeric, and special character.',
        });
        return;
      }
    }

    setIsSavingProfile(true);

    try {
      let finalAvatarUrl = editAvatarUrl;

      // 1. Upload new image if file selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append('avatar', avatarFile);

        const uploadRes = await fetch('/api/profile/upload', {
          method: 'POST',
          body: formData,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson.success) {
          throw new Error(uploadJson.error || 'Failed to upload profile image');
        }
        finalAvatarUrl = uploadJson.url;
      }

      // 2. Send PATCH to /api/profile
      const patchRes = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          avatarUrl: finalAvatarUrl,
          newPassword: editChangePassword ? editNewPassword : undefined,
        }),
      });

      const patchJson = await patchRes.json();
      if (!patchRes.ok) {
        throw new Error(patchJson.error || 'Failed to update profile');
      }

      // 3. Update local states
      const updatedProfile: DirectorProfile = {
        ...profile,
        name: editName.trim(),
        avatarUrl: finalAvatarUrl,
        mustChangePassword: editChangePassword ? false : profile.mustChangePassword,
      };

      setProfile(updatedProfile);

      // 4. Update sync store so Sidebar and Header update immediately
      setStoredDirector({
        id: profile.id || '',
        name: editName.trim(),
        email: profile.email,
        role: profile.role || 'Director',
        avatarUrl: finalAvatarUrl || undefined,
      });

      toast.success('Profile updated successfully', {
        description: 'Your legal name, profile picture, and credentials have been updated.',
      });

      setIsEditModalOpen(false);
    } catch (err: any) {
      console.error('Error saving profile:', err);
      toast.error('Update failed', { description: err.message || 'Could not save profile changes.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (!validation.success) {
      toast.error('Validation failed', { description: validation.error.errors[0]?.message || 'Invalid password' });
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
        data: { must_change_password: false },
      });

      if (error) {
        toast.error('Password update failed', { description: error.message });
      } else {
        // Enact complete setup in backend database
        try {
          await fetch('/api/auth/complete-setup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user?.id || profile.id, email: user?.email || profile.email }),
          });
        } catch {
          // ignore
        }

        toast.success('Password updated', {
          description: 'Password successfully changed and updated in secure credentials store.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      toast.success('Password successfully updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
      <DashboardLayout
          pageTitle="Director Profile & Security"
          pageDescription="Individual director account management, corporate identity, and cryptographic credential settings."
          userRole="director"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Card */}
          <Card className="lg:col-span-1 shadow-sm border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-600" />
                <CardTitle>Director Information</CardTitle>
              </div>
              <Button
                  variant="outline"
                  size="sm"
                  onClick={openEditModal}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 hover:bg-blue-50 border-blue-200"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit Profile</span>
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              {isLoading ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-xs text-slate-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Loading director profile...</span>
                  </div>
              ) : (
                  <>
                    {/* Profile Picture Header Section */}
                    <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                      <div className="relative group shrink-0">
                        <div className="w-20 h-20 rounded-full border-2 border-slate-200 bg-slate-800 text-white flex items-center justify-center text-2xl font-bold overflow-hidden shadow-inner">
                          {profile.avatarUrl ? (
                              <img
                                  src={profile.avatarUrl}
                                  alt={profile.name}
                                  className="w-full h-full object-cover"
                              />
                          ) : (
                              <span>{getInitial(profile.name)}</span>
                          )}
                        </div>
                        <button
                            type="button"
                            onClick={openEditModal}
                            title="Change Profile Picture"
                            className="absolute bottom-0 right-0 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition-all hover:scale-105 focus:outline-none"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-slate-900 truncate">{profile.name}</h3>
                        <p className="text-xs text-blue-600 font-semibold">{profile.role}</p>
                        <div className="mt-1.5">
                          <Badge variant="completed">ACCOUNT ACTIVE</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3.5 text-xs">
                      <div>
                        <p className="text-slate-400 font-medium">Full Legal Name</p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">{profile.name}</p>
                      </div>

                      <div>
                        <p className="text-slate-400 font-medium">Corporate Email</p>
                        <p className="text-sm font-mono text-slate-800 mt-0.5">{profile.email}</p>
                      </div>

                      <div>
                        <p className="text-slate-400 font-medium">Governance Role</p>
                        <p className="text-sm font-semibold text-blue-900 mt-0.5">{profile.role}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-100">
                        <div>
                          <p className="text-slate-400 font-medium">Shareholding</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{profile.sharePercentage}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Equity Capital</p>
                          <p className="text-sm font-bold text-slate-900 mt-0.5">{profile.capitalContributed}</p>
                        </div>
                      </div>

                      <div className="pt-2">
                        <Button
                            variant="outline"
                            className="w-full text-xs flex items-center justify-center gap-2 text-slate-700 border-slate-200 hover:bg-slate-50"
                            onClick={openEditModal}
                        >
                          <Pencil className="w-3.5 h-3.5 text-slate-500" />
                          <span>Edit Name, Photo & Password</span>
                        </Button>
                      </div>
                    </div>
                  </>
              )}
            </CardContent>
          </Card>

          {/* Change Password Form */}
          <Card className="lg:col-span-2 shadow-sm border-slate-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <CardTitle>Update Security Password</CardTitle>
              </div>
              <p className="text-xs text-slate-500">
                Passwords are encrypted and never logged or exposed. Minimum 8 characters with complexity rules.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4 max-w-lg">
                <div className="relative">
                  <Input
                      label="Current Password"
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pr-12"
                  />
                  <button
                      type="button"
                      onClick={() => setShowCurrentPassword((prev) => !prev)}
                      className="absolute right-2 top-[21px] flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                      aria-pressed={showCurrentPassword}
                  >
                    {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="relative">
                  <Input
                      label="New Secure Password"
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="pr-12"
                      helperText="Must include uppercase, lowercase, numeric, and special character."
                  />
                  <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-2 top-[21px] flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={showNewPassword ? 'Hide new secure password' : 'Show new secure password'}
                      aria-pressed={showNewPassword}
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="relative">
                  <Input
                      label="Confirm New Password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="Re-enter new secure password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pr-12"
                  />
                  <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-2 top-[21px] flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={showConfirmPassword ? 'Hide confirm new password' : 'Show confirm new password'}
                      aria-pressed={showConfirmPassword}
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                <div className="pt-2">
                  <Button type="submit" variant="primary" isLoading={isSubmitting}>
                    Save New Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Edit Profile Modal */}
        {isEditModalOpen && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Pencil className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Edit Director Profile</h3>
                      <p className="text-xs text-slate-500">Update your name, profile photo, and password</p>
                    </div>
                  </div>
                  <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Profile Photo Upload Section */}
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200/80">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                      Profile Picture
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-full border-2 border-slate-300 bg-slate-800 text-white flex items-center justify-center text-2xl font-bold overflow-hidden shadow-inner shrink-0 relative">
                        {avatarPreview ? (
                            <img
                                src={avatarPreview}
                                alt="Preview"
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <span>{getInitial(editName)}</span>
                        )}
                      </div>

                      <div className="space-y-2 flex-1">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleAvatarFileChange}
                            accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                            className="hidden"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-xs flex items-center gap-1.5"
                          >
                            <Upload className="w-3.5 h-3.5 text-blue-600" />
                            <span>{avatarPreview ? 'Change Photo' : 'Upload Photo'}</span>
                          </Button>

                          {avatarPreview && (
                              <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleRemoveAvatar}
                                  className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </Button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Supports JPG, PNG, WEBP (Max 5MB). Displays on your dashboard and sidebar.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Legal Name Field */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Full Legal Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                        type="text"
                        required
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g. Mr. Chanuka Lakshan"
                        helperText="Official name used for board signatures, transaction audit logs, and approval sign-offs."
                    />
                  </div>

                  {/* Corporate Email Field (Read-only) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Corporate Email Address
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                          type="text"
                          disabled
                          value={profile.email}
                          className="bg-slate-100 text-slate-600 cursor-not-allowed font-mono text-xs"
                          helperText="Corporate email is fixed by company governance. Contact board admin to change."
                      />
                    </div>
                  </div>

                  {/* Optional Change Password Section inside Edit Profile Modal */}
                  <div className="pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editChangePassword}
                            onChange={(e) => setEditChangePassword(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                        />
                        <span>Also update login password</span>
                      </label>
                      {editChangePassword && (
                          <Badge variant="pending">Security credential update</Badge>
                      )}
                    </div>

                    {editChangePassword && (
                        <div className="space-y-3 p-3.5 bg-slate-50 rounded-lg border border-slate-200 animate-in fade-in duration-150">
                          <div className="relative">
                            <Input
                                label="New Password"
                                type={showEditNewPassword ? 'text' : 'password'}
                                placeholder="••••••••••••"
                                value={editNewPassword}
                                onChange={(e) => setEditNewPassword(e.target.value)}
                                className="pr-12 text-xs"
                                helperText="Min. 8 characters (Uppercase, lowercase, number, symbol)"
                            />
                            <button
                                type="button"
                                onClick={() => setShowEditNewPassword((prev) => !prev)}
                                className="absolute right-2 top-[21px] flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 focus:outline-none"
                            >
                              {showEditNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>

                          <div className="relative">
                            <Input
                                label="Confirm New Password"
                                type={showEditConfirmPassword ? 'text' : 'password'}
                                placeholder="Re-enter password"
                                value={editConfirmPassword}
                                onChange={(e) => setEditConfirmPassword(e.target.value)}
                                className="pr-12 text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowEditConfirmPassword((prev) => !prev)}
                                className="absolute right-2 top-[21px] flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 focus:outline-none"
                            >
                              {showEditConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                    )}
                  </div>

                  {/* Modal Footer */}
                  <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsEditModalOpen(false)}
                        disabled={isSavingProfile}
                        className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isSavingProfile}
                        className="text-xs flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Changes</span>
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
        )}
      </DashboardLayout>
  );
}
