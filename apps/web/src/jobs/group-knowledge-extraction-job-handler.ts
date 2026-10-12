import 'server-only';

import {
  GroupKnowledgeExtractionError,
  GroupKnowledgeService,
  type GroupKnowledgeExtractionJobHandler,
} from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
import { recordOpenAiUsageAndSettle } from '../ai/openai-cost-admission';
import { reserveOpenAiRuntimeConfiguration } from '../ai/runtime-provider-configuration';
import { withOrganizationAiGenerationQuota } from '../organization-ai-generation-quota';
import { SupabaseGroupKnowledgeStorage } from '../knowledge/group-knowledge-storage';
import {
  GROUP_KNOWLEDGE_EXTRACTION_PROMPT_VERSION,
  OpenAiGroupKnowledgeExtractor,
} from '../providers/openai-group-knowledge-extractor';

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
      const requestCount =
        source.type === 'VIDEO' ? 2 : source.type === 'PDF' || source.type === 'URL' ? 1 : 0;
      if (requestCount === 0)
        throw new GroupKnowledgeExtractionError('SOURCE_NOT_PROCESSABLE', false);
      const operationKey = `group-knowledge:${source.id}:attempt:${input.attemptCount}`;
      const runtime = await reserveOpenAiRuntimeConfiguration(
        operationKey,
        undefined,
        undefined,
        undefined,
        requestCount,
      );
      const started = Date.now();
      let providerAttempts = 0;
      let usagePersistenceStarted = false;
      const extractor = new OpenAiGroupKnowledgeExtractor({
        apiKey: runtime.apiKey,
        model: runtime.model,
        onProviderAttempt: () => {
          providerAttempts += 1;
        },
      });
      const storage = new SupabaseGroupKnowledgeStorage();
      try {
        const chunks = await withOrganizationAiGenerationQuota({
          workspaceId: input.workspaceId,
          groupId: input.groupId,
          operationKey,
          generate: async () => {
            if (source.type === 'PDF' && source.storageKey)
              return extractor.extractPdf({
                fileUrl: await storage.createReadUrl(source.storageKey),
                title: source.title,
              });
            if (source.type === 'VIDEO' && source.storageKey && source.mimeType)
              return extractor.extractVideo({
                fileUrl: await storage.createReadUrl(source.storageKey),
                title: source.originalFileName ?? source.title,
                mimeType: source.mimeType,
              });
            if (source.type === 'URL' && source.sourceUri)
              return extractor.extractUrl({ url: source.sourceUri, title: source.title });
            return null;
          },
        });
        if (!chunks) throw new GroupKnowledgeExtractionError('SOURCE_NOT_PROCESSABLE', false);
        usagePersistenceStarted = true;
        await recordOpenAiUsageAndSettle(runtime, {
          workspaceId: input.workspaceId,
          bunshinId: null,
          actorUserId: input.actorUserId,
          taskType: 'GROUP_KNOWLEDGE_EXTRACTION',
          provider: 'openai',
          model: runtime.model,
          promptVersion: GROUP_KNOWLEDGE_EXTRACTION_PROMPT_VERSION,
          status: 'SUCCESS',
          inputTokens: null,
          outputTokens: null,
          latencyMs: Date.now() - started,
          estimatedCostUsdMicros: providerAttempts * runtime.requestCostUsdMicros,
          pricingVersion: 'admin-request-cost-v1',
          idempotencyKey: operationKey,
        });
        await service.saveExtraction({ ...scope, sourceId: source.id, chunks });
      } catch (error) {
        if (!usagePersistenceStarted) {
          usagePersistenceStarted = true;
          await recordOpenAiUsageAndSettle(runtime, {
            workspaceId: input.workspaceId,
            bunshinId: null,
            actorUserId: input.actorUserId,
            taskType: 'GROUP_KNOWLEDGE_EXTRACTION',
            provider: 'openai',
            model: runtime.model,
            promptVersion: GROUP_KNOWLEDGE_EXTRACTION_PROMPT_VERSION,
            status: 'FAILED',
            inputTokens: null,
            outputTokens: null,
            latencyMs: Date.now() - started,
            estimatedCostUsdMicros: providerAttempts * runtime.requestCostUsdMicros,
            pricingVersion: 'admin-request-cost-v1',
            errorCode:
              error instanceof ApplicationError
                ? error.code
                : error instanceof GroupKnowledgeExtractionError
                  ? error.category
                  : 'INTERNAL_ERROR',
            idempotencyKey: operationKey,
          });
        }
        throw error;
      }
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
