import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('service administration HTTP module boundaries', () => {
  it('keeps the compatibility module as exports only', () => {
    const barrel = read('src/http/services.ts');

    expect(barrel).toContain("export { createServiceResponse } from './service-create';");
    expect(barrel).toContain("from './service-commercial-settings';");
    expect(barrel).toContain("from './service-custom-domain';");
    expect(barrel).toContain("from './service-lifecycle';");
    expect(barrel).not.toContain('async function');
  });

  it('keeps creation, lifecycle, commercial settings, and custom domains separate', () => {
    const create = read('src/http/service-create.ts');
    const lifecycle = read('src/http/service-lifecycle.ts');
    const commercial = read('src/http/service-commercial-settings.ts');
    const domain = read('src/http/service-custom-domain.ts');

    expect(create).toContain('export async function createServiceResponse');
    expect(create).not.toContain('updateServiceLifecycleResponse');
    expect(lifecycle).toContain('export async function updateServiceLifecycleResponse');
    expect(lifecycle).not.toContain('updateServiceCommercialSettingsResponse');
    expect(commercial).toContain('export async function updateServiceCommercialSettingsResponse');
    expect(commercial).not.toContain('updateServiceCustomDomainResponse');
    expect(domain).toContain('export async function updateServiceCustomDomainResponse');
    expect(domain).toContain('export async function synchronizeServiceCustomDomainResponse');
  });
});
