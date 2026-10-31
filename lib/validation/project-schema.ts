import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
  clientName: z.string().min(2, 'Client name is required'),
  clientEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  clientPhone: z.string().optional().or(z.literal('')),
  contractValue: z.coerce.number().positive('Contract value must be greater than zero'),
  currency: z.string().default('LKR'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid start date required (YYYY-MM-DD)'),
  paymentSchedule: z
    .union([
      z.string(),
      z.array(
        z.object({
          title: z.string().min(1, 'Milestone title is required'),
          expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid date required (YYYY-MM-DD)'),
          amount: z.coerce.number().positive('Milestone amount must be positive'),
        })
      ),
    ])
    .optional()
    .default([]),
  notes: z.string().optional().or(z.literal('')),
});

export type ProjectInput = z.infer<typeof projectSchema>;
