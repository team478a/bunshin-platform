import 'server-only';

import {
  GroupKnowledgeExtractionError,
  GroupKnowledgeService,
  type GroupKnowledgeExtractionJobHandler,
} from '@bunshin/application';
import { resolveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { SupabaseGroupKnowledgeStorage } from '../knowledge/group-knowledge-storage';
import { OpenAiGroupKnowledgeExtractor } from '../providers/openai-group-knowledge-extractor';

export function createGroupKnowledgeExtractionJobHandler(): GroupKnowledgeExtractionJobHandler {
  return {
    async execute(input) {
      const db = await import('@bunshin/database');
      const service = new GroupKnowledgeService(new db.PrismaGroupKnowledgeRepository());
      const scope = {
        workspaceId: input.workspaceId,
        groupId: input.groupId,
        actorUserId: input.actorUserId,
      };
      const source = (await service.listForManagement(scope)).find(
        (item) => item.id === input.sourceId,
      );
      if (!source) throw new GroupKnowledgeExtractionError('SOURCE_NOT_FOUND', false);
      if (source.status === 'REVIEW_REQUIRED' || source.status === 'ACTIVE') return;
      if (source.status !== 'PROCESSING')
        await service.beginProcessing({ ...scope, sourceId: source.id });
      const runtime = await resolveOpenAiRuntimeConfiguration();
      const extractor = new OpenAiGroupKnowledgeExtractor({
        apiKey: runtime.apiKey,
        model: runtime.model,
      });
      const storage = new SupabaseGroupKnowledgeStorage();
      const chunks =
        source.type === 'PDF' && source.storageKey
          ? await extractor.extractPdf({
              fileUrl: await storage.createReadUrl(source.storageKey),
              title: source.title,
            })
          : source.type === 'VIDEO' && source.storageKey && source.mimeType
            ? await extractor.extractVideo({
                fileUrl: await storage.createReadUrl(source.storageKey),
                title: source.originalFileName ?? source.title,
                mimeType: source.mimeType,
              })
            : source.type === 'URL' && source.sourceUri
              ? await extractor.extractUrl({ url: source.sourceUri, title: source.title })
              : null;
      if (!chunks) throw new GroupKnowledgeExtractionError('SOURCE_NOT_PROCESSABLE', false);
      await service.saveExtraction({ ...scope, sourceId: source.id, chunks });
    },
    async markFailed(input) {
      const db = await import('@bunshin/database');
      await new GroupKnowledgeService(new db.PrismaGroupKnowledgeRepository())
        .markFailed({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          actorUserId: input.actorUserId,
          sourceId: input.sourceId,
          failureCode: input.errorCode,
        })
        .catch(() => undefined);
    },
  };
}
