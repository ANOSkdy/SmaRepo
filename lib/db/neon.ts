import { neon } from "@neondatabase/serverless";

export function getSql() {
  const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
  if (!url) {
    const e = new Error("Database env missing: DATABASE_URL or NEON_DATABASE_URL");
    (e as any).name = "DatabaseEnvError";
    throw e;
  }
  return neon(url);
}
