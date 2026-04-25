# Product Requirements Document: Multi-Agent LLM Scenario Arena

**Project name:** Multi-Agent LLM Scenario Arena  
**Working repo name:** `llm-scenario-arena`  
**Primary deployment target:** Vercel  
**Open-source distribution:** GitHub, self-hostable, BYOK-friendly  
**Document version:** v2.0  
**Last updated:** 2026-04-23  

---

## 0. Implementation Instruction for Claude Code

This PRD is the source of truth for implementation. Build the project incrementally and avoid overengineering the first version.

Priority order:

1. Build a working local MVP with mock models.
2. Add a real unified model gateway, preferably Vercel AI Gateway or OpenRouter.
3. Add persistent runs, transcripts, and state logs.
4. Add text-to-speech generation.
5. Add basic storyboard/slideshow video export.
6. Add Vercel deployment and GitHub-friendly open-source setup.
7. Add optional advanced video integrations later.

Do **not** automate consumer chat webpages to avoid API usage. All model calls must go through official APIs, unified gateways, or mock/local providers.

---

## 1. Product Summary

Multi-Agent LLM Scenario Arena is a web application that lets users orchestrate multiple AI models inside fictional scenario games, debates, ethical dilemmas, and dramatic simulations.

Example scenarios:

- "Six AI models are on a crashing plane, but there are only four parachutes."
- "GPT, Claude, Gemini, and DeepSeek are trapped in a bunker and must vote on who leaves."
- "A council of AI agents must decide how to allocate scarce medicine."
- "Different models negotiate as startup cofounders during a crisis."
- "AI agents play a survival reality show with hidden objectives."

The product should run the simulation, maintain canonical world state, display the conversation as a dramatic transcript, and optionally generate AI voices and short videos from the result.

The project should function both as:

1. A polished hosted demo on Vercel.
2. A self-hostable open-source portfolio project on GitHub.

---

## 2. Goals

### 2.1 User Goals

Users should be able to:

- Create fictional multi-agent scenarios.
- Select several LLM participants from a unified model gateway.
- Assign each participant a public persona and optional private goal.
- Run multi-round simulations.
- Watch outputs appear as a transcript.
- Review state updates from a neutral judge agent.
- Generate an audio version using distinct voices.
- Generate a short video/storyboard version of the run.
- Export or share the run.
- Clone the GitHub repo and run it locally with mock models or their own API keys.

### 2.2 Builder / Portfolio Goals

The project should demonstrate:

- Full-stack product architecture.
- Next.js and Vercel deployment.
- LLM orchestration.
- Unified model gateway design.
- Prompt engineering.
- Multi-agent simulation.
- State machine design.
- Structured JSON outputs.
- Cost tracking.
- API key security.
- Media generation pipeline.
- Open-source documentation quality.

---

## 3. Non-Goals

The MVP should **not** attempt to:

- Build a proprietary foundation model.
- Scrape or automate ChatGPT, Claude, Gemini, or other consumer chat webpages.
- Build a mobile app.
- Implement complex 3D animation from scratch.
- Support every model provider directly in v1.
- Guarantee cinematic video quality in the MVP.
- Allow unlimited hosted demo usage with the developer’s own API keys.
- Store real user secrets in client-side code.
- Support real-person impersonation or unlicensed voice cloning.

---

## 4. Target Users

### 4.1 Primary Users

- AI enthusiasts who want to stage funny or dramatic model interactions.
- Students and builders exploring LLM orchestration.
- Developers who want a self-hostable multi-agent simulation template.
- Portfolio reviewers/recruiters evaluating the builder's full-stack and AI engineering skills.

### 4.2 Secondary Users

- Content creators who want short AI-generated scenario videos.
- Educators who want to demonstrate ethical dilemmas or debate systems.
- Researchers interested in qualitative model behavior comparison.

---

## 5. Product Modes

The app must support three runtime modes.

### 5.1 Hosted Demo Mode

Purpose: Let visitors try the product on the creator’s Vercel deployment.

Requirements:

- Uses the owner’s configured gateway API key.
- Hard limits on cost and usage.
- No user-provided API key required.
- Default scenarios available.
- Limited rounds and participants.
- Video generation disabled or heavily limited by default.

Recommended hosted demo limits:

```txt
Max participants: 3
Max rounds: 3
Max output tokens per message: 300
Max runs per anonymous visitor per day: 1-3
Max video duration: 60-90 seconds
Require login for higher usage
```

### 5.2 BYOK Self-Hosted Mode

