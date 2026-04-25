// Initial schema SQL. Used by:
//   - pglite test harness (pushed on DB start)
//   - Supabase/Postgres (generated migration in drizzle/migrations/0000_init.sql)
// Keep this in sync with src/server/db/schema.ts.

export const INITIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text,
  display_name text,
  role text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id text PRIMARY KEY,
  owner_user_id text,
  title text NOT NULL,
  description text NOT NULL,
  category text,
  max_rounds integer NOT NULL,
  public_facts_json jsonb NOT NULL,
  resources_json jsonb NOT NULL,
  rules_json jsonb NOT NULL,
  termination_conditions_json jsonb NOT NULL,
  is_stub boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scenarios_owner_idx ON scenarios(owner_user_id);

CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  scenario_id text NOT NULL REFERENCES scenarios(id),
  owner_user_id text,
  status text NOT NULL,
  round integer NOT NULL DEFAULT 0,
  max_rounds integer NOT NULL,
  termination_reason text,
  state_json jsonb NOT NULL,
  actual_cost_usd real NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS runs_scenario_idx ON runs(scenario_id);
CREATE INDEX IF NOT EXISTS runs_status_idx ON runs(status);
CREATE INDEX IF NOT EXISTS runs_owner_idx ON runs(owner_user_id);

CREATE TABLE IF NOT EXISTS participants (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  model_id text NOT NULL,
  public_persona text NOT NULL,
  private_goal text,
  status text NOT NULL,
  voice_profile_json jsonb,
  inventory_json jsonb,
  order_index integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS participants_run_idx ON participants(run_id);

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  round integer NOT NULL,
  participant_id text,
  speaker_type text NOT NULL,
  display_name text NOT NULL,
  content text NOT NULL,
  model_id text,
  provider text,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd real,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_run_round_idx ON messages(run_id, round);

CREATE TABLE IF NOT EXISTS state_snapshots (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  round integer NOT NULL,
  state_json jsonb NOT NULL,
  judge_output_json jsonb,
  events_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS state_snapshots_run_round_idx ON state_snapshots(run_id, round);

CREATE TABLE IF NOT EXISTS media_assets (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  message_id text,
  type text NOT NULL,
  storage_key text NOT NULL,
  url text,
  content_type text,
  size_bytes integer,
  duration_ms integer,
  status text NOT NULL DEFAULT 'pending',
  failed_reason text,
  sequence_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_run_type_idx ON media_assets(run_id, type);
CREATE INDEX IF NOT EXISTS media_assets_message_idx ON media_assets(message_id);

CREATE TABLE IF NOT EXISTS usage_events (
  id text PRIMARY KEY,
  run_id text NOT NULL,
  participant_id text,
  provider text,
  model_id text,
  event_type text NOT NULL,
  input_tokens integer,
  output_tokens integer,
  estimated_cost_usd real,
  latency_ms integer,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_run_idx ON usage_events(run_id);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload_json jsonb NOT NULL,
  status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  priority integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_by text,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_status_run_after_idx ON jobs(status, run_after);

CREATE TABLE IF NOT EXISTS rate_limit_events (
  ip_hash text NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day)
);
`;
