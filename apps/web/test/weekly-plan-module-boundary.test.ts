import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (file: string) =>
  readFileSync(new URL(`../app/(app)/bunshins/[bunshinId]/${file}`, import.meta.url), 'utf8');

const sectionSource = source('weekly-plan-section.tsx');
const cardSource = source('weekly-plan-card.tsx');
const formSource = source('weekly-plan-item-form.tsx');
const typesSource = source('weekly-plan-types.ts');

describe('weekly plan module boundary', () => {
  it('keeps network mutation and refresh ownership in the section controller', () => {
    expect(sectionSource).toContain('async function mutation');
    expect(sectionSource).toContain('router.refresh()');
    expect(cardSource).not.toContain('fetch(');
    expect(formSource).not.toContain('fetch(');
  });

  it('delegates plan cards and item forms to focused modules', () => {
    expect(sectionSource).toContain('<WeeklyPlanCard');
    expect(cardSource).toContain('<WeeklyPlanItemForm');
    expect(formSource).toContain('SOCIAL_PREFERRED_FORMATS.map');
    expect(typesSource).toContain('export interface WeeklyPlanView');
    expect(sectionSource).not.toContain('window.confirm');
  });
});
