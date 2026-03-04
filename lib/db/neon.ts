import { neon } from "@neondatabase/serverless";

class DatabaseEnvError extends Error {
  constructor() {
    super("Database env missing: DATABASE_URL or NEON_DATABASE_URL");
    this.name = "DatabaseEnvError";
  }
}

export function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new DatabaseEnvError();
  }
  return neon(url);
}
