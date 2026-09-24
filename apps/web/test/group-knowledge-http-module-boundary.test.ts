import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readHttpModule = (name: string) => readFileSync(`src/http/${name}.ts`, 'utf8');

describe('group knowledge HTTP module boundaries', () => {
  it('keeps the existing route import module as a compatibility barrel', () => {
    const source = readHttpModule('group-knowledge');

    expect(source).toContain("from './group-knowledge-library'");
    expect(source).toContain("from './group-knowledge-upload'");
    expect(source).toContain("from './group-knowledge-review'");
    expect(source).toContain("from './group-knowledge-management'");
    expect(source).not.toContain("from '@bunshin/database'");
  });

  it('keeps upload storage separate from review and management', () => {
    const upload = readHttpModule('group-knowledge-upload');
    const review = readHttpModule('group-knowledge-review');
    const management = readHttpModule('group-knowledge-management');

    expect(upload).toContain('inspectUploadedObject');
    expect(review).not.toContain('SupabaseGroupKnowledgeStorage');
    expect(management).not.toContain('SupabaseGroupKnowledgeStorage');
  });

  it('keeps extraction job dispatch shared and review persistence scoped', () => {
    const core = readHttpModule('group-knowledge-http-core');
    const review = readHttpModule('group-knowledge-review');

    expect(core).toContain('GROUP_KNOWLEDGE_EXTRACTION_JOB_TYPE');
    expect(core).toContain('idempotencyKey: `group-knowledge:');
    expect(review).toContain('source: { workspaceId: scope.workspaceId, groupId: scope.groupId }');
  });
});
