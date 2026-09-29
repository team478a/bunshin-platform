import type { FortuneReadingView } from './fortune-reading';

export interface FortuneAiGenerationQueue {
  enqueue(input: {
    serviceSlug: string;
    actorUserId: string;
    readingId: string;
  }): Promise<FortuneReadingView | null>;
}

export interface FortuneGenerationJobLease {
  workspaceId: string;
  bunshinId: string;
  serviceSettingId: string;
  jobId: string;
  workerId: string;
  attemptCount: number;
}
