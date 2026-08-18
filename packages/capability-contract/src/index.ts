export type CapabilityType =
  'SOCIAL' | 'BLOG' | 'LINE_MARKETING' | 'LP' | 'LEAD_GENERATION' | 'SALES' | 'CUSTOMER_SUPPORT';

export interface CapabilityDefinition {
  type: CapabilityType;
  version: string;
}

export interface CapabilityExecutor<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}
