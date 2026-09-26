import { describe, expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_NARRATION_VOICE,
  VIDEO_NARRATION_VOICES,
  type VideoPlanningContextRepository,
  type VideoProjectRepository,
  type VideoRenderProviderPort,
} from '../src/video-core-contracts';
import {
  CreateVideoProject,
  ExecuteVideoRenderStep as VideoCoreExecuteVideoRenderStep,
} from '../src/video-core';
import { ExecuteVideoRenderStep, QueueVideoRender } from '../src/video-render-execution';

describe('video core module boundary', () => {
  it('exposes contracts independently from application use cases', () => {
    const contractTypesCompile = <T>(value: T) => value;
    contractTypesCompile<VideoProjectRepository | null>(null);
    contractTypesCompile<VideoRenderProviderPort | null>(null);
    contractTypesCompile<VideoPlanningContextRepository | null>(null);

    expect(VIDEO_NARRATION_VOICES).toContain(DEFAULT_VIDEO_NARRATION_VOICE);
    expect(CreateVideoProject).toBeTypeOf('function');
    expect(ExecuteVideoRenderStep).toBeTypeOf('function');
    expect(QueueVideoRender).toBeTypeOf('function');
    expect(VideoCoreExecuteVideoRenderStep).toBe(ExecuteVideoRenderStep);
  });
});
