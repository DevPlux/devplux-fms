import { z } from 'zod';

export const clientPaymentSchema = z.object({
  projectId: z.string().min(1, 'Please select or provide a valid project'),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  currency: z.string().default('LKR'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid payment date required (YYYY-MM-DD)').optional().default(() => new Date().toISOString().split('T')[0]),
  paymentType: z.string().default('milestone'),
  paymentMethod: z.string().default('bank_transfer'),
  bankAccountId: z.string().optional().nullable().or(z.literal('')),
  bankAccount: z.string().optional().nullable().or(z.literal('')),
  externalReference: z.string().optional().nullable().or(z.literal('')),
  receiptUrl: z.string().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable().or(z.literal('')),
  idempotencyKey: z.string().optional(),
});

export type ClientPaymentInput = z.infer<typeof clientPaymentSchema>;

export const reversalSchema = z.object({
  transactionId: z.string().uuid('Valid transaction ID required'),
  reason: z.string().min(10, 'A detailed reversal reason of at least 10 characters is mandatory for financial auditability'),
});

export type ReversalInput = z.infer<typeof reversalSchema>;
