import 'server-only';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { ExternalReadError } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { authConfiguration } from '../auth/supabase';
import { createExternalAiMcpHandler } from '../mcp/external-ai-mcp';
import { createExternalAiMcpServices } from '../services/external-read';

const noStore = { 'cache-control': 'private, no-store' };

export function externalAiMcpResourceUrl() {
  return new URL('/api/mcp', getServerEnvironment().APP_URL);
}

export function externalAiProtectedResourceMetadata() {
  const resource = externalAiMcpResourceUrl();
  const issuer = `${new URL(authConfiguration().url).origin}/auth/v1`;
  return {
    resource: resource.toString(),
    authorization_servers: [issuer],
    bearer_methods_supported: ['header'],
    resource_name: 'ワタシワークス 外部AI読取',
  };
}

function unauthorized(resource: URL) {
  const metadata = new URL('/.well-known/oauth-protected-resource', resource).toString();
  return Response.json(
    { error: 'invalid_token' },
    {
      status: 401,
      headers: { ...noStore, 'www-authenticate': `Bearer resource_metadata="${metadata}"` },
    },
  );
}

function warnAuthenticationRejection(errorCode: string) {
  createLogger().warn('External MCP authentication rejected', {
    route: '/api/mcp',
    errorCode,
  });
}

export async function externalAiMcpResponse(request: Request) {
  const resource = externalAiMcpResourceUrl();
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  if (
    requestUrl.origin !== resource.origin ||
    requestUrl.pathname !== resource.pathname ||
    requestUrl.search ||
    (origin !== null && origin !== resource.origin)
  )
    return Response.json({ error: 'invalid_request' }, { status: 400, headers: noStore });
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    warnAuthenticationRejection('MCP_AUTHORIZATION_MISSING');
    return unauthorized(resource);
  }
  const services = await createExternalAiMcpServices(resource.toString());
  if (!services)
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: noStore });
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const credential = await Promise.race([
      services.verifier.verify(authorization, controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ExternalReadError('TIMEOUT'));
        }, 10_000);
      }),
    ]);
    if (!credential) {
      warnAuthenticationRejection('MCP_CREDENTIAL_REJECTED');
      return unauthorized(resource);
    }
    const token = /^Bearer (.+)$/i.exec(authorization)?.[1];
    if (!token) return unauthorized(resource);
    const authInfo: AuthInfo = {
      token,
      clientId: credential.clientId,
      scopes: [],
      expiresAt: Math.floor(credential.expiresAt.getTime() / 1000),
      resource,
      resourceMetadataUrl: new URL('/.well-known/oauth-protected-resource', resource).toString(),
    };
    const response = await createExternalAiMcpHandler(services).fetch(request, { authInfo });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    if (error instanceof ExternalReadError && error.code === 'DENIED')
      return unauthorized(resource);
    return Response.json({ error: 'service_unavailable' }, { status: 503, headers: noStore });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    controller.abort();
  }
}
