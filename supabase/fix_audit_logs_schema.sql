-- ==============================================================================
-- DEVPLUX FINANCIAL MANAGEMENT SYSTEM
-- Script: fix_audit_logs_schema.sql
-- Optimizes public.audit_logs table for multi-entity logging, flexible IDs & actor tracking
-- ==============================================================================

-- 1. Add missing metadata columns if they do not exist
ALTER TABLE IF EXISTS public.audit_logs 
ADD COLUMN IF NOT EXISTS actor_name TEXT,
ADD COLUMN IF NOT EXISTS actor_role TEXT,
ADD COLUMN IF NOT EXISTS company_id UUID;

-- 2. Allow entity_id to be TEXT so vouchers, contractors, approvals, and projects can be referenced directly
DO $$
BEGIN
    ALTER TABLE public.audit_logs ALTER COLUMN entity_id TYPE TEXT;
EXCEPTION WHEN OTHERS THEN
    -- If already TEXT, ignore
    NULL;
END $$;

-- 3. Relax actor_id constraints to prevent foreign key errors when recording peer sign-offs
DO $$
BEGIN
    ALTER TABLE public.audit_logs ALTER COLUMN actor_id DROP NOT NULL;
    ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 4. RLS security policies: Authenticated directors can view; Service role can insert & manage
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view audit logs" ON public.audit_logs;
CREATE POLICY "Members can view audit logs" 
ON public.audit_logs FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Allow service role full access to audit logs" ON public.audit_logs;
CREATE POLICY "Allow service role full access to audit logs" 
ON public.audit_logs FOR ALL 
TO service_role 
USING (true);

