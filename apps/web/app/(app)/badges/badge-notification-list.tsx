'use client';

import { useState } from 'react';

type Notification = {
  id: string;
  title: string;
  description: string;
  awardedAt: string;
  readAt: string | null;
};

export function BadgeNotificationList(props: {
  workspaceId: string;
  initialNotifications: Notification[];
}) {
  const [notifications, setNotifications] = useState(props.initialNotifications);
  const [error, setError] = useState('');

  async function markRead(id: string) {
    setError('');
    const response = await fetch(
      `/api/workspaces/${encodeURIComponent(props.workspaceId)}/badge-notifications/${encodeURIComponent(id)}/read`,
      { method: 'PATCH' },
    );
    if (!response.ok) {
      setError('確認済みにできませんでした。もう一度お試しください。');
      return;
    }
    setNotifications((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
  }

  const unread = notifications.filter((item) => item.readAt === null);
  if (!unread.length) return null;
  return (
    <section className="settings-card" aria-labelledby="badge-news">
      <p className="eyebrow">新しいお知らせ</p>
      <h2 id="badge-news">バッジをもらいました</h2>
      <div className="badge-list">
        {unread.map((item) => (
          <article className="badge-card is-new" key={item.id}>
            <span className="badge-mark is-earned" aria-hidden="true">
              ★
            </span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void markRead(item.id)}
              >
                確認しました
              </button>
            </div>
          </article>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
