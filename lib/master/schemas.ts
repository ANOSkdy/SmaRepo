import { z } from 'zod';

const roleSchema = z.enum(['admin', 'user']);
const workCategorySchema = z.enum(['operating', 'regular', 'other']);

const nullableText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  });

export const masterSiteCreateSchema = z.object({
  name: z.string().trim().min(1),
  clientName: z.string().trim().optional().default(''),
  longitude: z.number().finite().min(-180).max(180),
  latitude: z.number().finite().min(-90).max(90),
  radiusM: z.number().int().min(1),
  priority: z.number().int().min(0),
  active: z.boolean().default(true),
});

export const masterSiteUpdateSchema = masterSiteCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const masterUserCreateSchema = z.object({
  username: z.string().trim().min(1),
  name: z.string().trim().min(1),
  phone: nullableText,
  email: z
    .union([z.string().trim().email(), z.literal(''), z.null(), z.undefined()])
    .transform((value) => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : null;
    }),
  role: roleSchema,
  active: z.boolean().default(true),
  excludeBreakDeduction: z.boolean().default(false),
  password: z.string().min(1),
});

export const masterUserUpdateSchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    phone: nullableText.optional(),
    email: z
      .union([z.string().trim().email(), z.literal(''), z.null(), z.undefined()])
      .transform((value) => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
      })
      .optional(),
    role: roleSchema.optional(),
    active: z.boolean().optional(),
    excludeBreakDeduction: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const masterWorkTypeCreateSchema = z.object({
  name: z.string().trim().min(1),
  sortOrder: z.number().int().min(0),
  active: z.boolean().default(true),
  category: workCategorySchema,
});

export const masterWorkTypeUpdateSchema = masterWorkTypeCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });


export const masterMachineCreateSchema = z.object({
  name: z.string().trim().min(1),
  machineCode: z.number().int().min(1),
  active: z.boolean().default(true),
});

export const masterMachineUpdateSchema = masterMachineCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const masterIdSchema = z.object({
  id: z.string().uuid(),
});
