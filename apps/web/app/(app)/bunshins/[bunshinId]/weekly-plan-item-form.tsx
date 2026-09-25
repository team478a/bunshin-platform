'use client';

import { SOCIAL_PREFERRED_FORMATS, type SocialPreferredFormat } from '@bunshin/capability-social';
import { useState, type FormEvent } from 'react';
import type { ContentPillarView } from './content-pillar-section';
import { addDays, formatLabels, type WeeklyPlanItemFormValue } from './weekly-plan-types';

export function WeeklyPlanItemForm({
  initial,
  pillars,
  weekStartDate,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: WeeklyPlanItemFormValue;
  pillars: ContentPillarView[];
  weekStartDate: string;
  pending: boolean;
  onSubmit: (value: WeeklyPlanItemFormValue) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  return (
    <form
      className="weekly-plan-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <label>
        予定日
        <input
          required
          type="date"
          min={weekStartDate}
          max={addDays(weekStartDate, 6)}
          value={form.scheduledDate}
          onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
        />
      </label>
      <label>
        投稿テーマ
        <select
          required
          value={form.contentPillarId}
          onChange={(event) => setForm({ ...form, contentPillarId: event.target.value })}
        >
          <option value="">選択してください</option>
          {pillars
            .filter((pillar) => pillar.active)
            .map((pillar) => (
              <option key={pillar.id} value={pillar.id}>
                {pillar.title}
              </option>
            ))}
        </select>
      </label>
      <label>
        目的
        <input
          required
          maxLength={200}
          value={form.goal}
          onChange={(event) => setForm({ ...form, goal: event.target.value })}
        />
      </label>
      <label>
        切り口
        <textarea
          required
          maxLength={500}
          value={form.angle}
          onChange={(event) => setForm({ ...form, angle: event.target.value })}
        />
      </label>
      <label>
        推奨形式
        <select
          value={form.recommendedFormat}
          onChange={(event) =>
            setForm({ ...form, recommendedFormat: event.target.value as SocialPreferredFormat })
          }
        >
          {SOCIAL_PREFERRED_FORMATS.map((format) => (
            <option key={format} value={format}>
              {formatLabels[format]}
            </option>
          ))}
        </select>
      </label>
      <label>
        メモ（任意）
        <textarea
          maxLength={1000}
          value={form.notes ?? ''}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>
      <div className="weekly-plan-actions">
        <button disabled={pending} type="submit">
          保存
        </button>
        <button disabled={pending} type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}
