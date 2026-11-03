import type { OAuthConsentView } from '../../../src/services/oauth-consent';

const labels: Record<string, string> = {
  openid: '本人を識別する情報',
  email: 'メールアドレス',
  profile: 'プロフィール情報',
};
export function OAuthConsentCard({
  view,
  action = '/api/oauth/decision',
}: {
  view: OAuthConsentView;
  action?: string;
}) {
  return (
    <section className="auth-panel" aria-labelledby="oauth-title">
      <h1 id="oauth-title">{view.clientName}との接続</h1>
      <p>{view.account}で接続します。</p>
      <p>このアプリに共有する情報を確認してください。</p>
      <ul>
        {view.scopes.length ? (
          view.scopes.map((scope) => <li key={scope}>{labels[scope] ?? scope}</li>)
        ) : (
          <li>本人を識別する情報</li>
        )}
      </ul>
      <p>
        利用実績を読める範囲は、ワタシワークスで設定した接続許可に従います。SNSへの投稿や設定変更を許可するものではありません。
      </p>
      <p>接続先：{view.callbackOrigin}</p>
      <form action={action} method="post">
        <input type="hidden" name="authorization_id" value={view.authorizationId} />
        <div className="form-actions">
          <button className="button button--primary" name="decision" value="approve" type="submit">
            許可する
          </button>
          <button className="button button--secondary" name="decision" value="deny" type="submit">
            許可しない
          </button>
        </div>
      </form>
    </section>
  );
}
