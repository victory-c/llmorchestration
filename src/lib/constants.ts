export const DEFAULT_MAX_ROUNDS = 3;
export const DEFAULT_MAX_PARTICIPANTS = 6;
export const DEFAULT_MAX_OUTPUT_TOKENS = 400;
export const DEFAULT_MAX_COST_USD = 0.25;
export const DEFAULT_MAX_TTS_CHARS = 1000;
export const DEFAULT_JOB_LEASE_SECONDS = 60;
export const DEFAULT_JOB_MAX_ATTEMPTS = 3;

export const DEFAULT_RECENT_TRANSCRIPT_WINDOW = 8;

// Hard caps applied on top of env when DEMO_MODE=true. A self-hoster can
// further tighten via env; they cannot loosen past these hosted-demo caps.
// See PRD §5.1 hosted demo limits.
export const HOSTED_DEMO_MAX_PARTICIPANTS = 3;
export const HOSTED_DEMO_MAX_ROUNDS = 3;
export const HOSTED_DEMO_MAX_OUTPUT_TOKENS = 300;
export const HOSTED_DEMO_MAX_COST_USD = 0.25;
