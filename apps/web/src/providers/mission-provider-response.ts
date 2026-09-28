import 'server-only';
import { ApplicationError } from '@bunshin/shared';

type ResponseValue = {
  status?: unknown;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  error?: unknown;
};

export function missionProviderFailure(reason: string, httpStatus?: number) {
  return new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'mission provider unavailable', {
    reason,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  });
}

export function missionTransportFailure(error: unknown) {
  const name = error instanceof Error ? error.name : '';
  return missionProviderFailure(
    name === 'AbortError' || name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR',
  );
}

// Only this explicitly supported, currently configured model gets a latency policy.
export function missionReasoningOptions(model: string) {
  return /^gpt-5-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model)
    ? { reasoning: { effort: 'low' as const } }
    : {};
}

export async function readMissionProviderResponse(response: Response) {
  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
      throw missionTransportFailure(error);
    throw missionProviderFailure('RESPONSE_READ_ERROR', response.status);
  }
  let value: ResponseValue | null = null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      value = parsed;
  } catch {
    // HTTP status still takes precedence for HTML/empty error responses.
  }
  if (!response.ok) {
    const error = value?.error;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
    throw new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'mission provider failed', {
      httpStatus: response.status,
      ...(typeof code === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(code)
        ? { providerErrorCode: code }
        : {}),
    });
  }
  if (!value) throw missionProviderFailure(body.trim() ? 'INVALID_JSON' : 'EMPTY_RESPONSE');
  if (value.status !== undefined && value.status !== 'completed')
    throw missionProviderFailure('MALFORMED_RESPONSE');
  if (!Array.isArray(value.output)) throw missionProviderFailure('MALFORMED_RESPONSE');
  const text = value.output
    .flatMap((item) => (item && Array.isArray(item.content) ? item.content : []))
    .find((item) => item && item.type === 'output_text' && typeof item.text === 'string')?.text;
  if (!text) throw missionProviderFailure('MALFORMED_RESPONSE');
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw missionProviderFailure('MALFORMED_OUTPUT');
  }
  if (!output || typeof output !== 'object' || Array.isArray(output))
    throw missionProviderFailure('MALFORMED_OUTPUT');
  return { value, output };
}