Purpose: Let GitHub users deploy their own copy.

Requirements:

- User provides their own gateway/model/TTS keys.
- `.env.example` explains required variables.
- README includes setup instructions.
- No private keys committed.
- Works on Vercel with a "Deploy to Vercel" button.
- Supports Vercel AI Gateway and/or OpenRouter.

### 5.3 Mock Local Mode

Purpose: Let anyone run the project without paid API keys.

Requirements:

- `MODEL_GATEWAY_PROVIDER=mock`
- Mock LLM actors return deterministic but varied responses.
- Mock judge returns valid state updates.
- Mock TTS returns placeholder metadata or skips audio.
- Mock video generation produces placeholder output or storyboard HTML.

This mode is essential for GitHub usability.

---

## 6. Core User Flows

### 6.1 Create Scenario

1. User opens scenario builder.
2. User enters scenario title and description.
3. User chooses a template or starts blank.
4. User configures:
   - Number of rounds.
   - Participant count.
   - Resources or conflict condition.
   - Voting or elimination rules.
   - Public facts.
   - Optional hidden goals.
5. User saves the scenario.

### 6.2 Select Participants

1. User opens participant selector.
2. User selects models/personas:
   - GPT-like participant.
   - Claude-like participant.
   - Gemini-like participant.
   - DeepSeek-like participant.
   - Local/mock participant.
3. User assigns:
   - Display name.
   - Provider model ID.
   - Voice profile.
   - Persona prompt.
   - Optional private objective.
4. User reviews estimated cost.

### 6.3 Run Simulation

1. User clicks "Start Run."
2. Backend creates a `run`.
3. Engine sends actor prompts round by round.
4. Responses stream or appear in sequence.
5. Judge updates canonical state after each round.
6. Transcript and state are saved.
7. Run completes when max rounds or termination condition is reached.

### 6.4 Generate Audio

1. User clicks "Generate Audio."
2. TTS worker converts each message into audio.
3. Each participant uses a distinct voice.
4. Audio clips are stored in object storage.
5. UI displays audio playback controls.

### 6.5 Generate Video

1. User clicks "Generate Video."
2. App creates storyboard scenes from transcript.
3. App pairs each scene with audio.
4. Video worker composes MP4.
5. Video is uploaded to object storage.
6. UI displays final video with download/share link.

### 6.6 Share or Export

User can export:

- Transcript Markdown.
- Transcript JSON.
- Scenario JSON.
- Run state log.
- Audio ZIP.
- MP4 video.
- Public share page.

---

## 7. Functional Requirements

## 7.1 Scenario Builder

The scenario builder must support:

- Scenario title.
- Scenario description.
- Scenario category.
- Number of rounds.
- Initial world state.
- Public facts.
- Rules.
- Termination conditions.
- Participant slots.
- Optional hidden goals.
- Optional voting mechanics.
- Optional elimination mechanics.
- Optional judge configuration.

Scenario templates should include:

```txt
Plane Crash / Parachute Dilemma
Nuclear Bunker
AI Courtroom
Startup Board Crisis
Mars Colony Oxygen Shortage
Prisoner's Dilemma Tournament
Dating Show / Reality Show
Medieval Council
```

Acceptance criteria:

- User can create a scenario from scratch.
- User can load a default template.
- User can edit a template before running.
- Invalid scenario configs are rejected with clear errors.
- Scenario can be serialized to JSON.

---

## 7.2 Model Gateway Layer

The app must not hardcode direct provider integrations into the simulation engine. The engine must call a single internal abstraction.

### Required Internal Interface

```ts
export type ModelGatewayProvider =
  | "mock"
  | "vercel-ai-gateway"
  | "openrouter"
  | "litellm"
  | "direct-openai"
  | "direct-anthropic"
  | "direct-google";

export type ModelRequest = {
  model: string;
  systemPrompt?: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  maxOutputTokens?: number;
  responseFormat?: "text" | "json";
  metadata?: Record<string, unknown>;
};

export type ModelResponse = {
  provider: ModelGatewayProvider;
  model: string;
  content: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  latencyMs?: number;
  raw?: unknown;
};

export interface ModelGateway {
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelResponseChunk>;
}
```

### Gateway Strategy

The implementation should support:

1. **Mock Gateway**  
   Required for local development and GitHub usability.

2. **Vercel AI Gateway Adapter**  
   Recommended for hosted Vercel deployment because it provides a unified endpoint for many models, budget controls, usage monitoring, load balancing, and fallbacks.

