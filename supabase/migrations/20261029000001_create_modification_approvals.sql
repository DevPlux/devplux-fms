-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Migration: 20261029000001_create_modification_approvals.sql
-- Director Approval & Acknowledgement Queue for Updates and Deletions
-- Post-action optimistic approval model: Real-time execution with peer oversight
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.modification_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'client_payment', 'expense')),
    entity_id TEXT NOT NULL,
    entity_reference TEXT NOT NULL,
    entity_name TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK (action_type IN ('update', 'delete')),
    initiator_id UUID REFERENCES public.profiles(id),
    initiator_name TEXT NOT NULL,
    initiator_role TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES public.profiles(id),
    reviewer_name TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for speedy approval queries
CREATE INDEX IF NOT EXISTS idx_mod_approvals_status_created 
ON public.modification_approvals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mod_approvals_entity 
ON public.modification_approvals (entity_type, entity_id);

