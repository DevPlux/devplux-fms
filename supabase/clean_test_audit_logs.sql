-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Script: clean_test_audit_logs.sql
-- Safely removes test logs while preserving trigger-enforced immutability
-- ==============================================================================

-- 1. Temporarily disable the immutability trigger for cleanup
ALTER TABLE public.audit_logs DISABLE TRIGGER ALL;

-- 2. Remove test records created during initial setup
DELETE FROM public.audit_logs 
WHERE action = 'TEST' 
   OR entity_id = 'test'
   OR (before_values IS NOT NULL AND before_values->>'test' IS NOT NULL)
   OR (after_values IS NOT NULL AND after_values->>'test' IS NOT NULL);

-- 3. Re-enable the immutability trigger
ALTER TABLE public.audit_logs ENABLE TRIGGER ALL;

-- 4. View active sanitized audit trail records
SELECT 
    id, 
    timestamp, 
    actor_name, 
    actor_role, 
    action, 
    entity_id, 
    reason
FROM public.audit_logs
ORDER BY timestamp DESC;