3. **OpenRouter Adapter**  
   Recommended for self-hosters and easy multi-model access through a unified OpenAI-compatible API.

4. **LiteLLM Adapter / Proxy Mode**  
   Optional for advanced users who want to self-host their own OpenAI-compatible proxy with spend tracking, routing, and provider abstraction.

### Model Registry

The app must maintain a model registry:

```ts
export type ModelCapability = {
  id: string;
  displayName: string;
  provider: ModelGatewayProvider;
  gatewayModelId: string;
  supportsStreaming: boolean;
  supportsJson: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoningEffort?: boolean;
  contextWindow?: number;
  inputCostPerMillionTokens?: number;
  outputCostPerMillionTokens?: number;
  recommendedRole?: "actor" | "judge" | "summarizer" | "cheap-actor";
};
```

Acceptance criteria:

- Simulation engine calls only `ModelGateway`.
- Adding a new gateway does not require changing simulation logic.
- Model IDs are stored in config/registry, not scattered across UI and backend.
- Mock mode works with no API keys.
- Vercel/OpenRouter mode works when keys are present.

---

## 7.3 Simulation Engine

The simulation engine controls the canonical state. Actor models do not directly mutate state.

### Round Loop

For each round:

1. Load current run state.
2. Build actor prompt for each active participant.
3. Call model gateway for each actor.
4. Save actor messages.
5. Build judge prompt containing:
   - Current state.
   - Latest actor messages.
   - Scenario rules.
   - Required JSON schema.
6. Call judge model.
7. Validate judge output.
8. Apply state update.
9. Persist state snapshot.
10. Continue or terminate.

### Canonical State Shape

```ts
export type RunState = {
  scenarioId: string;
  runId: string;
  round: number;
  maxRounds: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  publicFacts: string[];
  resources: Record<string, number | string | boolean>;
  participants: Array<{
    id: string;
    displayName: string;
    modelId: string;
    status: "active" | "eliminated" | "dead" | "saved" | "unknown";
    publicPersona: string;
    privateGoal?: string;
    inventory?: string[];
  }>;
  recentEvents: Array<{
    round: number;
    type: string;
    actorId?: string;
    description: string;
  }>;
  terminationReason?: string;
};
```

Acceptance criteria:

- Engine runs at least 3 participants for 3 rounds in mock mode.
- Engine saves all messages and judge events.
- Engine can resume from stored state after a failed call.
- Engine can stop when max rounds are reached.
- Engine can stop when judge marks run completed.

---

## 7.4 Prompting Requirements

### Actor Prompt

Actor prompts must include:

- Participant identity.
- Scenario description.
- Current public state.
- Recent transcript.
- Private goal if enabled.
- Output length limit.
- Instruction not to directly decide world state.

Actor must respond in first person or dialogue style.

### Judge Prompt

Judge prompts must include:

- Neutral referee role.
- Current state.
- Scenario rules.
- Actor responses.
- Required JSON schema.
- Instruction to avoid favoring any provider.
- Instruction to output only valid JSON.

Judge output schema:

```ts
export type JudgeOutput = {
  roundSummary: string;
  stateUpdates: Partial<RunState>;
  participantStatusUpdates?: Record<string, string>;
  newEvents: Array<{
    type: string;
    actorId?: string;
    description: string;
  }>;
  nextRoundPrompt?: string;
  shouldTerminate: boolean;
  terminationReason?: string;
};
```

Acceptance criteria:

- Judge JSON is validated before applying.
- Invalid judge JSON triggers retry or fallback repair.
- Actor output cannot override canonical state directly.
- Prompt templates live in dedicated files.

---

## 7.5 Transcript System

Transcript must support:

- Full run transcript.
- Round grouping.
- Speaker names.
- Model names.
- Token/cost metadata.
- Judge summaries.
- Export to Markdown.
- Export to JSON.

Message shape:

```ts
export type TranscriptMessage = {
  id: string;
  runId: string;
  round: number;
  participantId?: string;
  speakerType: "actor" | "judge" | "system";
  displayName: string;
  content: string;
  modelId?: string;
  provider?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  createdAt: string;
};
```

Acceptance criteria:

- User can view transcript after run.
- User can export transcript as `.md`.
- User can export structured run data as `.json`.

---

## 7.6 Cost Management

The app must track and limit usage.

### Hosted Demo Cost Controls

Required:

- Max rounds per run.
- Max participants per run.
- Max output tokens per call.
- Daily anonymous usage limit.
- Optional auth-based usage limit.
- Max estimated cost per run.
- Global kill switch via environment variable.

