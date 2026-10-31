import { z } from 'zod';

export const expenseSchema = z.object({
  projectId: z.string().optional().nullable().or(z.literal('')),
  categoryId: z.string().optional().nullable().or(z.literal('')),
  category: z.string().optional().nullable(),
  vendor: z.string().min(2, 'Vendor/Payee name is required'),
  amount: z.coerce.number().positive('Expense amount must be greater than zero'),
  currency: z.string().default('LKR'),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)').optional().default(() => new Date().toISOString().split('T')[0]),
  paymentMethod: z.string().default('bank_transfer'),
  bankAccountId: z.string().optional().nullable().or(z.literal('')),
  payableAccountId: z.string().optional().nullable().or(z.literal('')),
  invoiceReference: z.string().optional().nullable().or(z.literal('')),
  receiptUrl: z.string().optional().nullable().or(z.literal('')),
  description: z.string().optional().default('Operating Expense'),
  isPaid: z.boolean().default(true),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
