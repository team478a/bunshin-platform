import 'server-only';

import type { LineConfigurationEnvironment } from '@bunshin/application';
import { getServerEnvironment } from '@bunshin/config';
const runtimeEnvironment = {
  development: 'DEVELOPMENT',
  staging: 'STAGING',
  production: 'PRODUCTION',
} as const;

export function currentPaymentEnvironment(): LineConfigurationEnvironment {
  return runtimeEnvironment[getServerEnvironment().APP_ENV];
}
