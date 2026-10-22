import { describe, expect, it } from 'vitest';
import {
  SIDE_HUSTLE_CATEGORIES,
  SIDE_HUSTLE_COST_TIERS,
  SIDE_HUSTLE_DEVICES,
  SIDE_HUSTLE_FIT_BASES,
  SIDE_HUSTLE_REQUIREMENT_LEVELS,
} from '@bunshin/capability-training';
import {
  generateSideHustleProposal,
  SIDE_HUSTLE_PROPOSAL_SCHEMA,
  sideHustleProposalBody,
} from '../src/providers/openai-side-hustle-proposal';

describe('side hustle provider schema', () => {
  it('matches the PR-2 output contract with strict objects and enum constants', () => {
    expect(SIDE_HUSTLE_PROPOSAL_SCHEMA.additionalProperties).toBe(false);
    expect(SIDE_HUSTLE_PROPOSAL_SCHEMA.required).toEqual([
      'status',
      'reason',
      'questions',
      'candidates',
    ]);
    const candidate = SIDE_HUSTLE_PROPOSAL_SCHEMA.properties.candidates.items;
    expect(candidate.additionalProperties).toBe(false);
    expect(candidate.required).toEqual(Object.keys(candidate.properties));
    expect(candidate.properties.category.enum).toEqual(SIDE_HUSTLE_CATEGORIES);
    expect(candidate.properties.initialCost.enum).toEqual(SIDE_HUSTLE_COST_TIERS);
    expect(candidate.properties.monthlyCost.enum).toEqual(SIDE_HUSTLE_COST_TIERS);
    expect(candidate.properties.workStyle.properties.device.enum).toEqual(SIDE_HUSTLE_DEVICES);
    expect(candidate.properties.workStyle.properties.faceExposure.enum).toEqual(
      SIDE_HUSTLE_REQUIREMENT_LEVELS,
    );
    expect(candidate.properties.fitReasons.items.properties.basedOn.items.enum).toEqual(
      SIDE_HUSTLE_FIT_BASES,
    );
  });

  it('sends excluded area labels and reasons but never the exclusion keywords', () => {
    const body = sideHustleProposalBody({
      model: 'gpt-test',
      safetyPolicy: 'safe',
      instructions: 'instruction',
      hearing: { freeText: { goal: '経験を活かしたい' } },
      missingConditions: ['weeklyHours'],
      excludedAreas: [{ label: '投資', reason: '損失リスクがあるため' }],
    });
    const parsed = JSON.parse(body) as { input: { role: string; content: string }[] };
    const user = JSON.parse(parsed.input[2]!.content) as Record<string, unknown>;
    expect(user['excludedAreas']).toEqual([{ label: '投資', reason: '損失リスクがあるため' }]);
    expect(parsed.input[2]!.content).not.toContain('keywords');
  });

  it('records malformed provider output as a failed attempt', async () => {
    const body = sideHustleProposalBody({
      model: 'gpt-5.2',
      safetyPolicy: 'safe',
      instructions: 'instruction',
      hearing: {},
      missingConditions: [],
      excludedAreas: [],
    });
    const response = new Response(
      JSON.stringify({
        status: 'completed',
        model: 'gpt-5.2',
        usage: { input_tokens: 10, output_tokens: 10 },
        output: [{ content: [{ type: 'output_text', text: JSON.stringify({ status: 'READY' }) }] }],
      }),
      { status: 200 },
    );
    const result = await generateSideHustleProposal({
      apiKey: 'test',
      model: 'gpt-5.2',
      provider: 'openai',
      modelCapabilities: ['STRUCTURED_OUTPUT'],
      body,
      fetch: () => Promise.resolve(response),
    });
    expect(result.value).toBeNull();
    expect(result.measurement.success).toBe(false);
    expect(result.measurement.validationResult).toBe('FAILED');
  });
});
