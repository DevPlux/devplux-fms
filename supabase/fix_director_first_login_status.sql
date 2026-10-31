-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Script: fix_director_first_login_status.sql
-- Synchronizes Board of Directors status, names, and RLS policies in Supabase
-- ==============================================================================

-- 1. Ensure must_change_password column exists on public.profiles
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'must_change_password'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN must_change_password BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- 2. Ensure RLS Policy allows users to update their own profile record (e.g. clearing password setup flag)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- 3. Synchronize canonical director names, roles, and emails
UPDATE public.profiles
SET full_name = 'MR. Chanuka', role = 'director'
WHERE email = 'director1@devplux.com';

UPDATE public.profiles
SET full_name = 'MR. Lakindu', role = 'director'
WHERE email = 'director2@devplux.com';

UPDATE public.profiles
SET full_name = 'MR. Janindu', role = 'director'
WHERE email = 'director3@devplux.com';

UPDATE public.profiles
SET full_name = 'Mr. Harsha', role = 'director'
WHERE email = 'director4@devplux.com';

UPDATE public.profiles
SET full_name = 'Mr. Amila', role = 'director'
WHERE email = 'director5@devplux.com';

-- 4. Verify live director governance status
SELECT 
    id,
    full_name,
    email,
    role AS assigned_governance_role,
    must_change_password,
    CASE 
        WHEN must_change_password = FALSE THEN 'ENACTED'
        ELSE 'SETUP REQUIRED'
    END AS setup_status,
    is_active,
    updated_at
FROM public.profiles
ORDER BY email ASC;

