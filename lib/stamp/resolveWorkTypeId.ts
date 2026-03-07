export type SqlTag = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toNullableUuid(value: string | null): string | null {
  if (!value) return null;
  return UUID_REGEX.test(value) ? value : null;
}

export function normalizeWorkTypeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

export async function resolveWorkTypeId(
  sql: SqlTag,
  explicitWorkTypeRef: string | null,
  workDescription: string
): Promise<string | null> {
  const explicitWorkTypeId = toNullableUuid(explicitWorkTypeRef);
  if (explicitWorkTypeId) return explicitWorkTypeId;

  const normalizedDescription = normalizeWorkTypeName(workDescription);
  if (!normalizedDescription) return null;

  const rows = (await sql`
    SELECT id
    FROM work_types
    WHERE active = true
      AND lower(trim(regexp_replace(name, '\\s+', ' ', 'g'))) = ${normalizedDescription}
    LIMIT 1
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}
