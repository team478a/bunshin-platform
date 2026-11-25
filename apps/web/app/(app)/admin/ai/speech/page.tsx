import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import {
  browserMaterialAzureVoices,
  browserMaterialNarrationPreviewText,
  browserPilotEnvironment,
} from '@bunshin/capability-browser';
import { getServerEnvironment } from '@bunshin/config';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { AesGcmAiProviderSecretCrypto } from '../../../../../src/ai/secure-provider-configuration';
import {
  azureSpeechKey,
  azureSpeechRegion,
  synthesizeAzureSpeech,
  verifyAzureSpeechConnection,
} from '../../../../../src/ai/azure-speech';

export const dynamic = 'force-dynamic';
const path = '/admin/ai/speech';
const formSchema = z.object({
  workspaceId: z.uuid(),
  region: azureSpeechRegion,
  key: azureSpeechKey,
});

async function speechAdmin() {
  const user = await (await currentUserProvider()).getCurrentUser();
  if (!user) redirect('/login');
  const environment = browserPilotEnvironment(getServerEnvironment().APP_ENV);
  if (!environment) notFound();
  const db = await import('@bunshin/database');
  if (
    (await new db.PrismaPlatformAdminRepository().findActivePlatformAdminByUserId(user.userId))
      ?.role !== 'SUPER_ADMIN'
  )
    notFound();
  return { prisma: db.prisma, environment };
}

async function save(form: FormData) {
  'use server';
  const { prisma, environment } = await speechAdmin();
  const data = formSchema.safeParse({
    workspaceId: form.get('workspaceId'),
    region: form.get('region'),
    key: form.get('key'),
  });
  if (!data.success) redirect(`${path}?result=invalid`);
  const { workspaceId, region, key } = data.data;
  if (
    !(await prisma.workspace.findFirst({
      where: { id: workspaceId, status: 'ACTIVE' },
      select: { id: true },
    }))
  )
    redirect(`${path}?result=invalid`);
  try {
    await verifyAzureSpeechConnection({ region, key });
  } catch {
    redirect(`${path}?result=connection`);
  }
  const { encryptedValue: encryptedKey, mask: keyMask } =
    new AesGcmAiProviderSecretCrypto().encrypt(key);
  const credentials = { workspaceId, region, encryptedKey, keyMask, enabled: true };
  await prisma.browserMaterialSpeechConfiguration.upsert({
    where: { environment },
    create: { environment, ...credentials },
    update: credentials,
  });
  redirect(`${path}?result=saved`);
}

async function pause() {
  'use server';
  const { prisma, environment } = await speechAdmin();
  await prisma.browserMaterialSpeechConfiguration.updateMany({
    where: { environment, enabled: true },
    data: { enabled: false },
  });
  redirect(`${path}?result=paused`);
}

async function createPreviews() {
  'use server';
  const { prisma, environment } = await speechAdmin();
  const config = await prisma.browserMaterialSpeechConfiguration.findFirst({
    where: { environment, enabled: true },
  });
  if (!config) redirect(`${path}?result=invalid`);
  if (config.shioriPreview && config.daichiPreview) redirect(`${path}?result=preview`);
  const connection = {
    region: config.region,
    key: new AesGcmAiProviderSecretCrypto().decrypt(config.encryptedKey),
  };
  const signal = AbortSignal.timeout(25_000);
  try {
    const shioriPreview = await synthesizeAzureSpeech(
      connection,
      browserMaterialAzureVoices.shiori.model,
      browserMaterialNarrationPreviewText,
      signal,
    );
    const daichiPreview = await synthesizeAzureSpeech(
      connection,
      browserMaterialAzureVoices.daichi.model,
      browserMaterialNarrationPreviewText,
      signal,
    );
    const result = await prisma.browserMaterialSpeechConfiguration.updateMany({
      where: { environment, enabled: true, updatedAt: config.updatedAt },
      data: { shioriPreview, daichiPreview },
    });
    if (!result.count) throw new Error('speech settings changed');
  } catch {
    redirect(`${path}?result=connection`);
  }
  redirect(`${path}?result=preview`);
}

const results: Record<string, string> = {
  invalid: '入力内容と設定を確認してください。',
  connection: 'Azure Speechに接続できませんでした。リージョン、キー、クォータを確認してください。',
  saved: '接続を確認し、設定を保存しました。',
  paused: 'Azure Speechでの新規生成を停止しました。',
  preview: '試聴音声を保存しました。',
};

export default async function AzureSpeechAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { prisma, environment } = await speechAdmin();
  const query = await searchParams;
  const [config, workspaces, previews] = await Promise.all([
    prisma.browserMaterialSpeechConfiguration.findUnique({
      where: { environment },
      select: {
        region: true,
        keyMask: true,
        workspaceId: true,
        enabled: true,
      },
    }),
    prisma.workspace.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }),
    prisma.browserMaterialSpeechConfiguration.count({
      where: {
        environment,
        enabled: true,
        shioriPreview: { not: null },
        daichiPreview: { not: null },
      },
    }),
  ]);
  const message =
    query.result && Object.hasOwn(results, query.result) ? results[query.result] : undefined;
  return (
    <main className="app-page">
      <Link href="/admin/ai">AIと検索サービスの設定へ戻る</Link>
      <header className="app-page__heading">
        <h1>Azure Speechの設定</h1>
        <p>
          {environment} · {config?.enabled ? '使用中' : '停止中'}
        </p>
      </header>
      {message && <p role="status">{message}</p>}
      <section className="settings-card">
        <h2>接続設定</h2>
        <p>
          テスト用のAzure Speech無料プラン（F0）を指定してください。確認時に音声生成は発生しません。
        </p>
        <form action={save}>
          <label>
            対象ワークスペース
            <select name="workspaceId" required defaultValue={config?.workspaceId ?? ''}>
              <option value="" disabled>
                選択してください
              </option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Azureリージョン
            <input
              name="region"
              required
              maxLength={40}
              defaultValue={config?.region ?? ''}
              placeholder="japaneast"
              autoComplete="off"
            />
          </label>
          <label>
            接続キー {config ? `（登録済み ${config.keyMask}）` : ''}
            <input
              name="key"
              type="password"
              required
              minLength={8}
              maxLength={256}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="button button--primary">
            接続を確認して保存
          </button>
        </form>
        {config?.enabled && (
          <form action={pause}>
            <button type="submit" className="button button--secondary">
              新規音声生成を停止
            </button>
          </form>
        )}
      </section>
      {config?.enabled && (
        <section className="settings-card">
          <h2>試聴音声</h2>
          {previews ? (
            <p>志織・大智の試聴音声は教材画面で再生できます。</p>
          ) : (
            <form action={createPreviews}>
              <p>同じ固定文を志織と大智で1回ずつ合成し、教材画面で使い回します。</p>
              <button type="submit" className="button button--secondary">
                試聴音声を作る
              </button>
            </form>
          )}
          {previews > 0 &&
            Object.entries(browserMaterialAzureVoices).map(([voice, { label }]) => (
              <div key={voice}>
                <p>{label}</p>
                <audio
                  controls
                  preload="none"
                  aria-label={label}
                  src={`/api/browser-materials/narration-preview?voice=${voice}`}
                />
              </div>
            ))}
        </section>
      )}
    </main>
  );
}
