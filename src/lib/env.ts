import 'server-only';

let localFallbackSecret: string | null = null;

function isVercelRuntime(): boolean {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}

function createRandomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, '0')).join('');
}

function getLocalFallbackSecret(): string {
  if (!localFallbackSecret) {
    localFallbackSecret = createRandomHex(32);
  }
  return localFallbackSecret;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (secret) {
    return secret;
  }

  if (isVercelRuntime()) {
    throw new Error('Missing auth secret: set AUTH_SECRET or NEXTAUTH_SECRET');
  }

  return getLocalFallbackSecret();
}
