# アカウントからのLINE接続導線改善

更新日: 2026-09-28

## 1. 調査

千ノ国メディア参加者の画像と実装を照合し、サービス別アカウント画面にはLINE接続入口がなく、投稿パートナー詳細の折り畳み設定内にしか入口がないことを確認した。

## 2. 変更ファイル

- `apps/web/app/(app)/account/page.tsx`
- `apps/web/app/s/[serviceSlug]/line/page.tsx`
- `apps/web/src/services/service-line-settings.ts`
- `apps/web/test/account-service-scope.test.tsx`
- `apps/web/test/service-line-settings.test.ts`
- `apps/web/test/service-line-settings-page.test.tsx`
- `docs/SERVICE_LINE_ACCOUNT_ENTRY_REPORT.md`
- `docs/SERVICE_ADMIN_GUIDE.md`

## 3. 設計判断

サービス別アカウントに「LINEの接続・お知らせ設定」を常時表示する。接続案内画面は本人のACTIVE所属、Workspace、Service、現在環境の設定だけを参照し、Provider識別子や秘密値を取得しない。

専用LINEの接続済み・未完了・サービス利用不可を表示し、既存の本人確認・明示同意フォームへ案内する。複数の投稿パートナーは本人が選ぶ。未作成の場合は作成導線を示す。共通LINEと停止中サービスも説明を表示し、専用LINE用の無効なリンクを出さない。接続完了を投稿案の自動配信設定完了とは扱わず、受け取り設定への入口も提示する。

## 4. 検証

本人・Service・Workspace・Configuration・環境のクエリ境界、所属なしの拒否、接続・同意不足、サービス停止、未作成、複数投稿パートナー、ログイン後の戻り先を含む関連テスト13件が成功した。変更ファイルのlint、本番build（型検査を含む）、`git diff --check`も成功した。

## 5. 未解決事項

本番反映後のiPhone操作と本人のLINE受信は未確認。登録完了LINEの未受信者については個別の接続状態・送信結果を確認する必要がある。

## 6. 次へ進める条件

CI成功と本番反映後、アカウント → LINEの接続・お知らせ設定 → LINEへ接続する、の導線を実端末で確認する。
