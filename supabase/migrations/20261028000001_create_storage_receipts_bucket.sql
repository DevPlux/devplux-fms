-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
-- Migration: 20261028000001_create_storage_receipts_bucket.sql
-- Purpose: Provision Supabase Storage Bucket for Bank Transaction Receipts,
--          Invoices, and Payment Proofs with Security Policies.
-- Supported Formats: PDF, JPG, JPEG, PNG, WEBM (Max 25MB).
-- ==============================================================================

-- 1. Create or update the storage bucket for receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    true,
    26214400, -- 25 Megabytes
    ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'video/webm'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
        'application/pdf',
        'image/jpeg',
        'image/jpg',
        'image/png',
        'video/webm'
    ];

-- 2. Storage RLS Policies
-- Allow public viewing of receipts
DROP POLICY IF EXISTS "Public receipts are viewable by anyone" ON storage.objects;
CREATE POLICY "Public receipts are viewable by anyone"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts');

-- Allow authenticated users and anon clients to upload receipts
DROP POLICY IF EXISTS "Allow upload receipts" ON storage.objects;
CREATE POLICY "Allow upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts');

-- Allow updating receipts in bucket
DROP POLICY IF EXISTS "Allow update receipts" ON storage.objects;
CREATE POLICY "Allow update receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'receipts');

-- Allow deletion of receipts
DROP POLICY IF EXISTS "Allow delete receipts" ON storage.objects;
CREATE POLICY "Allow delete receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts');

-- 3. Verify columns exist on financial tables
DO $$
BEGIN
    -- Ensure receipt_url on client_payments
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'client_payments' 
          AND column_name = 'receipt_url'
    ) THEN
        ALTER TABLE public.client_payments ADD COLUMN receipt_url TEXT;
    END IF;

    -- Ensure receipt_url on expenses
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'expenses' 
          AND column_name = 'receipt_url'
    ) THEN
        ALTER TABLE public.expenses ADD COLUMN receipt_url TEXT;
    END IF;

    -- Ensure receipt_url on contractor_invoices
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'contractor_invoices' 
          AND column_name = 'receipt_url'
    ) THEN
        ALTER TABLE public.contractor_invoices ADD COLUMN receipt_url TEXT;
    END IF;
END $$;
