import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemberProgramsEditor } from '../app/s/[serviceSlug]/programs/member-programs-editor';

const programsPage = readFileSync(
  new URL('../app/s/[serviceSlug]/programs/page.tsx', import.meta.url),
  'utf8',
);

const baseItem = {
  enrollmentId: '00000000-0000-4000-8000-000000000001',
  name: 'マナベルスタイル AI研修30日',
  guidance: '',
  modes: ['GUIDED'],
  memberMayChoose: false,
  preferredMode: 'GUIDED',
  notes: '',
  currentGoal: null,
  definitions: [],
};

describe('personal learning Program availability', () => {
  it('keeps the existing learning action for an ACTIVE training Program', () => {
    const html = renderToStaticMarkup(
      <MemberProgramsEditor
        serviceSlug="manaberu-style"
        items={[
          {
            ...baseItem,
            actionHref: '/s/manaberu-style/programs/00000000-0000-4000-8000-000000000001',
            availabilityMessage: null,
          },
        ]}
      />,
    );

    expect(html).toContain('今日やることを見る');
    expect(html).toContain('/s/manaberu-style/programs/');
    expect(html).not.toContain('開始案内をお待ちください');
  });

  it('shows preparation guidance without an execution link for a SUSPENDED Program', () => {
    const html = renderToStaticMarkup(
      <MemberProgramsEditor
        serviceSlug="manaberu-style"
        items={[
          {
            ...baseItem,
            name: 'マナベルスタイル Personal Learning',
            actionHref: null,
            availabilityMessage: 'このプログラムは準備中です。開始案内をお待ちください。',
          },
        ]}
      />,
    );

    expect(html).toContain('このプログラムは準備中です。開始案内をお待ちください。');
    expect(html).not.toContain('今日やることを見る');
    expect(html).not.toContain('href="/s/manaberu-style/programs/');
  });

  it('derives the action and preparation state from the persisted Program status', () => {
    expect(programsPage).toContain("const isProgramActive = program.status === 'ACTIVE'");
    expect(programsPage).toMatch(/actionHref:\s+hasLearningAction && isProgramActive/);
    expect(programsPage).toContain('hasLearningAction && !isProgramActive');
  });
});
