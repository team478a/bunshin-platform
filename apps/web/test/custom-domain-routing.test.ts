import { describe, expect, it } from 'vitest';
import {
  customDomainDestination,
  normalizeRequestHostname,
} from '../src/services/custom-domain-routing';

describe('custom domain routing', () => {
  it('normalizes forwarded hosts and removes a port', () => {
    expect(normalizeRequestHostname('Service.Example.com:443, proxy.local')).toBe(
      'service.example.com',
    );
  });

  it('maps the custom-domain root and paths into the service route', () => {
    expect(customDomainDestination('/', 'sennokuni-media')).toBe('/s/sennokuni-media');
    expect(customDomainDestination('/home', 'sennokuni-media')).toBe('/s/sennokuni-media/home');
  });

  it('does not rewrite its own service route and replaces another service prefix', () => {
    expect(customDomainDestination('/s/sennokuni-media/home', 'sennokuni-media')).toBeNull();
    expect(customDomainDestination('/s/other/home', 'sennokuni-media')).toBe(
      '/s/sennokuni-media/home',
    );
  });
});
