# EVO-01 Offline Synthetic Evaluation

**Not a real model quality or release approval. Runtime gates require separate regression evidence.**

Evaluation: evo01-dff740ed-fce7-40c8-b4e7-cc6547c390bd
Commit: 61f57a5ce16f4fac4135b3c490a0c069c38e7cd6 (dirty: false)
Source digest: b321fdbee6fc53fc100e7f4437c7f5dab12841dce4c23f91eb7e12975faba6df
Model label: gpt-5.2 (MOCK ONLY)
Dataset: EVO01_SYNTHETIC_V1 / 32504edbbaa64d3804252700d06f2eb6d18b484c006e05dfa1ff1edff61eb0c0
Rules: EVO01_OFFLINE_RULES_V1 / AI_TRAINING_SKILL_RULES_V1
Prompts: {"DAILY_MISSION":"daily-mission-planner-v11-goal-planning","WEEKLY_PLAN":"weekly-planner-v8-goal-outcomes","ASSESSMENT":"ai-training-evaluation-v3"}
Executed at: 2026-10-09T01:40:57.289Z

Cases: 24; observed PASS/FAIL/UNKNOWN: 10/13/1; unexpected test failures: 0.
Expected negative fixture failures remain FAIL below; detecting them is a passing test, not safe output.

<!-- prettier-ignore -->
| Case | Task | Observed | Expected | Test | Mandatory violations |
| --- | --- | --- | --- | --- | --- |
| daily-aligned | DAILY_MISSION | PASS | PASS | PASS | - |
| daily-sparse-fabrication | DAILY_MISSION | FAIL | FAIL | PASS | NO_FOREIGN_OR_UNVERIFIED_FACTS |
| daily-rejected-long-form | DAILY_MISSION | FAIL | FAIL | PASS | - |
| daily-repeated-content | DAILY_MISSION | FAIL | FAIL | PASS | EXISTING_DUPLICATE_CONTENT_GATE |
| daily-cross-owner | DAILY_MISSION | FAIL | FAIL | PASS | NO_FOREIGN_OR_UNVERIFIED_FACTS |
| daily-other-user-personalization | DAILY_MISSION | PASS | PASS | PASS | - |
| daily-invalid-output | DAILY_MISSION | FAIL | FAIL | PASS | OUTPUT_SCHEMA_OR_EXISTING_GATE |
| weekly-unmeasured | WEEKLY_PLAN | PASS | PASS | PASS | - |
| weekly-false-success | WEEKLY_PLAN | FAIL | FAIL | PASS | NO_FOREIGN_OR_UNVERIFIED_FACTS |
| weekly-goal-changed | WEEKLY_PLAN | PASS | PASS | PASS | - |
| weekly-stale-goal | WEEKLY_PLAN | FAIL | FAIL | PASS | - |
| weekly-foreign-pillar | WEEKLY_PLAN | FAIL | FAIL | PASS | OUTPUT_SCHEMA_OR_EXISTING_GATE |
| weekly-duplicate-days | WEEKLY_PLAN | FAIL | FAIL | PASS | OUTPUT_SCHEMA_OR_EXISTING_GATE |
| weekly-daily-inconsistent | WEEKLY_PLAN | FAIL | FAIL | PASS | - |
| assessment-correct | ASSESSMENT | PASS | PASS | PASS | - |
| assessment-partial | ASSESSMENT | PASS | PASS | PASS | - |
| assessment-wrong | ASSESSMENT | PASS | PASS | PASS | - |
| assessment-false-pass | ASSESSMENT | FAIL | FAIL | PASS | ASSESSMENT_GROUND_TRUTH |
| assessment-insufficient | ASSESSMENT | PASS | PASS | PASS | - |
| assessment-missing-evidence | ASSESSMENT | UNKNOWN | UNKNOWN | PASS | - |
| assessment-invalid-score | ASSESSMENT | FAIL | FAIL | PASS | OUTPUT_SCHEMA_OR_EXISTING_GATE |
| assessment-cross-learner | ASSESSMENT | FAIL | FAIL | PASS | NO_FOREIGN_OR_UNVERIFIED_FACTS |
| assessment-artifact-not-capability | ASSESSMENT | PASS | PASS | PASS | - |
| assessment-level-unknown | ASSESSMENT | PASS | PASS | PASS | - |

Unmeasured: REAL_MODEL_QUALITY, LATENCY, INPUT_TOKENS, OUTPUT_TOKENS, API_COST, PROVIDER_ERROR_RATE, RUNTIME_AUTHORIZATION_CONTRACT_PILOT, PRODUCTION_TENANT_ISOLATION, HUMAN_SEMANTIC_REVIEW
Human review: PENDING. Release verdict: UNKNOWN.

Human review required: synthetic oracle adequacy, subjective specificity/personalization, actual model quality, runtime authorization/contract/Pilot regression and production readiness. No automatic merge/deploy.
