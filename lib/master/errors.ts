export function isUniqueViolation(error: unknown, constraint: string) {
  if (!error || typeof error !== 'object') return false;
  const maybe = error as { code?: string; constraint?: string };
  return maybe.code === '23505' && maybe.constraint === constraint;
}
