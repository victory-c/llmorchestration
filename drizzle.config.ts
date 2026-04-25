import type { Config } from "drizzle-kit";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url && process.env.NODE_ENV !== "test") {
  // eslint-disable-next-line no-console
  console.warn(
    "drizzle.config: neither DIRECT_URL nor DATABASE_URL is set. Commands that need a DB will fail.",
  );
}

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url ?? "postgres://placeholder",
  },
  verbose: true,
  strict: true,
} satisfies Config;
