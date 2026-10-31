import { z } from 'zod';

export const periodCloseSchema = z.object({
  periodId: z.string().uuid('Please select a valid accounting period'),
  closingNotes: z.string().min(5, 'Closing notes are required for period lock'),
});

export type PeriodCloseInput = z.infer<typeof periodCloseSchema>;

export const directorAllocationSchema = z.object({
  periodId: z.string().uuid('Please select a valid accounting period'),
  distributablePool: z.coerce.number().positive('Distributable profit must be greater than zero'),
  allocations: z.array(
    z.object({
      directorId: z.string().uuid(),
      sharePercentage: z.coerce.number().min(0).max(100),
      allocatedAmount: z.coerce.number().min(0),
    })
  ),
});

export type DirectorAllocationInput = z.infer<typeof directorAllocationSchema>;
