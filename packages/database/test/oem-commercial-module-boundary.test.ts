import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (name: string) =>
  readFileSync(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');

describe('OEM database module boundaries', () => {
  it('keeps LINE configuration and connection persistence separate', () => {
    const barrel = readSource('oem-line-configuration');
    expect(barrel).not.toContain('export class ');
    expect(barrel).toContain("from './group-line-configuration-repository'");
    expect(barrel).toContain("from './group-line-connection-repository'");
    expect(readSource('group-line-configuration-repository')).toContain(
      'export class PrismaGroupLineConfigurationRepository',
    );
    expect(readSource('group-line-connection-repository')).toContain(
      'export class PrismaGroupLineConnectionRepository',
    );
  });

  it('keeps billing persistence separate from billing value preparation', () => {
    const barrel = readSource('commercial-billing');
    expect(barrel).not.toContain('export class ');
    expect(barrel).toContain("from './commercial-billing-service'");
    expect(barrel).toContain("from './commercial-billing-support'");
    expect(readSource('commercial-billing-service')).toContain(
      'export class PrismaCommercialBillingService',
    );
    expect(readSource('commercial-billing-support')).toContain(
      'export function invoiceDocumentSnapshot',
    );
  });
});
