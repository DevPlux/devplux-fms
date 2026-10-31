-- ==============================================================================
-- DEVPLUX (PVT) LTD — INITIAL SEED DATA
-- Default Company, Chart of Accounts, Categories, and Base Configuration
-- ==============================================================================

-- 1. Insert Company
INSERT INTO public.companies (id, name, registration_no, default_currency)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Devplux (Pvt) Ltd',
    'PV-00289144',
    'LKR'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    registration_no = EXCLUDED.registration_no;

-- 2. Chart of Accounts
INSERT INTO public.financial_accounts (id, company_id, code, name, type, currency, opening_balance, current_balance, description)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '1010', 'Cash on Hand', 'asset', 'LKR', 0.00, 0.00, 'Physical petty cash reserve'),
    ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '1020', 'Company Bank Account', 'asset', 'LKR', 0.00, 0.00, 'Primary corporate business bank account'),
    ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', '1100', 'Accounts Receivable', 'asset', 'LKR', 0.00, 0.00, 'Client project billings receivable'),
    ('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', '2010', 'Accounts Payable', 'liability', 'LKR', 0.00, 0.00, 'Vendor and expense obligations'),
    ('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', '2020', 'Contractor Payables', 'liability', 'LKR', 0.00, 0.00, 'Approved developer invoices payable'),
    ('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', '2030', 'Director Distribution Payables', 'liability', 'LKR', 0.00, 0.00, 'Declared profit distributions unpaid'),
    ('b0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', '3010', 'Director Share Capital', 'equity', 'LKR', 0.00, 0.00, 'Contributed initial director capital'),
    ('b0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', '3020', 'Retained Earnings', 'equity', 'LKR', 0.00, 0.00, 'Cumulative retained earnings'),
    ('b0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', '4010', 'Software Development Revenue', 'revenue', 'LKR', 0.00, 0.00, 'Revenue recognized from client projects'),
    ('b0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', '5010', 'Cloud Hosting & Infrastructure', 'expense', 'LKR', 0.00, 0.00, 'AWS, Vercel, Supabase, Cloudflare costs'),
    ('b0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', '5020', 'Domains & Software Subscriptions', 'expense', 'LKR', 0.00, 0.00, 'SaaS tooling, GitHub, Jira, domain names'),
    ('b0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', '5030', 'Contractor Developer Costs', 'expense', 'LKR', 0.00, 0.00, 'Project-specific external contractor expenses'),
    ('b0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', '5040', 'Office & Operating Overhead', 'expense', 'LKR', 0.00, 0.00, 'Rent, utilities, internet, stationery'),
    ('b0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', '5050', 'Marketing & Transport', 'expense', 'LKR', 0.00, 0.00, 'Client outreach, travel, logistics')
ON CONFLICT (company_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description;

-- 3. Default Expense Categories
INSERT INTO public.expense_categories (id, company_id, name, default_account_id)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Cloud Hosting & Servers', 'b0000000-0000-0000-0000-000000000011'),
    ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Domains & DNS', 'b0000000-0000-0000-0000-000000000012'),
    ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Software Subscriptions & APIs', 'b0000000-0000-0000-0000-000000000012'),
    ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Contractor Developer Fees', 'b0000000-0000-0000-0000-000000000013'),
    ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Office & Utilities', 'b0000000-0000-0000-0000-000000000014'),
    ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Marketing & Sales', 'b0000000-0000-0000-0000-000000000015'),
    ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Transport & Meals', 'b0000000-0000-0000-0000-000000000015')
ON CONFLICT (company_id, name) DO NOTHING;

-- 4. Initial Accounting Period (October 2026)
INSERT INTO public.accounting_periods (id, company_id, year, month, name, start_date, end_date, status)
VALUES (
    'd0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    2026,
    10,
    'October 2026',
    '2026-10-01',
    '2026-10-31',
    'open'
)
ON CONFLICT (company_id, year, month) DO NOTHING;
