export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  workspaceId?: string;
  bunshinId?: string;
  missionId?: string;
  route?: string;
  status?: number | string;
  latency?: number;
  errorCode?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
}

export type LogSink = (entry: LogEntry) => void;

const sensitiveKey =
  /password|secret|token|authorization|cookie|api.?key|private.?key|database.?url|session/i;
const credentialUrl = /([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi;
const bearer = /\b(bearer|basic)\s+[\w\-._~+/]+=*/gi;

function scrubString(value: string): string {
  return value.replace(credentialUrl, '$1[REDACTED]@').replace(bearer, '$1 [REDACTED]');
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveKey.test(key) ? '[REDACTED]' : redact(item),
      ]),
    );
  }
  return value;
}

const consoleSink: LogSink = (entry) => {
  const output = JSON.stringify(entry);
  if (entry.level === 'error' || entry.level === 'warn') console.error(output);
  else console.log(output);
};

export function createLogger(
  options: { level?: LogLevel; sink?: LogSink; base?: LogContext; now?: () => Date } = {},
) {
  const order: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const threshold = options.level ?? 'info';
  const sink = options.sink ?? consoleSink;
  const now = options.now ?? (() => new Date());
  const base = options.base ?? {};
  const write = (level: LogLevel, message: string, context: LogContext = {}) => {
    if (order[level] < order[threshold]) return;
    sink(
      redact({
        timestamp: now().toISOString(),
        level,
        message: scrubString(message),
        ...base,
        ...context,
      }) as LogEntry,
    );
  };
  return {
    debug: (message: string, context?: LogContext) => write('debug', message, context),
    info: (message: string, context?: LogContext) => write('info', message, context),
    warn: (message: string, context?: LogContext) => write('warn', message, context),
    error: (message: string, context?: LogContext) => write('error', message, context),
    child: (context: LogContext) => createLogger({ ...options, base: { ...base, ...context } }),
  };
}

export function requestIdFromHeader(value: string | null): string {
  return value !== null && /^[A-Za-z0-9_-]{8,128}$/.test(value)
    ? value
    : `req_${crypto.randomUUID()}`;
}
