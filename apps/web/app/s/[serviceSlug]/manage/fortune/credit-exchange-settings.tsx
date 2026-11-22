import { FORTUNE_FOLLOW_UP_CREDIT_NAME, prisma } from '@bunshin/database';
import type { Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { currentUserProvider } from '../../../../../src/auth/current-user';
import { fortuneOperatorScope } from '../../../../../src/fortune/operator-scope';

const selection = {
  followUpCreditEnabled: true,
  followUpCreditCost: true,
  followUpCreditLimit: true,
  creditDisplayName: true,
} as const;

const exchangeSettings = z.object({
  followUpCreditEnabled: z.boolean(),
  followUpCreditCost: z.coerce.number().int().min(1).max(100_000),
  followUpCreditLimit: z.coerce.number().int().min(1).max(5),
  creditDisplayName: z.string().trim().min(1).max(40),
});

export async function FortuneCreditExchangeSettings({
  serviceSlug,
  actorUserId,
  result,
}: {
  serviceSlug: string;
  actorUserId: string;
  result?: string;
}) {
  const service = await fortuneOperatorScope(serviceSlug, actorUserId);
  const current = await prisma.fortuneServiceSetting.findFirst({
    where: { workspaceId: service.workspaceId, groupId: service.serviceId },
    select: selection,
  });
  if (!current) return null;

  async function save(form: FormData) {
    'use server';
    const actor = await (await currentUserProvider()).getCurrentUser();
    if (!actor) redirect('/login');
    const service = await fortuneOperatorScope(serviceSlug, actor.userId);
    const scope = { workspaceId: service.workspaceId, groupId: service.serviceId };
    const path = `/s/${serviceSlug}/manage/fortune`;
    const parsed = exchangeSettings.safeParse({
      followUpCreditEnabled: form.get('enabled') === 'on',
      followUpCreditCost: form.get('cost'),
      followUpCreditLimit: form.get('limit'),
      creditDisplayName: form.get('name'),
    });
    if (!parsed.success)
      redirect(`${path}?creditExchange=invalid#fortune-credit-exchange` as Route);
    const data = parsed.data;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM fortune_service_settings
        WHERE workspace_id=${scope.workspaceId}::uuid AND group_id=${scope.groupId}::uuid FOR UPDATE`;
      const prior = await tx.fortuneServiceSetting.findFirstOrThrow({
        where: scope,
        select: { id: true, configurationId: true, ...selection },
      });
      const { id, configurationId, ...beforeData } = prior;
      await tx.fortuneServiceSetting.update({ where: { id }, data });
      await tx.serviceConfigurationAudit.create({
        data: {
          ...scope,
          configurationId,
          action: 'FORTUNE_CREDIT_EXCHANGE_UPDATED',
          beforeData,
          afterData: data,
          reason: '占いの追加質問の交換設定を更新',
          performedByUserId: actor.userId,
        },
      });
    });
    redirect(`${path}?creditExchange=saved#fortune-credit-exchange` as Route);
  }

  return (
    <section className="settings-card" id="fortune-credit-exchange">
      <h2>追加質問のクレジット交換</h2>
      <p>購入分の追加質問を使い切った場合や、無料鑑定で追加質問をする場合に利用できます。</p>
      {result === 'saved' && <p role="status">交換設定を保存しました。</p>}
      {result === 'invalid' && <p role="alert">名称、交換に必要な数、上限を確認してください。</p>}
      <form action={save} className="app-form">
        <label className="form-field">
          利用者に表示する名称
          <input
            name="name"
            maxLength={40}
            defaultValue={current.creditDisplayName ?? FORTUNE_FOLLOW_UP_CREDIT_NAME}
            required
          />
        </label>
        <label className="form-field">
          追加質問1回に必要なクレジット数
          <input
            name="cost"
            type="number"
            min={1}
            max={100000}
            defaultValue={current.followUpCreditCost}
            required
          />
        </label>
        <label className="form-field">
          1鑑定あたりの交換上限
          <input
            name="limit"
            type="number"
            min={1}
            max={5}
            defaultValue={current.followUpCreditLimit}
            required
          />
        </label>
        <label>
          <input name="enabled" type="checkbox" defaultChecked={current.followUpCreditEnabled} />{' '}
          クレジット交換を受け付ける
        </label>
        <button className="button button--primary" type="submit">
          交換設定を保存する
        </button>
      </form>
    </section>
  );
}
