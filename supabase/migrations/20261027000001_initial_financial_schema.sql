-- ==============================================================================
-- DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM DATABASE SCHEMA
-- Migration: 20261027000001_initial_financial_schema.sql
-- Conforms to double-entry accounting, auditability, RLS, and concurrency safety.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. COMPANIES & GOVERNANCE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    registration_no TEXT,
    default_currency TEXT NOT NULL DEFAULT 'LKR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. USER PROFILES & MEMBERSHIP (Linked to Supabase auth.users)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('managing_director', 'finance_director', 'director')),
    must_change_password BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    role TEXT NOT NULL CHECK (role IN ('managing_director', 'finance_director', 'director')),
    share_percentage NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (share_percentage >= 0 AND share_percentage <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_company_membership UNIQUE (company_id, user_id)
);

-- ------------------------------------------------------------------------------
-- 3. CHART OF ACCOUNTS (Double-entry foundation)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    code TEXT NOT NULL CHECK (length(code) >= 4),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    currency TEXT NOT NULL DEFAULT 'LKR',
    opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_account_code_per_company UNIQUE (company_id, code)
);

-- ------------------------------------------------------------------------------
-- 4. PROJECTS & CONCURRENCY-SAFE ID GENERATION
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.project_display_id_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    display_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT,
    contract_value NUMERIC(15,2) NOT NULL CHECK (contract_value >= 0),
    currency TEXT NOT NULL DEFAULT 'LKR',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed')),
    valid_payments_total NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (valid_payments_total >= 0),
    outstanding_receivable NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (outstanding_receivable >= 0),
    client_credit NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (client_credit >= 0),
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Function to safely generate project display ID: DPL-YYYY-XXXX
CREATE OR REPLACE FUNCTION public.fn_generate_project_display_id()
RETURNS TRIGGER AS $$
DECLARE
    current_year TEXT;
    seq_num TEXT;
BEGIN
    IF NEW.display_id IS NULL OR NEW.display_id = '' THEN
        current_year := to_char(CURRENT_DATE, 'YYYY');
        seq_num := lpad(nextval('public.project_display_id_seq')::TEXT, 4, '0');
        NEW.display_id := 'DPL-' || current_year || '-' || seq_num;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_project_display_id ON public.projects;
CREATE TRIGGER trg_generate_project_display_id
BEFORE INSERT ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.fn_generate_project_display_id();

-- ------------------------------------------------------------------------------
-- 5. ACCOUNTING PERIODS (Monthly financial close)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    closed_by UUID REFERENCES public.profiles(id),
    closed_at TIMESTAMPTZ,
    total_revenue NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_expense NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    net_profit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_period_per_month UNIQUE (company_id, year, month)
);

