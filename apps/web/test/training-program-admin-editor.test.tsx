import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ preset: 'AI_TRAINING_V1' }));
vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: (initial: unknown) => [
      initial === 'SIDE_HUSTLE_90_DAY' ? state.preset : initial,
      vi.fn(),
    ],
  };
});
import { ProgramAdminEditor } from '../app/(app)/admin/programs/program-admin-editor';

describe('training program creation UI', () => {
  it('shows canonical training as 30 days with fixed support modes and separate adoption', () => {
    state.preset = 'AI_TRAINING_V1';
    const html = renderToStaticMarkup(
      <ProgramAdminEditor workspaces={[{ id: 'workspace', name: '運営団体' }]} />,
    );
    expect(html).toContain('AI研修（30日・個別化実務実践）');
    const duration = html.match(/<input[^>]*name="standardDurationDays"[^>]*>/)?.[0];
    expect(duration).toMatch(/readonly/i);
    expect(duration).toContain('value="30"');
    expect(html).toContain('type="hidden" name="GUIDED" value="on"');
    expect(html).toContain('type="hidden" name="READY_TO_USE" value="on"');
    expect(html).not.toContain('name="IDEA_ONLY"');
    expect(html).toContain('サービスでの採用・受講登録は別操作です');
    expect(html).toContain('Skill提示やLINE配信は開始しません');
  });
  it.each(['SIMPLE', 'SIDE_HUSTLE_90_DAY'])(
    'preserves editable support choices for %s',
    (preset) => {
      state.preset = preset;
      const html = renderToStaticMarkup(<ProgramAdminEditor workspaces={[]} />);
      expect(html).toContain('type="checkbox" name="IDEA_ONLY"');
      expect(html).toContain('type="checkbox" name="GUIDED"');
      expect(html).not.toContain('type="hidden"');
    },
  );
});
