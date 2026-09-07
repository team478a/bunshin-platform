import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';

interface Overrides {
  url?: string;
  serviceRoleKey?: string;
}

export function assertPrivateVideoStorageConfiguration(overrides?: Overrides) {
  const environment = overrides ? null : getServerEnvironment();
  const url = overrides
    ? overrides.url
    : (process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? environment?.SUPABASE_AUTH_ADMIN_URL);
  const serviceRoleKey = overrides
    ? overrides.serviceRoleKey
    : environment?.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new ApplicationError('CONFIGURATION_ERROR', '動画の保存先が設定されていません');
}
