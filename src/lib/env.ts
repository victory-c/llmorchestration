import { z } from "zod";

const boolFromString = z
  .union([z.string(), z.boolean(), z.undefined()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    if (!v) return false;
    return v.toLowerCase() === "true" || v === "1";
  });

const numFromString = (fallback: number) =>
  z
    .union([z.string(), z.number(), z.undefined()])
    .transform((v) => {
      if (typeof v === "number") return v;
      if (!v) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    });

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DEMO_MODE: boolFromString.default(false),

  DATABASE_URL: z.string().optional(),

  MODEL_GATEWAY_PROVIDER: z
    .enum([
      "mock",
      "vercel-ai-gateway",
      "openrouter",
      "litellm",
      "direct-openai",
      "direct-anthropic",
      "direct-google",
    ])
    .default("mock"),

  MODEL_GATEWAY_API_KEY: z.string().optional(),
  VERCEL_AI_GATEWAY_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  LITELLM_BASE_URL: z.string().optional(),
  LITELLM_API_KEY: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),

  TTS_PROVIDER: z
    .enum(["mock", "elevenlabs", "google-tts", "openai-tts"])
    .default("mock"),
  ELEVENLABS_API_KEY: z.string().optional(),
  GOOGLE_TTS_CREDENTIALS_JSON: z.string().optional(),
  OPENAI_TTS_API_KEY: z.string().optional(),

  STORAGE_PROVIDER: z
    .enum(["local", "vercel-blob", "supabase", "s3", "r2"])
    .default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),

  MAX_RUNS_PER_IP_PER_DAY: numFromString(3),
  MAX_PARTICIPANTS_PER_RUN: numFromString(6),
  MAX_ROUNDS_PER_RUN: numFromString(6),
  MAX_OUTPUT_TOKENS_PER_CALL: numFromString(400),
  MAX_ESTIMATED_COST_PER_RUN_USD: numFromString(0.25),
  GLOBAL_AI_KILL_SWITCH: boolFromString.default(false),
  DISABLE_TTS_GENERATION: boolFromString.default(false),
  DISABLE_VIDEO_GENERATION: boolFromString.default(false),

  TICK_MAX_JOBS_PER_CALL: numFromString(5),
  JOBS_TICK_TOKEN: z.string().optional(),

  // Moderation provider — `local` (keyword-only, default) or `openai`
  // (OpenAI Moderations API + keyword fallback). When `openai` is set
  // without OPENAI_API_KEY, the active provider falls back to local.
  MODERATION_PROVIDER: z.enum(["local", "openai"]).default("local"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  cached = envSchema.parse(process.env);
  if (cached.STORAGE_PROVIDER === "local" && process.env.VERCEL) {
    throw new Error(
      "STORAGE_PROVIDER=local is not allowed on Vercel. Use vercel-blob or supabase.",
    );
  }
  return cached;
}

export function resetEnvCacheForTests() {
  cached = null;
}