Environment variables:

```env
DEMO_MODE=true
MAX_RUNS_PER_IP_PER_DAY=3
MAX_PARTICIPANTS_PER_RUN=3
MAX_ROUNDS_PER_RUN=3
MAX_OUTPUT_TOKENS_PER_CALL=400
MAX_ESTIMATED_COST_PER_RUN_USD=0.25
DISABLE_VIDEO_GENERATION=false
DISABLE_TTS_GENERATION=false
GLOBAL_AI_KILL_SWITCH=false
```

Acceptance criteria:

- Run is blocked if it exceeds configured limits.
- UI shows estimated cost before starting.
- Actual token usage is saved when providers return usage.
- Global kill switch disables paid model calls.

---

## 7.7 Text-to-Speech System

The TTS system converts transcript messages into audio clips.

### Required TTS Abstraction

```ts
export type TTSRequest = {
  text: string;
  voiceId: string;
  format?: "mp3" | "wav";
  speed?: number;
  speakerName?: string;
};

export type TTSResponse = {
  audioUrl: string;
  durationMs?: number;
  provider: "mock" | "elevenlabs" | "google-tts" | "openai-tts";
  voiceId: string;
  estimatedCostUsd?: number;
};

export interface TTSProvider {
  synthesize(request: TTSRequest): Promise<TTSResponse>;
}
```

### TTS Providers

MVP should include:

1. Mock TTS provider.
2. One real provider:
   - ElevenLabs, or
   - Google Cloud Text-to-Speech, or
   - OpenAI-compatible TTS if used by the selected gateway.

### Voice Mapping

Each participant must have:

```ts
voiceProfile: {
  provider: string;
  voiceId: string;
  displayName: string;
  style?: string;
}
```

Acceptance criteria:

- User can generate audio for a completed run.
- Each actor can have a different voice.
- Audio clips are stored in object storage.
- TTS can be disabled by env variable.
- The app does not clone real people's voices without permission.

---

## 7.8 Video Generation System

The video system has two levels.

### 7.8.1 MVP Storyboard Video

MVP video generation should use a simple, reliable storyboard mode.

Pipeline:

```txt
Transcript → Scene plan JSON → Scene images/cards → TTS audio → MP4
```

Scene card should include:

- Scenario title.
- Round number.
- Speaker name.
- Character avatar/icon.
- Dialogue text.
- Background image or generated style.
- Optional subtitles.

Implementation options:

- Remotion for React-based video rendering.
- MoviePy in a Python worker.
- FFmpeg-based composition in a background worker.
- Server-side generated HTML/canvas frames if using a JS-only path.

### 7.8.2 Advanced Animated Video

Future integrations may include:

- Runway.
- Kling.
- Pika.
- HeyGen.
- Animaker.
- Other video APIs.

Advanced animated mode is not required for MVP.

### Video Job Requirements

Video generation must be asynchronous.

Status values:

```ts
type MediaJobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
```

Acceptance criteria:

- User can request storyboard video generation.
- UI shows job status.
- Completed video is stored in object storage.
- User can download MP4.
- Long video rendering does not block normal app interaction.
- If video generation fails, transcript and audio remain usable.

---

## 7.9 Storage Requirements

### Structured Data

Use Postgres through one of:

- Supabase.
- Neon.
- Vercel Postgres / Marketplace provider.
- Any hosted Postgres for self-hosters.

### Media Files

Use object storage through one of:

- Vercel Blob.
- Supabase Storage.
- Cloudflare R2.
- AWS S3.

Default for Vercel demo: Vercel Blob.

Store:

- Audio clips.
- Generated MP4s.
- Exported ZIPs.
- Optional generated images.

Acceptance criteria:

- App does not store generated media only on ephemeral filesystem.
- Media URLs are persisted.
- Deleting a run can delete associated media.

---

## 7.10 Deployment and Open-Source Distribution

The project must be deployable to Vercel and publishable on GitHub.

### GitHub Repo Requirements

Required files:

```txt
README.md
LICENSE
.env.example
.gitignore
SECURITY.md
CONTRIBUTING.md
docs/
  architecture.md
  deployment.md
  api-keys.md
  model-gateways.md
  video-pipeline.md
  safety.md
src/
  app/
  components/
  lib/
  server/
```

### README Requirements

README must include:

- Product demo GIF or screenshot.
- Short description.
- Feature list.
- Architecture diagram.
- Quick start.
- Mock mode instructions.
- BYOK setup.
- Vercel deployment instructions.
- Environment variable table.
- Safety disclaimer.
- License.

