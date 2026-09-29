# 専用LINE再連携の試行分離・非公開サービス対応

更新日: 2026-09-29。基準: `main` `56d91602`。D-147。

## 1. 調査した内容

5用途の認証・参加・LINE導線の再監査で、専用LINEの接続確認Cookieが全サービス共通であることを確認した。Aの接続開始後にBを開始するとCookieが上書きされ、AのCallbackが不一致を理由に共通Cookieを削除するためBも失敗する。同じサービスでの再試行・古い取消Callbackでも起きる。誤ったサービスへ保存する問題ではなく、試行同士が接続を妨げる問題だった。

また、お知らせ設定は本人のMember Serviceを解決するが、接続ページ・開始・Callbackが共有する`serviceLineLinkScope`は公開サービスだけを解決していた。非公開・利用期間内・参加済みのサービスで接続ボタンから404となる不整合を確認した。

## 2. 変更したファイル

- `apps/web/src/line/service-line-oauth.ts`: 試行stateのhashを含むCookie名、厳密な名前検証、ブラウザ上限。
- `apps/web/src/http/service-line-link.ts`: 新規Cookieの試行別発行、本人Member Service解決、一致した試行だけのCookie削除、旧Cookie互換。
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/line/page.tsx`: 上限時の再試行案内。
- `apps/web/test/service-line-{link,oauth}.test.ts`: 複数サービス/同一サービスの並行試行、古いCallback、取消、旧Cookie、上限、非公開サービスと非所属・匿名拒否。
- Decision Log、Roadmap、本報告、旧フロー分離報告の後続参照。

## 3. 主要な設計判断

サービス単位だけでは同じサービスの再試行が干渉するため、接続試行ごとにCookieを分ける。ランダムstateのSHA-256から固定形式の名前を作り、HttpOnly/SameSite=Lax/HTTPSでSecure・限定Path・10分期限を維持する。新規開始時に他試行を削除しない。最大4個に達したら既存試行を保持したまま開始を拒否し、完了または失効を案内する。並行した開始リクエストの厳密な総数の排他は保証しないが、Cookieの上書き・強制退避は行わない。

Callbackはブラウザproof一致後だけ自試行のCookieを除去する。state不正・proof不一致で他Cookieを消さない。旧共通Cookieは一致したstateのみ、試行別Cookieがない場合に互換利用する。旧Cookieは削除せず既存10分期限に任せ、更新中の旧試行を消さない。新規処理で旧Cookieを発行せず、互換利用でもDBの期限・単回CAS・本人・Configuration照合は必須である。

非公開サービスの既存参加者も本人Member Serviceで解決する。公開参加の条件は変更しない。利用期間、Workspace/Group、ACTIVE Membership、参加同意、Bunshin本人所有、Configuration/Environment/専用LINEの検証は維持する。同じScopeを使う既存動画通知の再試行にもこの境界を適用する。業種選択、初回質問、共通認証の有効化、他サービスの設定/同意/通知先には変更を加えない。

## 4. 実行した検証

- 重点13ファイル179件成功。専用LINEの並行完了/取消/古いCallback/旧Cookie、本人Member Service、共通認証復帰、業種登録分離、占い/研修/OEM境界を含む。
- Web全体388ファイル1927件成功。
- Web typecheck、変更TypeScriptのESLint、変更対象のPrettier、`git diff --check`成功。
- 実コードのアーキテクチャ境界検査、境界検査の否定テスト10件成功。
- 全packageのformat/typecheck/lint/test/build、DB検証とIntegrationはPR CIで確認する。外部ProviderはMockであり、実LINEの認証・送信は行わない。

## 5. 未解決事項

- マージは本番反映の証拠ではない。本番SHA、iPhone/LINE内ブラウザのCookie保持、別ブラウザへの復帰は未検証。別ブラウザ・期限切れでは接続を開始し直す必要がある。
- 本修正は専用LINEの接続試行に限定する。共通ログインの試行分離の有効化条件、公式LINE/LIFFリンク、運用設定確認は別作業。
- 同じサービス・同じ会員への複数の有効な接続変更の順序を予約しない。最後の成功操作が接続を更新する既存仕様を維持する。別Serviceへの保存は引き続き拒否する。
- DB schema/migration追加、本番設定変更、本番データ更新、実Provider呼出、LINE送信、Cron登録は行わない。

## 6. 次へ進める条件

CI・レビュー・マージ・本番SHAの確認後、既存参加者の公開/非公開サービスでLINE再連携を確認する。複数サービスを同じ端末で開始し、Aを取消/完了してもBが完了できること、同じサービスで再試行しても新しい試行が消えないこと、他人のBunshinや非所属サービスは拒否されることを確認する。
