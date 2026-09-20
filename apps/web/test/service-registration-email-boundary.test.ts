import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('OEM registration email boundary', () => {
  it('separates dedicated credentials, verification, and asynchronous delivery', () => {
    expect(source('src/email/service-registration-email.ts')).toContain('ServiceEmailSecretCrypto');
    expect(source('src/http/service-registration-email.ts')).toContain(
      "providerMode: z.enum(['PLATFORM', 'DEDICATED_RESEND'])",
    );
    expect(source('src/services/service-registration-email-worker.ts')).toContain("status: 'SENT'");
    expect(source('src/services/service-registration-email-worker.ts')).toContain(
      "status: 'FAILED'",
    );
    expect(source('src/http/service-registration-email.ts')).toContain(
      'lastVerifiedAt: new Date()',
    );
  });
});
