# DEVPLUX (PVT) LTD — FINANCIAL MANAGEMENT SYSTEM
## Enterprise Architecture, Corporate Accounting & Multi-Director Governance Platform

---

### 1. Executive Summary & Purpose

This system is an enterprise financial management application built specifically for **Devplux (Pvt) Ltd** (Company Registration No: **PV-00289144**), an IT development firm governed by five directors.

#### Core Business Boundary (Scope Mandate)
- **Financial Management System Only:** This is strictly an accounting and financial governance system, **not** a software development sprint board or project delivery tracker.
- **Project Completion Definition:** A project is defined as complete if and only if **Client Payment is Complete** (`Valid Payments Received >= Agreed Contract Value`).
- **Outstanding Client Receivable:** $\max(0, \text{Contract Value} - \text{Valid Payments Received})$
- **Client Credit / Overpayment:** $\max(0, \text{Valid Payments Received} - \text{Contract Value})$
- Expenses and contractor developer costs **never** determine whether a client has paid their agreed project contract sum.

---

### 2. Technology Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript with strict type checking
- **Styling:** Tailwind CSS (Dark Navy Blue `#0f172a` & White Corporate Aesthetic)
- **Database & Auth:** Supabase PostgreSQL with Row-Level Security (RLS)
- **Validation:** Zod schemas
- **Exporting:** jsPDF & jspdf-autotable (PDF) + SheetJS/xlsx (Excel & CSV)
- **Automated Testing:** Vitest & Node 22 Test Runner

---

### 3. Folder Structure

```text
devplux-financial-management-system/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   ├── change-password/
│   │   └── reset-password/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx      # Consolidated cash, receivables & P&L
│   │   ├── projects/               # Financial project register & DPL display IDs
│   │   │   └── [id]/page.tsx       # Sub-ledger & installment breakdowns
│   │   ├── income/page.tsx         # Central income receipts register
│   │   ├── expenses/page.tsx       # Operating costs (Company-wide vs Project)
│   │   ├── contractors/page.tsx    # External developer fees & settlements
│   │   ├── accounts/page.tsx       # Cash & bank accounts + CSV reconciliation
│   │   ├── approvals/page.tsx      # Separation of duties authorization queue
│   │   ├── reports/page.tsx        # P&L, aging, PDF & XLSX statements
│   │   ├── directors/page.tsx      # 5 Directors shareholding & capital
│   │   ├── distributions/page.tsx  # Reserves retainage & dividend payouts
│   │   ├── audit-log/page.tsx      # Immutable append-only audit trail
│   │   ├── profile/page.tsx        # Director profile & password update
│   │   └── settings/page.tsx       # Approval thresholds & period closing
│   ├── api/
│   │   ├── projects/route.ts
│   │   ├── transactions/route.ts
│   │   └── reversals/route.ts
│   ├── globals.css
│   └── layout.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx             # Dark navy responsive navigation
│   │   ├── Header.tsx              # Top status, period, and role pill
│   │   └── DashboardLayout.tsx     # Unified layout wrapper
│   └── ui/
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Modal.tsx
│       ├── Input.tsx
│       └── Select.tsx
├── lib/
│   ├── financial-calculations/
│   │   ├── project-finances.ts     # Authoritative payment status math
│   │   └── accounting-math.ts      # Balanced journal & profit share math
│   ├── formatting/
│   │   └── formatters.ts           # Currency (LKR), date & percentage
│   ├── permissions/
│   │   └── rbac.ts                 # Self-approval limits & role policies
│   ├── supabase/
│   │   ├── client.ts               # Browser client
│   │   ├── server.ts               # Server App Router client
│   │   └── admin.ts                # Service role administrative client
│   ├── utilities/
│   │   ├── pdf-export.ts           # Branded corporate PDF generator
│   │   └── excel-export.ts         # XLSX and CSV export engine
│   └── validation/                 # Zod validation schemas
├── supabase/
│   ├── migrations/
│   │   └── 20261027000001_initial_financial_schema.sql
│   └── seed.sql
├── scripts/
│   └── seed.mjs                    # Idempotent 5-director provisioning
├── tests/
│   └── unit/
│       ├── financial-calculations.test.ts
│       └── node-runner.test.mjs    # Verified Node 22 invariant test suite
├── .env.example
├── middleware.ts                   # Route guard & password change redirection
└── package.json
```

---

### 4. Database Architecture & Accounting Invariants

#### Chart of Accounts (COA)
- **1010:** Cash on Hand (Petty cash reserve)
- **1020:** Company Bank Account (LKR Business Account)
- **1100:** Accounts Receivable (Client Project Billings)
- **2010:** Accounts Payable (Vendors & Service Providers)
- **2020:** Contractor Payables (External Developers)
- **2030:** Director Distribution Payables (Declared Dividends)
- **3010:** Director Share Capital (Initial Equity)
- **3020:** Retained Earnings
- **4010:** Software Development Project Revenue
- **5010:** Cloud Hosting & Infrastructure (AWS, Vercel)
- **5020:** Domains & Software Subscriptions
- **5030:** Contractor Developer Fees
- **5040:** Office & Operating Overhead
- **5050:** Marketing & Transport

#### Strict Financial Invariants
1. **Balanced Journal Entries:** Every journal posting enforces $\sum \text{Debits} = \sum \text{Credits}$ via trigger `trg_verify_journal_balance`.
2. **Controlled Reversals:** Posted transactions can **never** be deleted or edited. Reversals post a linked contra-transaction and audit justification. Double-reversal is blocked by a unique partial index.
3. **Closed Period Immutability:** Accounting periods sealed via `fn_check_closed_period_modification()` reject backdated modifications.
4. **Audit Immutability:** Trigger `fn_prevent_audit_tampering()` prevents any `UPDATE` or `DELETE` on `audit_logs`.

---

### 5. Setup and Execution Instructions

#### 1. Environment Configuration
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Fill in your Supabase Project URL, Publishable Anon Key, and Service Role Key.

#### 2. Install Dependencies
```bash
yarn install
```

#### 3. Apply Database Migrations
In your Supabase project (via SQL Editor or CLI):
1. Execute `supabase/migrations/20261027000001_initial_financial_schema.sql`
2. Execute `supabase/seed.sql`

#### 4. Provision Initial 5 Director Accounts
Run the safe provisioning script:
```bash
node scripts/seed.mjs
```
This idempotently provisions:
- `director1@devplux.com` (MR. Chanuka — Managing Director, 20% share)
- `director2@devplux.com` (MR. Lakindu — Finance Director, 20% share)
- `director3@devplux.com` (MR. Janindu — Director, 20% share)
- `director4@devplux.com` (Mr. Harsha — Director, 20% share)
- `director5@devplux.com` (Mr. Amila — Director, 20% share)

Each account receives the server-validated flag `must_change_password = true`. Upon first sign-in, directors are immediately redirected to `/change-password` to establish their private credentials before accessing the financial dashboard.

#### 5. Run Automated Tests
Execute the financial invariant test suite:
```bash
node --test tests/unit/node-runner.test.mjs
```
All 11 invariant tests pass with 0 errors.

#### 6. Start Development Server
```bash
yarn dev
```
Open [http://localhost:3000](http://localhost:3000) to access the system.
