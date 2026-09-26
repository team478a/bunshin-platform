import type { AdminUserDetail } from '@bunshin/application';
import {
  createSupportCase,
  setMetricExclusion,
  setUserStatus,
  updateSupportCase,
} from './admin-user-detail-actions';
import { dateTime } from '../view-model';
import type { AdminUserDetailPageData } from './admin-user-detail-data';

export function MetricExclusionSection({ detail }: { detail: AdminUserDetail }) {
  const user = detail.user;
  return (
    <section className="settings-card">
      <h2>運用集計への反映</h2>
      <p>
        現在は<strong>{user.excludedFromMetrics ? '集計対象外' : '集計対象'}</strong>
        です。社内確認や動作確認だけに使う利用者は、実利用者の数字へ混ざらないよう対象外にします。
      </p>
      <form action={setMetricExclusion} className="form-stack">
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="excluded" value={user.excludedFromMetrics ? 'false' : 'true'} />
        <label className="field">
          <span className="field__label">変更理由（必須）</span>
          <textarea
            className="field__control"
            name="reason"
            required
            minLength={5}
            maxLength={1000}
          />
        </label>
        <button className="button button--secondary" type="submit">
          {user.excludedFromMetrics ? '運用集計へ戻す' : 'テスト利用者として集計から外す'}
        </button>
      </form>
      <h3>集計対象の変更履歴</h3>
      {detail.metricExclusionAudits.length ? (
        <ul>
          {detail.metricExclusionAudits.map((audit) => (
            <li key={audit.id}>
              <strong>{audit.action === 'EXCLUDED' ? '集計から除外' : '集計へ復帰'}</strong>：
              {audit.reason}
              <br />
              <small>
                {audit.environment} ／ {audit.actorDisplayName} ／ {dateTime(audit.occurredAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>変更履歴はありません。</p>
      )}
    </section>
  );
}

export function UserStatusSection({ detail }: { detail: AdminUserDetail }) {
  const user = detail.user;
  return (
    <section className="settings-card">
      <h2>利用を停止・再開</h2>
      <p>
        停止するとログインできなくなり、LINE通知も停止します。再開後の通知は本人が設定し直します。
      </p>
      <form action={setUserStatus} className="form-stack">
        <input type="hidden" name="userId" value={user.id} />
        <input
          type="hidden"
          name="status"
          value={user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}
        />
        <label className="field">
          <span className="field__label">変更理由（必須）</span>
          <textarea
            className="field__control"
            name="reason"
            required
            minLength={5}
            maxLength={1000}
          />
        </label>
        <button
          className="button button--secondary"
          type="submit"
          disabled={user.status === 'DELETED'}
        >
          {user.status === 'ACTIVE' ? 'このユーザーの利用を停止' : 'このユーザーの利用を再開'}
        </button>
      </form>
      <h3>変更履歴</h3>
      {detail.operationAudits.length ? (
        <ul>
          {detail.operationAudits.map((audit) => (
            <li key={audit.id}>
              <strong>{audit.action === 'SUSPENDED' ? '利用停止' : '利用再開'}</strong>：
              {audit.reason}
              <br />
              <small>
                {audit.actorDisplayName} ／ {dateTime(audit.occurredAt)}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p>変更履歴はありません。</p>
      )}
    </section>
  );
}

export function SupportCasesSection({ detail, administrators }: AdminUserDetailPageData) {
  const user = detail.user;
  return (
    <section className="settings-card">
      <h2>問い合わせ対応</h2>
      <p>パスワード、APIキー、投稿本文などの秘密情報・個人情報は記入しないでください。</p>
      <form action={createSupportCase} className="form-stack">
        <input type="hidden" name="userId" value={user.id} />
        <label className="field">
          <span className="field__label">件名</span>
          <input className="field__control" name="subject" required minLength={3} maxLength={200} />
        </label>
        <label className="field">
          <span className="field__label">優先度</span>
          <select className="field__control" name="priority" defaultValue="NORMAL">
            <option value="LOW">低</option>
            <option value="NORMAL">通常</option>
            <option value="HIGH">高</option>
            <option value="URGENT">緊急</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">最初の対応メモ</span>
          <textarea
            className="field__control"
            name="note"
            required
            minLength={5}
            maxLength={2000}
          />
        </label>
        <button className="button" type="submit">
          問い合わせ記録を作成
        </button>
      </form>
      {detail.supportCases.map((supportCase) => (
        <article className="settings-card" key={supportCase.id}>
          <h3>{supportCase.subject}</h3>
          <p>
            状態：
            {supportCase.status === 'OPEN'
              ? '未対応'
              : supportCase.status === 'IN_PROGRESS'
                ? '対応中'
                : '解決済み'}{' '}
            ／ 担当：{supportCase.assigneeDisplayName ?? '未割当'}
          </p>
          <ol>
            {supportCase.notes.map((note) => (
              <li key={note.id}>
                {note.content}
                <br />
                <small>
                  {note.authorDisplayName} ／ {dateTime(note.createdAt)}
                </small>
              </li>
            ))}
          </ol>
          <form action={updateSupportCase} className="form-stack">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="supportCaseId" value={supportCase.id} />
            <label className="field">
              <span className="field__label">状態</span>
              <select className="field__control" name="status" defaultValue={supportCase.status}>
                <option value="OPEN">未対応</option>
                <option value="IN_PROGRESS">対応中</option>
                <option value="RESOLVED">解決済み</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">優先度</span>
              <select
                className="field__control"
                name="priority"
                defaultValue={supportCase.priority}
              >
                <option value="LOW">低</option>
                <option value="NORMAL">通常</option>
                <option value="HIGH">高</option>
                <option value="URGENT">緊急</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">担当者</span>
              <select
                className="field__control"
                name="assigneeUserId"
                defaultValue={supportCase.assigneeUserId ?? ''}
              >
                <option value="">未割当</option>
                {administrators.map((admin) => (
                  <option key={admin.userId} value={admin.userId}>
                    {admin.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">対応メモ（必須）</span>
              <textarea
                className="field__control"
                name="note"
                required
                minLength={5}
                maxLength={2000}
              />
            </label>
            <button className="button button--secondary" type="submit">
              対応を更新
            </button>
          </form>
        </article>
      ))}
    </section>
  );
}