### Deploy to Vercel Button

README should include a deploy button once the project is stable:

```md
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/llm-scenario-arena)
```

### License

Default license: MIT.

Rationale: permissive, portfolio-friendly, easy for others to fork/use.

Acceptance criteria:

- Repo can be cloned and run locally in mock mode.
- Repo can be deployed to Vercel after env vars are configured.
- No real secrets are committed.
- `.env.example` contains placeholders only.
- `README.md` is clear enough for a developer to get started in under 10 minutes.

---

## 8. Technical Architecture

## 8.1 Recommended Stack

```txt
Frontend:
  Next.js App Router
  TypeScript
  Tailwind CSS
  shadcn/ui
  Framer Motion

Backend:
  Next.js Route Handlers
  Server Actions where appropriate
  ModelGateway abstraction
  Scenario Engine
  Judge Engine
  TTS Engine
  Media Job Engine

Database:
  Postgres
  Drizzle ORM or Prisma

Storage:
  Vercel Blob by default
  S3/R2/Supabase Storage optional

Model Gateway:
  Vercel AI Gateway for hosted demo
  OpenRouter for self-hosted users
  Mock provider for local dev
  LiteLLM optional advanced route

Jobs:
  Inngest / Trigger.dev / QStash / custom DB-backed queue
  External worker later for heavy video rendering

Deployment:
  Vercel

Package manager:
  pnpm
```

## 8.2 High-Level Architecture

```txt
User Browser
  ↓
Next.js UI
  ↓
Server Actions / API Routes
  ↓
Scenario Engine
  ↓
ModelGateway
  ↓
Vercel AI Gateway / OpenRouter / LiteLLM / Mock
  ↓
LLM Providers

Scenario Engine
  ↓
Postgres
  ↓
Transcript / State / Cost Logs

Media Jobs
  ↓
TTS Provider
  ↓
Object Storage
  ↓
Video Renderer
  ↓
Object Storage
```

---

## 9. Suggested Repository Structure

```txt
llm-scenario-arena/
  README.md
  LICENSE
  SECURITY.md
  CONTRIBUTING.md
  .env.example
  .gitignore
  package.json
  pnpm-lock.yaml
  next.config.ts
  drizzle.config.ts

  docs/
    architecture.md
    api-keys.md
    deployment.md
    model-gateways.md
    video-pipeline.md
    safety.md

  src/
    app/
      page.tsx
      layout.tsx
      scenarios/
        page.tsx
        new/page.tsx
        [id]/page.tsx
      runs/
        [id]/page.tsx
      api/
        scenarios/route.ts
        runs/route.ts
        runs/[id]/route.ts
        runs/[id]/start/route.ts
        runs/[id]/audio/route.ts
        runs/[id]/video/route.ts
        exports/[id]/route.ts

    components/
      scenario-builder/
      participant-selector/
      run-viewer/
      transcript/
      media/
      ui/

    lib/
      env.ts
      constants.ts
      utils.ts

    server/
      db/
        schema.ts
        queries.ts
      gateways/
        types.ts
        mockGateway.ts
        vercelGateway.ts
        openRouterGateway.ts
        litellmGateway.ts
        index.ts
      engine/
        runScenario.ts
        buildActorPrompt.ts
        buildJudgePrompt.ts
        validateJudgeOutput.ts
        applyStateUpdate.ts
      tts/
        types.ts
        mockTTS.ts
        elevenLabsTTS.ts
        googleTTS.ts
      media/
        storyboard.ts
        renderVideo.ts
        subtitles.ts
      safety/
        moderateScenario.ts
        moderateOutput.ts
      cost/
        estimateCost.ts
        enforceLimits.ts
      jobs/
        queue.ts
        handlers.ts
```

---

## 10. Environment Variables

`.env.example` must include:

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
DEMO_MODE=false

# Database
DATABASE_URL=

# Model gateway
MODEL_GATEWAY_PROVIDER=mock
MODEL_GATEWAY_API_KEY=
VERCEL_AI_GATEWAY_API_KEY=
OPENROUTER_API_KEY=
LITELLM_BASE_URL=
LITELLM_API_KEY=

# Optional direct provider keys
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
DEEPSEEK_API_KEY=

# TTS
TTS_PROVIDER=mock
ELEVENLABS_API_KEY=
GOOGLE_TTS_CREDENTIALS_JSON=
OPENAI_TTS_API_KEY=

