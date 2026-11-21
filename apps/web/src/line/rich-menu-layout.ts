import { isFortuneServicePackage } from '../services/service-creation-templates';
import { isOracleLineService } from './fortune-rich-menu-content';

export function fortuneLineMenuKind(
  serviceSlug: string | null | undefined,
  onboardingConfig: unknown,
) {
  if (!isFortuneServicePackage(onboardingConfig)) return undefined;
  return isOracleLineService(serviceSlug) ? 'ORACLE' : 'FORTUNE';
}
