import 'server-only';
import {
  BindExternalReadCredential,
  ReadAuthenticatedExternalResource,
  ReadExternalCampaignBriefs,
  ReadExternalDailyPostIdeas,
  ReadExternalMemberUsage,
  ReadAuthenticatedExternalMemberUsage,
} from '@bunshin/application';
import { createExternalReadCredentialServices } from './external-read-credential';

/** PoC resource boundary. The reviewed client catalog remains empty by default. */
export async function createExternalReadServices() {
  const credentials = await createExternalReadCredentialServices();
  if (!credentials) return null;
  const db = await import('@bunshin/database');
  const usage = new db.PrismaMemberUsageRepository(db.prisma);
  return {
    binding: new BindExternalReadCredential(credentials.verifier, credentials.bindings),
    usage: new ReadAuthenticatedExternalMemberUsage(
      credentials.verifier,
      credentials.bindings,
      { authorization: credentials.bindings },
      usage,
      usage,
    ),
  };
}

/** Provider-neutral MCP composition. The reviewed client catalog remains the activation gate. */
export async function createExternalAiMcpServices(resourceUrl: string) {
  const credentials = await createExternalReadCredentialServices(resourceUrl);
  if (!credentials) return null;
  const db = await import('@bunshin/database');
  const usage = new db.PrismaMemberUsageRepository(db.prisma);
  const projection = new db.PrismaExternalAiReadProjection(db.prisma);
  const common = {
    verifier: credentials.verifier,
    bindings: credentials.bindings,
    ports: { authorization: credentials.bindings },
  };
  return {
    verifier: credentials.verifier,
    memberActivity: new ReadAuthenticatedExternalResource(
      common.verifier,
      common.bindings,
      common.ports,
      'member-usage:read',
      (ports) => new ReadExternalMemberUsage(ports, usage, usage),
    ),
    dailyPostIdeas: new ReadAuthenticatedExternalResource(
      common.verifier,
      common.bindings,
      common.ports,
      'daily-post-ideas:read',
      (ports) => new ReadExternalDailyPostIdeas(ports, projection),
    ),
    campaignBrief: new ReadAuthenticatedExternalResource(
      common.verifier,
      common.bindings,
      common.ports,
      'campaign-brief:read',
      (ports) => new ReadExternalCampaignBriefs(ports, projection),
    ),
  };
}
