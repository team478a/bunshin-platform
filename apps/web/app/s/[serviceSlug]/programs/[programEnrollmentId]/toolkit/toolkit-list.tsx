'use client';

import { useState } from 'react';

export type ToolkitItem = {
  id: string;
  title: string;
  content: string;
  missionDefinitionKey: string;
  createdAt: string;
};

export function ToolkitList({ items }: { items: ToolkitItem[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyItem(item: ToolkitItem) {
    await navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
  }

  if (!items.length) {
    return (
      <section className="service-entry__card training-card training-card--center">
        <h2>保存した成果物はまだありません</h2>
        <p>研修で合格した回答のうち、仕事でまた使いたいものだけを保存できます。</p>
      </section>
    );
  }

  return (
    <div className="training-toolkit-list">
      {items.map((item) => (
        <article className="service-entry__card training-toolkit-item" key={item.id}>
          <p className="eyebrow">保存した成果物</p>
          <h2>{item.title}</h2>
          <p className="training-toolkit-item__date">
            {new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(
              new Date(item.createdAt),
            )}
          </p>
          <pre>{item.content}</pre>
          <button
            className="button button--primary button--full"
            type="button"
            onClick={() => {
              void copyItem(item);
            }}
          >
            {copiedId === item.id ? 'コピーしました' : '内容をコピーする'}
          </button>
        </article>
      ))}
    </div>
  );
}
