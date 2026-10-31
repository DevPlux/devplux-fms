-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Script: update_all_directors_role.sql
-- Sets Assigned Governance Role to 'director' for all Board Directors
-- ==============================================================================

-- 1. Update all profiles to have the equal governance role: 'director'
UPDATE public.profiles
SET role = 'director'
WHERE role IN ('managing_director', 'finance_director') OR role IS NULL;

-- 2. Verify all 5 directors have the role 'director'
SELECT 
    id,
    full_name,
    email,
    role AS assigned_governance_role,
    is_active,
    created_at
FROM public.profiles
ORDER BY full_name ASC;

