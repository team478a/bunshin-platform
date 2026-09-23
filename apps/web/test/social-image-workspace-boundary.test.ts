import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const controllerSource = readFileSync(
  new URL('../app/ui/social-image-workspace.tsx', import.meta.url),
  'utf8',
);
const viewSource = readFileSync(
  new URL('../app/ui/social-image-workspace-view.tsx', import.meta.url),
  'utf8',
);
const modelSource = readFileSync(
  new URL('../app/ui/social-image-workspace-model.ts', import.meta.url),
  'utf8',
);

describe('social image workspace boundary', () => {
  it('keeps network and state orchestration in the controller', () => {
    expect(controllerSource).toContain('fetch(`${endpoint}/${requestId}`');
    expect(controllerSource).toContain('<SocialImageWorkspaceView');
    expect(viewSource).not.toContain('fetch(');
  });

  it('keeps mobile creation and review rendering in the view', () => {
    expect(viewSource).toContain('青いボタンを押してください');
    expect(viewSource).toContain('この1枚を直す');
    expect(viewSource).toContain('iPhoneで保存する方法');
    expect(controllerSource).not.toContain('social-image-preview');
  });

  it('shares explicit mission, media and request view models', () => {
    expect(modelSource).toContain('export type SocialImageMission');
    expect(modelSource).toContain('export type SocialImageSavedPhoto');
    expect(modelSource).toContain('export type SocialImageRequestView');
    expect(controllerSource).toContain("from './social-image-workspace-model'");
    expect(viewSource).toContain("from './social-image-workspace-model'");
  });
});
