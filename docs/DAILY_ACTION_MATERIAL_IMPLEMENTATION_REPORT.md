# Daily Action 本人素材 実装報告

## 1. 調査した内容

- 正本仕様のOwner Knowledge、Knowledge Grant、Daily Mission生成境界を確認した。
- 既存の本人Evidenceは広告表現の事実確認用であり、写真・音声ファイルを保存できなかった。
- Daily Mission生成は明示Grant済みのOwner Knowledgeだけを読むため、Daily Actionをこの経路へ接続した。
- 既存の非公開Supabase Storage、ファイルシグネチャ確認、Workspace/User/Bunshin境界を再利用できることを確認した。

## 2. 変更したファイル

- `packages/application/src/daily-actions.ts`: Action種別、入力検証、Knowledge変換、Repository境界。
- `packages/database/prisma/schema.prisma`と`20260908100000_add_daily_actions`: 追記型履歴、冪等制約、Knowledge/Mission参照。
- `packages/database/src/index.ts`: 本人所有確認、Service境界、KnowledgeとGrantの同一Transaction保存。
- `apps/web/src/daily-action-storage.ts`: 写真・音声の非公開保存、実ファイルMIME検証、本人確認後の取得。
- `apps/web/src/http/daily-actions.ts`とAPI Route: Workspace/Service用の登録、一覧、素材取得。
- `apps/web/app/ui/daily-action-collector.tsx`: スマートフォン向けのおすすめAction、撮影・録音・文章入力、直近履歴。
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx`: 投稿案画面への接続。

## 3. 主要な設計判断

- ActionそのものをMemoryへ直接保存せず、本人所有Knowledgeへ保存して対象BunshinだけへGrantする。これにより別Bunshinへの暗黙共有を防ぐ。
- 写真と音声は公開URLを持たず、Storage keyもAPIへ返さない。素材取得APIが所有者とServiceを再検証した後だけ内容を返す。
- 退会処理ではDaily Actionの非公開素材もStorageから削除し、保存キー、ファイル名、内容を消去してから完了する。
- ファイル名やブラウザ申告MIMEを信用せず、JPEG、PNG、WebP、MP3、M4A、WAVのシグネチャをサーバーで確認する。
- Action履歴は上書きせず追記し、User単位の冪等キーで再送を一度だけ処理する。
- 画像20MB、音声10MBを上限とする。音声の30秒は初期UXの目安とし、実時間のサーバー検証は端末形式の実測後に判断する。

## 4. 実行した検証

- Application unit test: Knowledge種別への変換、写真メタデータ不備、拒否境界。
- Database unit test: Workspace、Service、User、Bunshinの完全一致と、拒否時にKnowledge/Grant/Actionを作らないこと。
- Prisma Client生成とTypeScript typecheck。
- 最終確認ではrepository全体のlint、test、buildを実行する。

## 5. 未解決事項

- 本番Migration適用後、iPhoneで写真撮影、M4A録音、素材表示を確認する必要がある。
- 30秒をサーバー側で厳密に制限する場合は、対応音声形式のduration解析を追加する。
- 写真そのものを画像生成へ自動選択する処理は含めない。現在は本人Knowledgeとして次回企画の文脈へ入り、画像は本人が明示選択する既存方針を維持する。

## 6. 次Phaseへ進める条件

- 本番Migrationと実端末の保存・再表示smokeが完了すること。
- 同じ送信の再試行でAction、Knowledge、Grantが重複しないことを本番相当環境で確認すること。
- 条件を満たした後、R4週次レポートへDaily Action件数を接続する。
