# 認証試行単位のプロジェクト復帰分離

更新: 2026-09-29。コード実装と本番有効化は別。D-144を参照。

## 1. 調査した内容

共有の戻り先Cookieと従来の単一PKCE verifierは、同じブラウザで複数サービスの認証を始めると上書きされる。インストール済みSupabase auth-js 2.112.3 / SSRのソースを確認し、公開APIのOAuth `data.flowId` と `exchangeCodeForSession(code, { flowId })` が試行別のverifierを選ぶことを確認した。存在しないflowIdを従来キーへfallbackしないことも実SDKを偽HTTPで検証する。

メールはTokenHashを確認画面からPOSTする既存方式を維持する。Supabaseの[メールテンプレート](https://supabase.com/docs/guides/auth/auth-email-templates)の `.RedirectTo` と[Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)設定を、試行IDの伝達に対応させる必要がある。本番設定は未確認・未変更。

## 2. 変更したファイル

- `apps/web/src/auth/auth-return-attempt.ts`: ランダムID、browser proof、期限・origin・Provider・本人照合、claim/consume CAS、厳密な復帰判定。
- `apps/web/src/auth/supabase.ts`: PKCE Cookieの10分期限と、本人照合前のsession Cookie書込buffer。
- `apps/web/app/auth/{line,email,confirm}`、`app/consent`、`app/login`: 試行IDの引継ぎ、同意本人の検証、確認不能時の再試行案内。
- Prisma schema / `20260929070000_auth_return_attempts`: 一時記録・制約・期限index・RLS。公開policyは作らない。
- 関連unit/route/SDK契約/DB integrationテスト、`.env.example`、Decision Log、Roadmap、本報告。

## 3. 主要な設計判断

試行記録はUser/Workspaceの業務データではなく、認証前の短期情報。生のproofはHttpOnly Cookieにだけ置き、DBにはhashを保存する。URLには推測困難なIDのみを載せる。サービスへ戻る権限は付与せず、ページ側の本人・所属・役割の検証を維持する。

段階はPENDING→CLAIMED→AUTHENTICATED→CONSUMED。同じCallbackの競合で負けた処理が勝った処理のCookie/記録を破棄しない。EMAILは検証済みemailを送信先hashと照合した後にのみCookieをcommitする。法務同意は認証したUserに束ね、別Userへ変わった場合は同意を書き込む前に拒否する。戻り先・識別子・proofが欠けた場合に別の試行を借りない。

メールの `redirect_to` は同一originの `/auth/confirm` からIDだけを抽出し、任意URLへの遷移には使わない。重複・矛盾したID、未知query、別originを拒否する。共通User session自体はブラウザ単位のまま。千ノ国・SNS支援・占い・研修・OEMの個別参加条件やデータ境界を変更しない。

## 4. 実行した検証

- 最終関連6ファイル46件成功。使用済み/期限切れCookieが後の共通同意を妨げず古い復帰先も供給しない回帰テスト、2プロジェクト逆順、重複Callback、missing proof/selector、別origin/Provider、期限切れ、別User同意、メール本人不一致、試行ごとのCookie除去、session commit保留、同意済み画面の復帰を含む。
- Web全体383ファイル1,840件成功（最後の同意済み画面テスト追加前）。
- 実Supabase SDKの偽HTTP契約テスト成功。逆順の独立flow交換、消費済み/未知flowの拒否、最新verifierの借用がないことを確認。実Providerへ通信していない。
- Prisma format/generate成功。DB統合テストにCAS/本人照合/RLSの検証を追加。実DB migration・全package lint/typecheck/test/buildはPR CIで確認する。
- 本番OAuth、認証メール送信、LINE送信、本番DB・外部設定変更は行わない。

## 5. 未解決事項・制約

- 初期値は無効。マージのみでは新方式を開始しない。本番の設定・メール実物・端末遷移は未検証。
- 元ブラウザのCookieが必要。別ブラウザ/端末・10分経過後は元サービスからの再試行を案内する。クロスブラウザ継続を保証しない。
- 観測できた有効試行は最大4件。完全同時の開始の厳密なquotaではない。SDK native flow indexも複数requestの書込競合を完全には解決しない。verifierが失われた場合は別試行を使わず拒否する。
- 論理期限は10分。期限行は次の認証開始時に最大100件ずつ削除するため、物理削除が10分ちょうどに行われるわけではない。定期掃除jobは追加しない。
- 同意済みのServer Componentから直接復帰した場合、消費済みproof Cookieは次の開始/期限まで残り得る。DBの単回状態で再利用を拒否し、次の開始ではstaleとして除去する。後の共通同意は進行中の記録がなければ許可するが、使用済み/期限切れの戻り先は決して借りない。
- PR #1004の研修期限処理は別の未マージ作業であり混ぜない。

## 6. 本番有効化と次へ進む条件

1. PR CIの全検証とDB migration/RLSの成功を確認し、レビュー・マージする。
2. 権限のある運用者が、対象originごとに既存callbackに加え `/auth/line/callback?authAttempt=*` と `/auth/confirm?authAttempt=*` の限定されたRedirect URLを許可する。許可パターンの実際の一致をstagingで確認する。広い全path wildcardは不要。
3. Magic LinkとConfirm Signupの実際に使うメールテンプレートが、TokenHashの既存確認方式と `.RedirectTo` を引継ぐようにする。リンク例（APPの検証済みoriginを固定、既存文面は維持）:

   ```html
   <a
     href="https://YOUR_VERIFIED_APP_ORIGIN/auth/confirm?token_hash={{ .TokenHash }}&amp;type=email&amp;redirect_to={{ .RedirectTo }}"
     >ログインを確認する</a
   >
   ```

   `.RedirectTo` はアプリが渡す同一origin `/auth/confirm?authAttempt=UUID`。旧方式のqueryなしURLにも対応する。OEM custom domain利用では、送信側と受信側のoriginが一致するテンプレート方式を別途確認する。固定APP originに戻すだけでは別originのproofを利用できない。

4. 承認されたstagingで `AUTH_RETURN_ATTEMPTS_ENABLED=true` にし、同一browserで2サービスを逆順に完了、LINE/メール/初回同意/同意済み/認証取消/期限切れ/別browserを確認する。千ノ国で共通業種画面が出ず、SNS支援の必要なサービス業種設定は残ることも確認する。
5. 本番で同じ外部設定確認後に明示フラグを有効化する。ロールバックはfalseで新規開始を旧方式へ戻す。既に開始済みでIDを持つCallbackはフラグ停止後も厳密に検証する。migrationは残し、稼働中の試行を壊すDB rollbackはしない。

設定変更・実メール/LINE送信・本番OAuth確認はこの実装依頼で実行したものとして扱わない。
