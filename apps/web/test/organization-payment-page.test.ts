import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../app/(app)/organizations/[workspaceId]/payment/page.tsx', import.meta.url),
  'utf8',
);

describe('organization payment settings page', () => {
  it('limits access and every mutation to the selected organization', () => {
    expect(source).toContain("role: { in: ['OWNER', 'ADMIN'] }");
    expect(source).toContain("type: 'ORGANIZATION'");
    expect(source).toContain('workspaceId_environment_provider');
    expect(source).toContain('workspaceId: parsed.data.workspaceId');
  });

  it('never renders stored ciphertext and requires verification before activation', () => {
    expect(source).not.toContain('select: { encryptedSecretKey');
    expect(source).toContain("configuration.status !== 'VERIFIED'");
    expect(source).toContain("action: 'CONNECTION_TEST'");
    expect(source).toContain("action: 'ACTIVATE'");
  });

  it('tells operators that checkout and webhooks remain a separate launch step', () => {
    expect(source).toContain('購入画面と入金Webhookを実装するまでは販売を開始しません');
    expect(source).toContain('カード番号など購入者の決済情報は、この画面には入力しません');
  });
});
