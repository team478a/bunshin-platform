# Social Image Provider Comparison ADR

Date: 2026-11-18
Status: Accepted for PR-03 implementation

## Context

PR-03 must compare OpenAI and xAI across 20 image-generation subjects and introduce a deterministic provider-selection rule without making paid API calls. The current repository stores real image request history and per-request quality reports, but it has no approved real xAI comparison evidence. Treating invented fixture scores as production evidence would allow an unverified provider decision to affect paid generation.

## Decision

- Keep the 4-industry, 20-subject comparison dataset as immutable synthetic application fixtures with an explicit dataset version.
- Label the fixtures and every comparison screen as synthetic, not real API output, real pricing evidence, or operational proof.
- Implement aggregation and provider selection as pure, provider-neutral application policies.
- Apply eligibility in this order: active state, configured state, required feature support, maximum cost, minimum quality, and minimum success rate.
- Rank remaining providers deterministically by quality, success rate, regeneration rate, cost, latency, and provider key. Do not use AI to choose a provider or trigger regeneration.
- Use the existing AI Provider administration for model, expected request cost, monthly limit, activation, and emergency stop. Do not create a second settings screen or a new audit ledger.
- Show the deterministic result only as an administrator preview in PR-03. Do not connect synthetic comparison results to production request routing. A runtime AUTO mode requires approved real comparison evidence and a separate reviewed change.
- Add no database table or migration in PR-03. Existing request/quality/cost records remain the future source for measured operational comparison; synthetic fixtures are not persisted as production observations.

## Consequences

- The comparison UI, eight requested metrics, and deterministic rule can be tested without credentials or paid calls.
- Provider configuration and stop state remain authoritative and reusable.
- PR-03 cannot be described as real OpenAI/xAI quality validation or production automatic routing.
- After approved real API comparison, measured observations can replace synthetic inputs without moving provider-specific logic into SOCIAL Domain or Application orchestration.
