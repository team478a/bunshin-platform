import { describe, expect, it, vi } from 'vitest';
import { DailyActionStorage } from '../src/daily-action-storage';

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function fixture() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const storage = {
    storage: {
      getBucket: vi.fn().mockResolvedValue({ data: { id: 'daily-action-materials' } }),
      createBucket: vi.fn(),
      from: vi.fn().mockReturnValue({ upload, remove }),
    },
  };
  return { value: new DailyActionStorage(storage as never), storage, upload, remove };
}

describe('DailyActionStorage', () => {
  it('実ファイルを確認しWorkspace・User・Bunshin・冪等キーの非公開パスへ保存する', async () => {
    const { value, storage, upload } = fixture();
    const result = await value.upload({
      workspaceId: 'workspace',
      actorUserId: 'owner',
      bunshinId: 'bunshin',
      idempotencyKey: 'request',
      kind: 'PHOTO',
      file: new File([png], '今日の写真.png', { type: 'image/png' }),
    });
    expect(result).toMatchObject({
      storageKey: 'workspace/owner/bunshin/request.png',
      mimeType: 'image/png',
      originalFilename: '今日の写真.png',
    });
    expect(storage.storage.from).toHaveBeenCalledWith('daily-action-materials');
    expect(upload).toHaveBeenCalledWith(
      result.storageKey,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
  });

  it('拡張子やブラウザ申告だけが画像の音声ファイルを拒否する', async () => {
    const { value, upload } = fixture();
    await expect(
      value.upload({
        workspaceId: 'workspace',
        actorUserId: 'owner',
        bunshinId: 'bunshin',
        idempotencyKey: 'request',
        kind: 'VOICE_MEMO',
        file: new File([png], 'memo.m4a', { type: 'audio/mp4' }),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(upload).not.toHaveBeenCalled();
  });
});
