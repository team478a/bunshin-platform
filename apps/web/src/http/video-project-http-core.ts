import 'server-only';
import { z } from 'zod';

export const videoProjectUuid = z.string().uuid();

export function publicVideoProject<
  T extends {
    id: string;
    title: string;
    platform: string;
    type: string;
    durationSeconds: number;
    status: string;
    revision: number;
    aiProcessingTypes: unknown;
    standardComposition: boolean;
    scenes: unknown;
    disclosureSnapshot: unknown;
  },
>(project: T) {
  return {
    id: project.id,
    title: project.title,
    platform: project.platform,
    type: project.type,
    durationSeconds: project.durationSeconds,
    status: project.status,
    revision: project.revision,
    aiProcessingTypes: project.aiProcessingTypes,
    standardComposition: project.standardComposition,
    scenes: project.scenes,
    disclosureSnapshot: project.disclosureSnapshot,
  };
}
