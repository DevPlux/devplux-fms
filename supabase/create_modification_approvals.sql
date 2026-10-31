-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Script: create_modification_approvals.sql
-- Creates the modification_approvals table for board director reviews
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.modification_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    entity_reference VARCHAR(100),
    entity_name VARCHAR(255),
    action_type VARCHAR(20) NOT NULL,
    initiator_id UUID,
    initiator_name VARCHAR(255) NOT NULL,
    initiator_role VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID,
    reviewer_name VARCHAR(255),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.modification_approvals ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users and service role full access
DROP POLICY IF EXISTS "Allow all on modification_approvals" ON public.modification_approvals;
CREATE POLICY "Allow all on modification_approvals"
    ON public.modification_approvals
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for speedy queries on status and entity
CREATE INDEX IF NOT EXISTS idx_modification_approvals_status ON public.modification_approvals(status);
CREATE INDEX IF NOT EXISTS idx_modification_approvals_created ON public.modification_approvals(created_at DESC);

