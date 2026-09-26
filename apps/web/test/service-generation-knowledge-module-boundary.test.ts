import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) =>
  readFileSync(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8');

describe('service generation knowledge module boundaries', () => {
  it('keeps the public server-only entrypoint implementation free', () => {
    const barrel = readSource('service-generation-knowledge');
    expect(barrel).toContain("import 'server-only'");
    expect(barrel).not.toContain("import('@bunshin/database')");
    expect(barrel).toContain("from './service-generation-knowledge-loader'");
  });

  it('separates prompt formatting, assistance resolution and persistence loading', () => {
    expect(readSource('service-generation-knowledge-prompt')).toContain(
      'export function serviceKnowledgeForPrompt',
    );
    expect(readSource('service-content-assistance-level')).toContain(
      'export async function resolveServiceContentAssistanceLevel',
    );
    expect(readSource('service-generation-knowledge-loader')).toContain(
      'export async function loadServiceGenerationKnowledge',
    );
  });
});