-- ------------------------------------------------------------------------------
-- 6. CANONICAL FINANCIAL TRANSACTIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    reference_no TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN (
        'client_payment',
        'expense',
        'contractor_invoice',
        'contractor_payment',
        'director_distribution',
        'director_payment',
        'account_transfer',
        'reversal'
    )),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'LKR',
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',
        'submitted',
        'approved',
        'rejected',
        'posted',
        'reversed'
    )),
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    posted_by UUID REFERENCES public.profiles(id),
    posted_at TIMESTAMPTZ,
    idempotency_key TEXT UNIQUE,
    reversal_of_id UUID REFERENCES public.transactions(id),
    reversal_reason TEXT,
    accounting_period_id UUID REFERENCES public.accounting_periods(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique index to strictly guarantee an eligible transaction can be reversed at most ONCE
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_single_reversal
ON public.transactions(reversal_of_id)
WHERE reversal_of_id IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 7. CLIENT PAYMENTS (Sub-ledger linked to canonical transaction)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    payment_type TEXT NOT NULL CHECK (payment_type IN ('advance', 'milestone', 'final', 'other')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash', 'online')),
    external_reference TEXT,
    bank_account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
    receipt_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 8. EXPENSES & CATEGORIES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    default_account_id UUID REFERENCES public.financial_accounts(id),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_category_name_per_company UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    project_id UUID REFERENCES public.projects(id) ON DELETE RESTRICT, -- Nullable for company-wide overhead
    category_id UUID NOT NULL REFERENCES public.expense_categories(id),
    vendor TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash', 'credit_card', 'payable')),
    bank_account_id UUID REFERENCES public.financial_accounts(id),
    payable_account_id UUID REFERENCES public.financial_accounts(id),
    invoice_reference TEXT,
    receipt_url TEXT,
    is_paid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 9. CONTRACTORS & CONTRACTOR INVOICING / PAYMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    skill_set TEXT,
    default_agreed_fee NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
    invoice_no TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    invoice_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'paid', 'cancelled')),
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0 AND paid_amount <= amount),
    invoice_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contractor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES public.contractor_invoices(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
    bank_account_id UUID NOT NULL REFERENCES public.financial_accounts(id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bank_transfer', 'cheque', 'cash')),
    reference_no TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 10. DOUBLE-ENTRY JOURNAL ENTRIES & LINES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    transaction_id UUID NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
    entry_no TEXT NOT NULL UNIQUE,
    entry_date DATE NOT NULL,
    description TEXT NOT NULL,
    total_debit NUMERIC(15,2) NOT NULL CHECK (total_debit >= 0),
    total_credit NUMERIC(15,2) NOT NULL CHECK (total_credit >= 0),
    is_balanced BOOLEAN NOT NULL DEFAULT true CHECK (is_balanced = true AND total_debit = total_credit),
    posted_by UUID NOT NULL REFERENCES public.profiles(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
    debit NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (debit >= 0),
    credit NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (credit >= 0),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_debit_or_credit_positive CHECK (debit > 0 OR credit > 0),
    CONSTRAINT chk_not_both_positive CHECK (NOT (debit > 0 AND credit > 0))
);

-- ------------------------------------------------------------------------------
-- 11. DIRECTOR PROFIT ALLOCATIONS & DISTRIBUTIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.director_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES public.accounting_periods(id) ON DELETE RESTRICT,
    director_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    allocation_percentage NUMERIC(5,2) NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
    distributable_pool NUMERIC(15,2) NOT NULL CHECK (distributable_pool >= 0),
    allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount >= 0),
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0 AND paid_amount <= allocated_amount),
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'finalized', 'paid')),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_director_allocation_per_period UNIQUE (period_id, director_id)
);

-- ------------------------------------------------------------------------------
-- 12. AUDIT LOG (Immutable append-only trail)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID NOT NULL REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    before_values JSONB,
    after_values JSONB,
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent ordinary modification or deletion of audit records
CREATE OR REPLACE FUNCTION public.fn_prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit trail records are strictly immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_audit_tampering();

-- ------------------------------------------------------------------------------
-- 13. FINANCIAL DOCUMENTS (Private metadata table)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.financial_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'client_payment', 'expense', 'contractor_invoice', 'contractor_payment', 'report')),
    entity_id UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 14. CORE FINANCIAL INVARIANT TRIGGERS
-- ------------------------------------------------------------------------------

-- Recalculate Project Payment Status & Balances
-- Contract Value, Valid Payments Received (posted only, less reversals)
-- Outstanding Receivable = MAX(0, Contract Value - Valid Payments Received)
-- Client Credit = MAX(0, Valid Payments Received - Contract Value)
CREATE OR REPLACE FUNCTION public.fn_recalculate_project_payment_status(target_project_id UUID)
RETURNS VOID AS $$
DECLARE
    v_contract_value NUMERIC(15,2);
    v_valid_payments NUMERIC(15,2);
    v_reversals NUMERIC(15,2);
    v_net_payments NUMERIC(15,2);
    v_outstanding NUMERIC(15,2);
    v_credit NUMERIC(15,2);
    v_status TEXT;
BEGIN
    SELECT contract_value INTO v_contract_value
    FROM public.projects
    WHERE id = target_project_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Sum posted client payments
    SELECT COALESCE(SUM(t.amount), 0.00) INTO v_valid_payments
    FROM public.client_payments cp
    JOIN public.transactions t ON cp.transaction_id = t.id
    WHERE cp.project_id = target_project_id
      AND t.status = 'posted'
      AND t.type = 'client_payment';

    -- Subtract valid reversals
    SELECT COALESCE(SUM(t_rev.amount), 0.00) INTO v_reversals
    FROM public.transactions t_rev
    JOIN public.client_payments cp ON t_rev.reversal_of_id = cp.transaction_id
    WHERE cp.project_id = target_project_id
      AND t_rev.status = 'posted'
      AND t_rev.type = 'reversal';

    v_net_payments := GREATEST(0.00, v_valid_payments - v_reversals);
    v_outstanding := GREATEST(0.00, v_contract_value - v_net_payments);
    v_credit := GREATEST(0.00, v_net_payments - v_contract_value);

    IF v_net_payments >= v_contract_value THEN
        v_status := 'completed';
    ELSE
        v_status := 'pending';
    END IF;

    UPDATE public.projects
    SET valid_payments_total = v_net_payments,
        outstanding_receivable = v_outstanding,
        client_credit = v_credit,
        payment_status = v_status,
        updated_at = now()
    WHERE id = target_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to recalculate on client payment transaction changes
