-- Read-only, operator-authorized Service scope only. Bind parameters, never paste secrets.
-- $1 workspace UUID, $2 Service/Group UUID, $3 window start, $4 exclusive window end.
-- Canonical cost source: PERSONAL_LEARNING_AI_CALL; do NOT add AiUsageEvent totals again.
-- Unknown/failed/missing telemetry is NOT zero cost. This is a known estimated subtotal.
WITH calls AS (
  SELECT e.program_enrollment_id, e.actor_user_id, e.mission_assignment_id,
         e.source_resource_id AS answer_id, e.metadata AS m
  FROM program_action_events e
  WHERE e.workspace_id = $1::uuid AND e.group_id = $2::uuid
    AND e.event_type = 'PERSONAL_LEARNING_AI_CALL'
    AND e.metadata->>'contractVersion' = 'AI_CALL_OBSERVABILITY_V1'
    AND e.occurred_at >= $3::timestamptz AND e.occurred_at < $4::timestamptz
), scoped AS (
  SELECT c.*, a.evaluation_status,
         CASE WHEN a.evaluation_status::text = 'READY'
           AND EXISTS (SELECT 1 FROM program_action_events ev
             WHERE ev.workspace_id = $1::uuid AND ev.group_id = $2::uuid
               AND ev.program_enrollment_id = c.program_enrollment_id
               AND ev.event_type = 'ANSWER_EVALUATED'
               AND ev.source_resource_type = 'TRAINING_MISSION_ANSWER'
               AND ev.source_resource_id = c.answer_id)
           THEN a.evaluation->>'result' ELSE NULL END AS result
  FROM calls c
  LEFT JOIN training_mission_answers a
    ON a.id = c.answer_id AND a.workspace_id = $1::uuid AND a.group_id = $2::uuid
    AND a.program_enrollment_id = c.program_enrollment_id AND a.user_id = c.actor_user_id
)
SELECT m->>'serviceProgramId' AS program_cohort_ref,
       m->>'provider' AS provider, m->>'model' AS model,
       m->'cost'->'pricing'->>'pricingVersion' AS pricing_version,
       m->'definition'->>'definitionKey' AS definition_key,
       m->'definition'->>'version' AS definition_version,
       count(*) AS attempts, count(DISTINCT actor_user_id) AS users,
       count(*) FILTER (WHERE m->'cost'->>'costStatus' = 'UNKNOWN') AS unknown_cost_attempts,
       sum((m->'cost'->>'totalCostUsdMicros')::numeric)
         FILTER (WHERE m->'cost'->>'costStatus' = 'ESTIMATED') AS known_estimated_usd_micros,
       sum((m->>'inputTokens')::numeric) AS known_input_tokens,
       sum((m->>'outputTokens')::numeric) AS known_output_tokens,
       count(*) FILTER (WHERE m->>'inputTokens' IS NULL OR m->>'outputTokens' IS NULL) AS missing_usage_attempts,
       avg((m->>'latencyMs')::numeric) AS average_latency_ms,
       count(*) FILTER (WHERE m->>'success' = 'false') AS failed_calls,
       count(*) FILTER (WHERE m->>'validationResult' = 'FAILED') AS validation_failures,
       count(DISTINCT answer_id) FILTER (WHERE result = 'PASS') AS assessed_pass_answers,
       count(DISTINCT answer_id) FILTER (WHERE result = 'REVIEW') AS assessed_review_answers
FROM scoped
GROUP BY m->>'serviceProgramId', m->>'provider', m->>'model',
         m->'cost'->'pricing'->>'pricingVersion',
         m->'definition'->>'definitionKey', m->'definition'->>'version';

-- For outcome/fit analysis, first aggregate attempts by scoped Answer/Assignment.
-- Join Feedback on workspace + group + enrollment + actor + assignment, not actor alone.
-- Join Router facts on enrollment + planId + planRevision + definition/version.
-- Joining all call attempts to all Router/Feedback events directly multiplies cost.
