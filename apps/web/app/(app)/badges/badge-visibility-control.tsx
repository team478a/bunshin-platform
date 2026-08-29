'use client';

import { useState } from 'react';

export function BadgeVisibilityControl(props: {
  workspaceId: string;
  awardId: string;
  initialVisibility: 'PRIVATE' | 'GROUP';
  initialGroupId: string | null;
  groups: Array<{ id: string; name: string }>;
}) {
  const [visibility, setVisibility] = useState(props.initialVisibility);
  const [groupId, setGroupId] = useState(props.initialGroupId ?? props.groups[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (next: 'PRIVATE' | 'GROUP') => {
    setSaving(true);
    setMessage('');
    const response = await fetch(
      `/api/workspaces/${props.workspaceId}/badges/${props.awardId}/visibility`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visibility: next,
          sharedGroupId: next === 'GROUP' ? groupId : null,
        }),
      },
    );
    setSaving(false);
    if (!response.ok) {
      setMessage('変更できませんでした。もう一度お試しください。');
      return;
    }
    setVisibility(next);
    setMessage(next === 'GROUP' ? 'グループに見せる設定にしました。' : '自分だけに戻しました。');
  };

  return (
    <div className="badge-sharing">
      <p>{visibility === 'GROUP' ? 'グループに見せています' : '自分だけに見えます'}</p>
      {props.groups.length ? (
        <>
          <label>
            見せるグループ
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {props.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <div className="badge-sharing__actions">
            <button type="button" disabled={saving} onClick={() => void save('GROUP')}>
              {saving
                ? '変更しています…'
                : visibility === 'GROUP'
                  ? '共有先を変更する'
                  : 'グループに見せる'}
            </button>
            {visibility === 'GROUP' && (
              <button type="button" disabled={saving} onClick={() => void save('PRIVATE')}>
                自分だけに戻す
              </button>
            )}
          </div>
        </>
      ) : (
        <small>参加中のグループがないため、共有はできません。</small>
      )}
      {message && <small role="status">{message}</small>}
    </div>
  );
}
