import { z } from 'zod';

const uuidSchema = z.string().uuid();
const machineCodeSchema = z.string().trim().min(1).max(100);

export const inventoryItemBaseSchema = z.object({
  sku: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  categoryId: machineCodeSchema,
  locationId: uuidSchema,
  quantity: z.coerce.number().int().min(0).max(9999999),
  unit: z.string().trim().max(50).optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
  imageUrl: z.string().url().max(2000).optional().nullable(),
  imagePath: z.string().max(500).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const inventoryItemCreateSchema = inventoryItemBaseSchema;

export const inventoryItemUpdateSchema = inventoryItemBaseSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required',
});

export const inventoryMasterCreateSchema = z.object({
  code: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/i),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const inventoryMasterUpdateSchema = inventoryMasterCreateSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export function normalizeNullableText(value?: string | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
