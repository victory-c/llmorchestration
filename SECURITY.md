# Security policy

## Scope

This is an OSS portfolio project. The hosted demo (if any) runs under
strict cost caps and is not intended to handle sensitive data. The threat
model is "cost abuse, content abuse, and key leakage" — not "compromise of
production user data."

## Reporting a vulnerability

Please email **victorchun@berkeley.edu** with:

- a description of the issue,
- steps to reproduce,
- the commit hash and (if applicable) the deployed URL,
- whether you're comfortable being credited.

Do **not** open a public issue for exploits. We'll acknowledge within ~3
business days and aim to ship a fix within 14 days for severe issues.

## In scope

- Bypasses of cost caps, rate limits, or the global kill switch.
- Bypasses of scenario or output moderation.
- API routes that leak data across run IDs or IPs.
- Exposed API keys, tokens, or secrets in the repo.
- SQL injection, SSRF, prompt-injection that exfiltrates env vars.
- Auth bypasses (when auth is added; current build has no auth).

## Out of scope

- Self-DoS via the moderation rules being too permissive on your own
  scenarios.
- LLM hallucinations or factual errors.
- Mock-mode running on `localhost` (it has no caps by design).
- Scenarios that hit `terminationReason=cost_cap` mid-run — that's the
  cap working.

## Hardening already in place

- Every paid model call goes through `enforceLimits` before reaching a
  gateway adapter.
- Moderation runs **before** any paid call (scenario-time + output-time).
- `GLOBAL_AI_KILL_SWITCH=true` blocks every paid call without a deploy.
- `/api/jobs/tick` uses a 60s lease + `FOR UPDATE SKIP LOCKED` to prevent
  double-claim under concurrent tickers; supports a shared-secret header.
- Per-IP daily run limits with SHA-256-hashed IPs (no plaintext IPs in
  the DB).
- `STORAGE_PROVIDER=local` is rejected at boot when running on Vercel.
- `.env.local` is in `.gitignore`; CI runs a `git grep` pattern for
  obvious secret prefixes.

## Practices when running your own deploy

- Use a project-specific OpenRouter / Vercel AI Gateway key. Don't share
  keys across deploys.
- Set `MAX_ESTIMATED_COST_PER_RUN_USD` conservatively. Consider $0.10 for
  public demos.
- Set `JOBS_TICK_TOKEN` and configure your cron / external worker to
  pass it; clients on Hobby don't need to pass it (rate-limited instead).
- Enable GitHub secret scanning + push protection on your fork.
- Rotate keys quarterly and after any contributor offboarding.

## Acknowledgements

Reporters are credited in release notes when they consent. Thank you for
making the project safer.