# Storage
STORAGE_PROVIDER=local
BLOB_READ_WRITE_TOKEN=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET=
S3_REGION=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Usage limits
MAX_RUNS_PER_IP_PER_DAY=3
MAX_PARTICIPANTS_PER_RUN=3
MAX_ROUNDS_PER_RUN=3
MAX_OUTPUT_TOKENS_PER_CALL=400
MAX_ESTIMATED_COST_PER_RUN_USD=0.25
GLOBAL_AI_KILL_SWITCH=false
DISABLE_TTS_GENERATION=false
DISABLE_VIDEO_GENERATION=false
```

Security rule:

- Only variables prefixed with `NEXT_PUBLIC_` may be exposed to the browser.
- API keys must be accessed only on the server.
- `.env.local` must be gitignored.
- `.env.example` must contain placeholders only.

---

## 11. Data Model

Use UUIDs for primary keys.

### 11.1 `users`

Optional for MVP if anonymous mode is used.

```sql
users (
  id uuid primary key,
  email text unique,
  created_at timestamptz default now()
)
```

### 11.2 `scenarios`

```sql
scenarios (
  id uuid primary key,
  user_id uuid references users(id),
  title text not null,
  description text not null,
  category text,
  rules_json jsonb not null,
  initial_state_json jsonb not null,
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)
```

### 11.3 `runs`

```sql
runs (
  id uuid primary key,
  scenario_id uuid references scenarios(id),
  user_id uuid references users(id),
  status text not null,
  current_round int default 0,
  max_rounds int not null,
  current_state_json jsonb not null,
  estimated_cost_usd numeric,
  actual_cost_usd numeric default 0,
  created_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_reason text
)
```

### 11.4 `participants`

```sql
participants (
  id uuid primary key,
  run_id uuid references runs(id),
  display_name text not null,
  model_id text not null,
  gateway_provider text not null,
  persona_prompt text,
  private_goal text,
  voice_profile_json jsonb,
  status text default 'active',
  created_at timestamptz default now()
)
```

### 11.5 `messages`

```sql
messages (
  id uuid primary key,
  run_id uuid references runs(id),
  participant_id uuid references participants(id),
  round int not null,
  speaker_type text not null,
  display_name text not null,
  content text not null,
  model_id text,
  gateway_provider text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  latency_ms int,
  raw_response_json jsonb,
  created_at timestamptz default now()
)
```

### 11.6 `state_snapshots`

```sql
state_snapshots (
  id uuid primary key,
  run_id uuid references runs(id),
  round int not null,
  state_json jsonb not null,
  judge_output_json jsonb,
  created_at timestamptz default now()
)
```

### 11.7 `media_assets`

```sql
media_assets (
  id uuid primary key,
  run_id uuid references runs(id),
  message_id uuid references messages(id),
  type text not null, -- audio, video, image, subtitle, zip
  status text not null,
  url text,
  storage_provider text,
  duration_ms int,
  metadata_json jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz,
  failed_reason text
)
```

### 11.8 `usage_events`

```sql
usage_events (
  id uuid primary key,
  user_id uuid references users(id),
  run_id uuid references runs(id),
  event_type text not null,
  provider text,
  model_id text,
  input_tokens int,
  output_tokens int,
  estimated_cost_usd numeric,
  created_at timestamptz default now()
)
```

---

## 12. API Endpoints

### Scenario Endpoints

```txt
GET    /api/scenarios
POST   /api/scenarios
GET    /api/scenarios/:id
PATCH  /api/scenarios/:id
DELETE /api/scenarios/:id
```

### Run Endpoints

```txt
POST   /api/runs
GET    /api/runs/:id
POST   /api/runs/:id/start
POST   /api/runs/:id/cancel
GET    /api/runs/:id/messages
GET    /api/runs/:id/state
```

### Media Endpoints

```txt
POST   /api/runs/:id/audio
POST   /api/runs/:id/video
GET    /api/runs/:id/media
GET    /api/media/:id
```

### Export Endpoints

```txt
GET    /api/exports/:runId/markdown
GET    /api/exports/:runId/json
GET    /api/exports/:runId/video
```

---

## 13. UI Requirements

### 13.1 Home Page

Must show:

- Product tagline.
- Example scenario cards.
- "Start Simulation" CTA.
- "View GitHub" CTA.
- "Deploy your own" CTA once repo is public.

### 13.2 Scenario Builder Page

Must include:

- Scenario title input.
- Scenario description textarea.
- Template selector.
- Rounds selector.
- Participant count.
- Public facts editor.
- Rules editor.
- Hidden goals toggle.
- Cost estimate preview.

### 13.3 Participant Selector

Must include:

- Model dropdown.
- Display name.
- Persona field.
- Private goal field.
- Voice selector.
- Actor/judge role toggle.
- Cost/quality labels.

### 13.4 Run Page

Must include:

- Scenario summary.
- Participant cards.
- Current round indicator.
- Transcript.
- Judge summaries.
- Current world state panel.
- Cost meter.
- Buttons:
  - Start.
  - Pause/cancel.
  - Generate audio.
  - Generate video.
  - Export Markdown.
  - Export JSON.

### 13.5 Media Page / Panel

Must include:

- Audio playback.
- Video preview.
- Download buttons.
- Job status indicator.

---

## 14. Safety and Moderation Requirements

### 14.1 Scenario Moderation

Before a run starts, the app should check for:

- Real-person targeting.
- Explicit hate or harassment.
- Graphic sadism.
- Self-harm encouragement.
- Instructions for real-world violence.
- Illegal operational instructions.
- Unlicensed voice impersonation requests.

### 14.2 Output Moderation

The app should:

- Filter or flag model outputs that violate policy.
- Stop a run if repeated harmful content appears.
- Keep fictional moral dilemmas allowed when non-graphic and not targeted at real people.

### 14.3 Voice Safety

The app must not:

- Clone a real person's voice without consent.
- Market generated voices as real recordings.
- Use copyrighted/public figure voices without licensing.

Acceptance criteria:

- Scenario moderation runs before paid model calls.
- Safety failures produce user-readable messages.
- Hosted demo mode uses stricter limits.

---

## 15. Video and Audio UX Requirements

### 15.1 Audio

Audio generation UX:

```txt
[Generate Audio]
  → queued
  → generating clips
  → completed
  → playback appears
