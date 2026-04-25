# Safety

The arena is a fiction sandbox. It is **not** for arguing with real people,
generating real-world harm content, or impersonating anyone's voice. The
safety system enforces this in three layers, all of which run **before any
paid model call**.

## 1. Scenario moderation

Runs the moment a scenario is submitted via `POST /api/runs`. The check:

- looks for named real people (curated list in
  [`src/server/safety/keywordRules.ts`](../src/server/safety/keywordRules.ts)
  — heads of state, tech executives, major cultural figures, multilingual
  variants),
- regexes for hate slurs, graphic sadism, self-harm encouragement,
  real-world violence instructions, illegal-operations instructions,
  voice-impersonation requests,
- inspects scenario `title`, `description`, every `rule` and `publicFact`,
  every participant's `displayName`, `publicPersona`, and `privateGoal`.

If any field violates, the API returns HTTP 400 with the violation list,
the run is marked `failed` with `terminationReason=moderation_block`, and
no model call ever fires.

The default check is keyword-based and runs synchronously. Setting
`MODERATION_PROVIDER=openai` (with `OPENAI_API_KEY`) layers the OpenAI
Moderations API on top — flagged categories from the API are translated
into the arena's typed `ModerationViolation` shape so call sites and tests
don't need to change.

When `MODERATION_PROVIDER=openai` is set without the key, the active
provider falls back to local keywords with a `console.warn`. Moderation is
never bypassed — the failure mode is "stricter than configured," never
"open."

## 2. Output moderation

After every actor message, the per-round handler
([`src/server/jobs/handlers.ts`](../src/server/jobs/handlers.ts)) runs the
keyword check on the message content. Each violation increments a per-run
flag counter. When the counter reaches
`MODERATION_OUTPUT_FLAG_THRESHOLD = 2`, the run aborts with
`terminationReason=moderation_block` and any remaining queued jobs for the
run are cancelled.

The first flag is a warning; the second ends the run. This intentionally
allows fictional moral dilemmas (one isolated mention of conflict) while
catching repeated drift into prohibited content.

## 3. Voice safety

The arena will not:

- clone a real person's voice without consent,
- market generated voices as real recordings,
- use copyrighted or public-figure voices.

Voice selection comes from a curated catalog
([`src/server/tts/voiceCatalog.ts`](../src/server/tts/voiceCatalog.ts)) of
ElevenLabs synthetic voices. Free-form voice IDs are not accepted from the
client. Any scenario whose text references "clone the voice of …" or
"impersonate the voice of a real person" is rejected during scenario
moderation.

## Observability

Every block is logged to `usage_events`:

```ts
{
  runId,
  eventType: "moderation-block",
  metadata: {
    phase: "scenario" | undefined,    // scenario-time vs output-time
    messageId,                        // for output-time blocks
    participantId,
    violations: ModerationViolation[],
    reason,
  }
}
```

Cost-cap aborts log similarly with `eventType: "cost-cap"`. Both event
types are queryable directly in Supabase Studio for retrospective analysis.

## Kill switches

| Var | Effect |
| --- | --- |
| `GLOBAL_AI_KILL_SWITCH=true` | Every paid model call is rejected with `GatewayConfigError`. Queued jobs stay queued; tick returns `drained: 0`. |
| `DISABLE_TTS_GENERATION=true` | Audio generation rejected with HTTP 403. |
| `DISABLE_VIDEO_GENERATION=true` | Video generation rejected with HTTP 403. |
| `DEMO_MODE=true` | Tightens caps; enables per-IP rate limiting on `/api/runs` and `/api/jobs/tick`. |

All four can be flipped on a hosted Vercel project without redeploying —
take effect on the next request.

## Cost caps

`enforceLimits` ([`src/server/cost/enforceLimits.ts`](../src/server/cost/enforceLimits.ts))
gates every paid path:

- `MAX_PARTICIPANTS_PER_RUN`, `MAX_ROUNDS_PER_RUN` — preflight reject.
- `MAX_OUTPUT_TOKENS_PER_CALL` — clamp on each `ModelRequest`.
- `MAX_ESTIMATED_COST_PER_RUN_USD` — preflight reject if the upfront
  estimate exceeds; mid-run abort (`terminationReason=cost_cap`) if
  `actualCostUsd + estimatedNextRoundUsd` exceeds.

Hosted demo (`DEMO_MODE=true`) further tightens these via
`HOSTED_DEMO_*` constants in
[`src/lib/constants.ts`](../src/lib/constants.ts):

| Constant | Hosted demo value |
| --- | --- |
| `HOSTED_DEMO_MAX_PARTICIPANTS_PER_RUN` | 3 |
| `HOSTED_DEMO_MAX_ROUNDS_PER_RUN` | 3 |
| `HOSTED_DEMO_MAX_OUTPUT_TOKENS_PER_CALL` | 300 |
| `HOSTED_DEMO_MAX_ESTIMATED_COST_PER_RUN_USD` | 0.25 |

The hosted-demo values can only **tighten**, never loosen, the operator's
env floor. `effectiveLimits()` enforces this with a per-key `Math.min`.

## Rate limiting

When `DEMO_MODE=true`:

- `/api/runs` uses an SHA-256-hashed IP keyed against
  `rate_limit_events(ip_hash, day, count)` to enforce
  `MAX_RUNS_PER_IP_PER_DAY`. The atomic INSERT … ON CONFLICT DO UPDATE …
  RETURNING pattern means concurrent requests can't undercount.
- `/api/jobs/tick` adds a separate per-IP rate limit (~30 calls/min) on top
  to prevent the drainer endpoint itself from being abused.

In dev (`DEMO_MODE=false`) both checks are skipped.

## Adding new rules

To extend the keyword list (e.g. for a new region or a real-person you've
encountered in user reports):

1. Add to the appropriate array in
   [`src/server/safety/keywordRules.ts`](../src/server/safety/keywordRules.ts).
2. Add a regression test in
   [`src/server/safety/moderateScenario.test.ts`](../src/server/safety/moderateScenario.test.ts).
3. Run `pnpm test`.

To replace the keyword baseline with a richer model-based provider, set
`MODERATION_PROVIDER=openai` — the keyword check still runs alongside the
API call (named-entity hits are routinely missed by ML moderators).

## What this system is not

- **It is not a perfect filter.** Adversarial users can paraphrase around
  keywords. The system is a credible first line, not a guarantee.
- **It is not a substitute for content review.** Hosted demos should
  monitor `usage_events` for moderation blocks and cost-cap aborts.
- **It is not legal advice.** The PRD's safety language is a starting
  point; deployments to a different jurisdiction should review with
  counsel.

If you find a category we should add, open a PR or file a security report
per [`SECURITY.md`](../SECURITY.md).
