'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { SocialCapabilityStatus } from './capability-section';
import type { ContentPillarView } from './content-pillar-section';
import { WeeklyPlanItemForm } from './weekly-plan-item-form';
import {
  addDays,
  formatLabels,
  planStatusLabels,
  type WeeklyPlanItemFormValue,
  type WeeklyPlanMutation,
  type WeeklyPlanView,
} from './weekly-plan-types';

export function WeeklyPlanCard({
  plan,
  capabilityStatus,
  managedGenerationOnly,
  pending,
  pillars,
  endpoint,
  editingItem,
  setEditingItem,
  addingTo,
  setAddingTo,
  mutation,
}: {
  plan: WeeklyPlanView;
  capabilityStatus: SocialCapabilityStatus;
  managedGenerationOnly: boolean;
  pending: boolean;
  pillars: ContentPillarView[];
  endpoint: string;
  editingItem: string | null;
  setEditingItem: Dispatch<SetStateAction<string | null>>;
  addingTo: string | null;
  setAddingTo: Dispatch<SetStateAction<string | null>>;
  mutation: WeeklyPlanMutation;
}) {
  const activePillars = pillars.filter((pillar) => pillar.active);
  const actionable = capabilityStatus === 'ACTIVE' && plan.status === 'DRAFT';
  const editable = actionable && !managedGenerationOnly;
  const emptyItem: WeeklyPlanItemFormValue = {
    scheduledDate: plan.weekStartDate,
    contentPillarId: activePillars[0]?.id ?? '',
    goal: '',
    angle: '',
    recommendedFormat: 'SLIDE',
    notes: null,
  };

  return (
    <article className="weekly-plan-card">
      <h3>
        {plan.weekStartDate}〜{addDays(plan.weekStartDate, 6)}{' '}
        <small>{planStatusLabels[plan.status]}</small>
      </h3>
      <p>地域の時間：{plan.timezone}</p>
      {editable ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const strategy = data.get('strategySummary');
            void mutation(`${endpoint}/${plan.id}`, 'PATCH', {
              strategySummary: typeof strategy === 'string' ? strategy : '',
            });
          }}
        >
          <label>
            戦略
            <textarea
              name="strategySummary"
              maxLength={1000}
              defaultValue={plan.strategySummary ?? ''}
            />
          </label>
          <button disabled={pending} type="submit">
            戦略を保存
          </button>
        </form>
      ) : (
        <p>戦略: {plan.strategySummary || '未設定'}</p>
      )}
      {plan.status !== 'DRAFT' ? <p>決めた後や終了した予定は編集できません。</p> : null}
      <ul className="weekly-plan-items">
        {plan.items.map((item) => (
          <li key={item.id}>
            {editingItem === item.id ? (
              <WeeklyPlanItemForm
                initial={item}
                pillars={pillars}
                weekStartDate={plan.weekStartDate}
                pending={pending}
                onCancel={() => setEditingItem(null)}
                onSubmit={(value) =>
                  mutation(`${endpoint}/${plan.id}/items/${item.id}`, 'PATCH', value)
                }
              />
            ) : (
              <>
                <strong>{item.scheduledDate}</strong>{' '}
                {pillars.find((pillar) => pillar.id === item.contentPillarId)?.title ??
                  '使えない投稿テーマ'}
                <p>
                  {item.goal} — {item.angle}（{formatLabels[item.recommendedFormat]}）
                </p>
                {item.classification && item.classification !== 'ORGANIC' ? (
                  <p>
                    {item.classification === 'ADVERTISEMENT'
                      ? '商品を紹介する企画（PR）'
                      : '商品に関係する企画'}
                  </p>
                ) : null}
                {item.notes ? <p>{item.notes}</p> : null}
                {editable ? (
                  <div className="weekly-plan-actions">
                    <button
                      disabled={pending}
                      type="button"
                      onClick={() => setEditingItem(item.id)}
                    >
                      編集
                    </button>
                    <button
                      disabled={pending}
                      type="button"
                      onClick={() => {
                        if (window.confirm('この予定を削除しますか？'))
                          void mutation(`${endpoint}/${plan.id}/items/${item.id}`, 'DELETE');
                      }}
                    >
                      削除
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {addingTo === plan.id ? (
        <WeeklyPlanItemForm
          initial={emptyItem}
          pillars={pillars}
          weekStartDate={plan.weekStartDate}
          pending={pending}
          onCancel={() => setAddingTo(null)}
          onSubmit={(value) => mutation(`${endpoint}/${plan.id}/items`, 'POST', value)}
        />
      ) : null}
      {actionable ? (
        <div className="weekly-plan-actions">
          {!managedGenerationOnly ? (
            <button
              disabled={pending || activePillars.length === 0}
              type="button"
              onClick={() => setAddingTo(plan.id)}
            >
              予定を追加
            </button>
          ) : null}
          <button
            disabled={pending}
            type="button"
            onClick={() => {
              if (window.confirm('確定後は編集できません。確定しますか？'))
                void mutation(`${endpoint}/${plan.id}/confirm`, 'POST', {});
            }}
          >
            この予定に決める
          </button>
          <button
            disabled={pending}
            type="button"
            onClick={() => {
              if (window.confirm('この1週間の予定を終了しますか？'))
                void mutation(`${endpoint}/${plan.id}/expire`, 'POST', {});
            }}
          >
            この予定を終了する
          </button>
        </div>
      ) : null}
    </article>
  );
}