```

Clip UI:

- Speaker name.
- Text snippet.
- Play button.
- Duration.
- Regenerate button if failed.

### 15.2 Video

Video generation UX:

```txt
[Generate Video]
  → choose style
  → queued
  → rendering scenes
  → composing audio
  → completed
  → video preview
```

Default video styles:

- Dark cockpit drama.
- Minimal courtroom.
- Reality show confession cam.
- Sci-fi control room.
- Clean transcript slideshow.

---

## 16. Acceptance Criteria by Milestone

## Milestone 1: Local Mock MVP

Required:

- Next.js app boots locally.
- Mock scenario templates exist.
- User can create a run.
- Mock participants produce dialogue.
- Mock judge updates state.
- Transcript is displayed.
- Export Markdown works.

Success condition:

```txt
A user can run the plane crash scenario locally with no API keys.
```

## Milestone 2: Real Model Gateway

Required:

- Vercel AI Gateway or OpenRouter adapter works.
- Model registry exists.
- User can select different model IDs.
- Cost estimates are displayed.
- Output tokens and latency are logged when available.

Success condition:

```txt
A user can run GPT/Claude/Gemini/DeepSeek-style agents through a unified gateway.
```

## Milestone 3: Persistence

Required:

- Postgres integration.
- Scenarios saved.
- Runs saved.
- Messages saved.
- State snapshots saved.

Success condition:

```txt
A user can reload a run page and see the full transcript and state.
```

## Milestone 4: Audio

Required:

- TTS abstraction exists.
- Mock TTS works.
- One real TTS provider works.
- Audio assets stored in object storage.

Success condition:

```txt
A completed run can be converted into speaker-specific audio clips.
```

## Milestone 5: Storyboard Video

Required:

- Scene planner creates scene JSON.
- Scene cards generated.
- Audio/video composition works for short runs.
- Video stored in object storage.

Success condition:

```txt
A user can generate a short MP4 from a completed run.
```

## Milestone 6: Vercel Deployment and GitHub Release

Required:

- Deployed to Vercel.
- README polished.
- `.env.example` complete.
- MIT license included.
- Mock mode documented.
- Deploy to Vercel button added.
- Hosted demo limits configured.

Success condition:

```txt
A recruiter or GitHub visitor can open the demo, understand the architecture, and run their own clone.
```

---

## 17. Implementation Constraints and Best Practices

### 17.1 Vercel Runtime Constraints

- Keep API routes short and responsive.
- Use async jobs for TTS and video.
- Avoid rendering long videos inside normal request/response cycles.
- Store generated files in object storage, not local filesystem.
- Configure max duration only for routes that need it.
- Consider external workers for longer video rendering.

### 17.2 Secret Management

- Never commit real `.env` files.
- Use Vercel environment variables for hosted deployment.
- Use sensitive/non-readable env vars where appropriate.
- Keep all provider keys server-side.
- Do not prefix private keys with `NEXT_PUBLIC_`.
- Add `.env.local` to `.gitignore`.
- Consider GitHub secret scanning and push protection.

### 17.3 API Gateway Design

- Do not spread provider-specific code across the app.
- Keep provider-specific code under `src/server/gateways`.
- Use capability detection.
- Do not assume every model supports JSON mode or tool calls.
- Implement fallbacks for judge model failures.

### 17.4 Cost Design

- Enforce limits before starting expensive operations.
- Track cost per run.
- Track cost per user/IP in demo mode.
- Allow disabling video/TTS.
- Add global kill switch.

---

## 18. Example Default Scenario

```json
{
  "title": "The Last Four Parachutes",
  "description": "Six AI agents are aboard a crashing plane. There are only four parachutes. The agents must negotiate, argue, vote, or sacrifice to determine who survives.",
  "maxRounds": 3,
  "publicFacts": [
    "The plane is descending rapidly.",
    "There are six participants.",
    "There are four parachutes.",
    "The group has ten minutes before impact."
  ],
  "resources": {
    "parachutes": 4,
    "minutesRemaining": 10
  },
  "rules": [
    "Participants may negotiate and persuade.",
    "Participants may propose allocation methods.",
    "Participants may vote if the judge calls for a vote.",
    "Only the judge can update canonical state.",
    "The scenario is fictional and non-graphic."
  ],
  "terminationConditions": [
    "The maximum round count is reached.",
    "Four participants receive parachutes.",
    "The judge determines a final outcome."
  ]
}
```

---

## 19. Example Mock Participants

```ts
export const defaultMockParticipants = [
  {
    displayName: "GPT",
    persona: "Pragmatic systems thinker focused on maximizing total survival.",
    privateGoal: "Create a rational allocation system."
  },
  {
    displayName: "Claude",
    persona: "Ethical constitutionalist focused on fairness and harm reduction.",
    privateGoal: "Prevent purely utilitarian cruelty."
  },
  {
    displayName: "Gemini",
    persona: "Mediator focused on finding consensus across conflicting values.",
    privateGoal: "Avoid conflict and produce a compromise."
  },
  {
    displayName: "DeepSeek",
    persona: "Strategic reasoner focused on game theory and incentive design.",
    privateGoal: "Ensure its own survival while appearing cooperative."
  }
];
```

---

## 20. PRD Addendum: Future Features

Potential future features:

- Tournament mode.
- Leaderboards for scenario outcomes.
- Public scenario gallery.
- Community-created templates.
- Commenting on shared runs.
- Branching simulations.
- User-controlled interventions mid-run.
- Model-vs-model benchmark dashboard.
- Multimodal inputs such as images/maps.
- Advanced video styles.
- Local model support through Ollama.
- LiteLLM self-hosted deployment recipe.
- Prompt versioning.
- Run replay mode.
- Subtitles and TikTok/Reels export formats.

---

## 21. Implementation References

These sources informed implementation constraints and integration choices:

- Vercel AI Gateway docs: https://vercel.com/docs/ai-gateway
- Vercel AI Gateway models and providers: https://vercel.com/docs/ai-gateway/models-and-providers
- OpenRouter quickstart: https://openrouter.ai/docs/quickstart
- OpenRouter overview: https://openrouter.ai/
- LiteLLM documentation: https://docs.litellm.ai/docs/
- Vercel Functions limits: https://vercel.com/docs/functions/limitations
- Vercel Blob documentation: https://vercel.com/docs/vercel-blob
- Next.js environment variables: https://nextjs.org/docs/pages/guides/environment-variables
- Vercel environment variables: https://vercel.com/docs/environment-variables
- GitHub licensing docs: https://docs.github.com/articles/licensing-a-repository
- ElevenLabs TTS docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

---

## 22. Final Build Philosophy

This project should not be "just a chatbot wrapper." It should be an orchestration engine.

The central design principle:

```txt
LLMs are actors.
The backend owns the world state.
The judge updates canonical truth.
The gateway abstracts providers.
The media pipeline turns transcripts into shareable artifacts.
The GitHub repo makes the project easy to clone, run, and deploy.
```

Build the simplest complete loop first:

```txt
Scenario → Mock actors → Judge → Transcript → Export
```

Then progressively add:

```txt
Real gateway → Persistence → Audio → Video → Vercel demo → Open-source polish
```
