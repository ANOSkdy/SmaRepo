export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return 'build-time-auth-secret-placeholder';
  }

  throw new Error('Missing auth secret: set AUTH_SECRET or NEXTAUTH_SECRET');
}
