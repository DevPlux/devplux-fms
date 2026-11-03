-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Script: create_contractors.sql
-- Upgrades public.contractors table and adds project-based payable tracking columns
-- ==============================================================================

-- 1. Create table if it doesn't exist at all
CREATE TABLE IF NOT EXISTS public.contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    skill_set TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Safely add any missing columns to existing or newly created table
DO $$
BEGIN
    -- project_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;

    -- project_display_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'project_display_id'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN project_display_id VARCHAR(100);
    END IF;

    -- agreed_fee
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'agreed_fee'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN agreed_fee NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- invoiced_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'invoiced_total'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN invoiced_total NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- paid_total
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'paid_total'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN paid_total NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- outstanding_payable
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'outstanding_payable'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN outstanding_payable NUMERIC(15, 2) DEFAULT 0;
    END IF;

    -- receipt_url
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'receipt_url'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN receipt_url TEXT;
    END IF;

    -- status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN status VARCHAR(50) DEFAULT 'active';
    END IF;

    -- updated_at
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.contractors 
        ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. Synchronize existing columns if legacy columns exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'contractors' AND column_name = 'default_agreed_fee'
    ) THEN
        EXECUTE 'UPDATE public.contractors SET agreed_fee = COALESCE(agreed_fee, default_agreed_fee, 0) WHERE agreed_fee IS NULL OR agreed_fee = 0';
    END IF;
END $$;

UPDATE public.contractors
SET 
    invoiced_total = CASE 
        WHEN invoiced_total IS NULL OR invoiced_total = 0 
        THEN COALESCE(agreed_fee, 0) 
        ELSE invoiced_total 
    END,
    outstanding_payable = CASE 
        WHEN outstanding_payable IS NULL OR outstanding_payable = 0 
        THEN GREATEST(0, COALESCE(agreed_fee, 0) - COALESCE(paid_total, 0))
        ELSE outstanding_payable 
    END,
    status = COALESCE(status, 'active')
WHERE invoiced_total IS NULL OR status IS NULL OR outstanding_payable IS NULL;

-- 4. Enable Row Level Security and configure open access policy
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on contractors" ON public.contractors;
CREATE POLICY "Allow all on contractors"
    ON public.contractors
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Safe index creation
CREATE INDEX IF NOT EXISTS idx_contractors_company ON public.contractors(company_id);
CREATE INDEX IF NOT EXISTS idx_contractors_project ON public.contractors(project_id);
CREATE INDEX IF NOT EXISTS idx_contractors_status ON public.contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractors_created ON public.contractors(created_at DESC);
