import 'server-only';
import { randomUUID } from 'node:crypto';
import { createMcpHandler, McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { ExternalReadError } from '@bunshin/application';
import { z } from 'zod';

interface ReadService {
  execute(authorization: string, requestId: string): Promise<unknown>;
}
export interface ExternalAiMcpServices {
  memberActivity: ReadService;
  dailyPostIdeas: ReadService;
  campaignBrief: ReadService;
}

const inputSchema = z.object({}).strict();
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function result(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data) }],
  };
}

function failure(error: unknown) {
  const code = error instanceof ExternalReadError ? error.code : 'UNAVAILABLE';
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `read unavailable (${code})` }],
  };
}

export function createExternalAiMcpHandler(services: ExternalAiMcpServices) {
  return createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({ name: 'watashi-works-external-read', version: '1.0.0' });
      const invoke = async (service: ReadService, authentication?: AuthInfo) => {
        if (!authentication) return failure(new ExternalReadError('DENIED'));
        try {
          return result(
            await service.execute(
              `Bearer ${authentication.token}`,
              randomUUID().replaceAll('-', ''),
            ),
          );
        } catch (error) {
          return failure(error);
        }
      };
      server.registerTool(
        'get_member_activity',
        {
          title: '本人の活動実績を取得',
          description: '本人が許可したBunshinの7日・30日の活動集計を読み取ります。',
          inputSchema,
          annotations,
        },
        async () => invoke(services.memberActivity, authInfo),
      );
      server.registerTool(
        'get_daily_post_ideas',
        {
          title: '本人の投稿案を取得',
          description: '本人が許可したBunshinの直近7日の投稿案を読み取ります。',
          inputSchema,
          annotations,
        },
        async () => invoke(services.dailyPostIdeas, authInfo),
      );
      server.registerTool(
        'get_campaign_brief',
        {
          title: '参加中の企業企画を取得',
          description: '本人が参加中で参照可能な企業企画と公開用制作条件を読み取ります。',
          inputSchema,
          annotations,
        },
        async () => invoke(services.campaignBrief, authInfo),
      );
      return server;
    },
    { legacy: 'stateless', maxRequestBodySize: 65_536 },
  );
}
