export const LINE_CONFIGURATION_ENVIRONMENTS = ['DEVELOPMENT', 'STAGING', 'PRODUCTION'] as const;
export type LineConfigurationEnvironment = (typeof LINE_CONFIGURATION_ENVIRONMENTS)[number];
