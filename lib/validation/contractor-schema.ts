import { z } from 'zod';

export const contractorSchema = z.object({
  name: z.string().min(2, 'Contractor name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  skillSet: z.string().optional().or(z.literal('')),
  defaultAgreedFee: z.coerce.number().min(0).default(0),
});

export type ContractorInput = z.infer<typeof contractorSchema>;

export const contractorInvoiceSchema = z.object({
  contractorId: z.string().uuid('Please select a contractor'),
  projectId: z.string().uuid('Please select the associated project'),
  invoiceNo: z.string().min(1, 'Invoice reference number is required'),
  amount: z.coerce.number().positive('Invoice amount must be greater than zero'),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid invoice date required (YYYY-MM-DD)'),
  notes: z.string().optional().or(z.literal('')),
});

export type ContractorInvoiceInput = z.infer<typeof contractorInvoiceSchema>;

export const contractorPaymentSchema = z.object({
  invoiceId: z.string().uuid('Please select the invoice to settle'),
  bankAccountId: z.string().uuid('Please select the paying bank account'),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid payment date required (YYYY-MM-DD)'),
  paymentMethod: z.enum(['bank_transfer', 'cheque', 'cash'], {
    errorMap: () => ({ message: 'Please select a valid payment method' }),
  }),
  referenceNo: z.string().optional().or(z.literal('')),
});

export type ContractorPaymentInput = z.infer<typeof contractorPaymentSchema>;
