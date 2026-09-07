import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { assertPrivateVideoStorageConfiguration } from '../src/video/video-storage-configuration';

describe('video storage configuration', () => {
  it('fails before queueing when private video storage is incomplete', () => {
    expect(() => assertPrivateVideoStorageConfiguration({})).toThrow(
      '動画の保存先が設定されていません',
    );
    expect(() =>
      assertPrivateVideoStorageConfiguration({ url: 'https://project.supabase.co' }),
    ).toThrow('動画の保存先が設定されていません');
  });

  it('accepts a complete private video storage configuration', () => {
    expect(() =>
      assertPrivateVideoStorageConfiguration({
        url: 'https://project.supabase.co',
        serviceRoleKey: 'service-role-key',
      }),
    ).not.toThrow();
  });
});
