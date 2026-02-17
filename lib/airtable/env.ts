import 'server-only';

export class AirtableEnvError extends Error {
  constructor(missingKeys: string[]) {
    super(`Airtable env missing: ${missingKeys.join(', ')}`);
    this.name = 'AirtableEnvError';
  }
}

export type AirtableEnv = {
  apiKey: string;
  baseId: string;
};

export function getAirtableEnv(): AirtableEnv {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const missingKeys: string[] = [];

  if (!apiKey) {
    missingKeys.push('AIRTABLE_API_KEY');
  }
  if (!baseId) {
    missingKeys.push('AIRTABLE_BASE_ID');
  }

  if (missingKeys.length > 0) {
    throw new AirtableEnvError(missingKeys);
  }

  return {
    apiKey: apiKey as string,
    baseId: baseId as string,
  };
}