CREATE OR REPLACE FUNCTION public.fn_trg_client_payment_change()
RETURNS TRIGGER AS $$
DECLARE
    p_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT project_id INTO p_id FROM public.client_payments WHERE transaction_id = OLD.id;
    ELSE
        SELECT project_id INTO p_id FROM public.client_payments WHERE transaction_id = NEW.id;
        IF p_id IS NULL AND NEW.reversal_of_id IS NOT NULL THEN
            SELECT project_id INTO p_id FROM public.client_payments WHERE transaction_id = NEW.reversal_of_id;
        END IF;
    END IF;

    IF p_id IS NOT NULL THEN
        PERFORM public.fn_recalculate_project_payment_status(p_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_payment_transaction ON public.transactions;
CREATE TRIGGER trg_client_payment_transaction
AFTER INSERT OR UPDATE OF status, amount ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_trg_client_payment_change();

-- ------------------------------------------------------------------------------
-- 15. BALANCED JOURNAL ENTRY INTEGRITY TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_verify_journal_entry_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.total_debit <> NEW.total_credit THEN
        RAISE EXCEPTION 'Journal entry is unbalanced. Total Debit (%) does not equal Total Credit (%).',
            NEW.total_debit, NEW.total_credit;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_journal_balance ON public.journal_entries;
CREATE TRIGGER trg_verify_journal_balance
BEFORE INSERT OR UPDATE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_verify_journal_entry_balance();

-- ------------------------------------------------------------------------------
-- 16. CLOSED PERIOD INTEGRITY TRIGGER
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_check_closed_period_modification()
RETURNS TRIGGER AS $$
DECLARE
    v_period_status TEXT;
BEGIN
    IF NEW.accounting_period_id IS NOT NULL THEN
        SELECT status INTO v_period_status
        FROM public.accounting_periods
        WHERE id = NEW.accounting_period_id;

        IF v_period_status = 'closed' THEN
            RAISE EXCEPTION 'Cannot post or modify transactions in a closed accounting period.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_closed_period ON public.transactions;
CREATE TRIGGER trg_check_closed_period
BEFORE INSERT OR UPDATE OF status, amount, transaction_date ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_closed_period_modification();

-- ------------------------------------------------------------------------------
-- 17. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.director_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_documents ENABLE ROW LEVEL SECURITY;

-- Helper function to check if auth.uid() is an active company member
CREATE OR REPLACE FUNCTION public.fn_is_active_member(p_company_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.company_memberships cm
        JOIN public.profiles p ON cm.user_id = p.id
        WHERE cm.company_id = p_company_id
          AND cm.user_id = auth.uid()
          AND p.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: User can read all company colleagues; update only their own profile
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Companies: Members can view their company
CREATE POLICY "Members can view company record"
ON public.companies FOR SELECT
TO authenticated
USING (public.fn_is_active_member(id));

-- Financial Records: Members can view their company's financial data
CREATE POLICY "Members can view financial accounts"
ON public.financial_accounts FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can view projects"
ON public.projects FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can create projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (public.fn_is_active_member(company_id));

CREATE POLICY "Members can update projects"
ON public.projects FOR UPDATE
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can view transactions"
ON public.transactions FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can insert transactions"
ON public.transactions FOR INSERT
TO authenticated
WITH CHECK (public.fn_is_active_member(company_id) AND created_by = auth.uid());

CREATE POLICY "Members can view client payments"
ON public.client_payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view expenses"
ON public.expenses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view contractors"
ON public.contractors FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can view contractor invoices"
ON public.contractor_invoices FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view contractor payments"
ON public.contractor_payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view journal entries"
ON public.journal_entries FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can view journal lines"
ON public.journal_lines FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view accounting periods"
ON public.accounting_periods FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));

CREATE POLICY "Members can view director allocations"
ON public.director_allocations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Members can view documents"
ON public.financial_documents FOR SELECT
TO authenticated
USING (public.fn_is_active_member(company_id));
