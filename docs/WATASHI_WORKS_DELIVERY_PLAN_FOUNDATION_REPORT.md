# ワタシワークス配信プラン基盤 実装報告

## 1. 調査した内容

Serviceの毎日配信設定、Social Profileの支援レベル、Program OfferingとEnrollment、Daily Mission生成、AI障害時の予備案、画像・動画生成、LINE通知を確認した。

毎日配信設定の「発信アイデア／そのまま使える投稿案」はJSONへ保存されていたが、Daily Missionの`assistanceLevel`には接続されていなかった。またProgram Enrollmentには参加者ごとの`IDEA_ONLY / GUIDED / READY_TO_USE`が保存されるものの、毎日の自動生成では参照していなかった。

## 2. 変更したファイル

- `packages/database/src/index.ts`
- `apps/web/src/services/service-onboarding-settings.ts`
- `apps/web/src/services/service-generation-knowledge.ts`
- `apps/web/src/services/daily-mission-generation.ts`
- `apps/web/src/services/service-daily-idea-fallback.ts`
- `apps/web/src/jobs/daily-mission-job-handler.ts`
- Service管理設定と初回設定画面
- 対応するWebテスト

## 3. 主要な設計判断

配信内容を次の既存支援レベルへ対応させた。

| Service設定  | Mission支援レベル | 利用者に表示する内容               |
| ------------ | ----------------- | ---------------------------------- |
| IDEA         | IDEA_ONLY         | テーマ、伝え方、選定理由           |
| PROMPT       | GUIDED            | 作り方、台本、画像・動画AI向け指示 |
| READY_TO_USE | READY_TO_USE      | 完成原稿とコピー可能な内容         |

適用順は、参加者が選択したProgram Preference、Program Enrollment、Service初期値の順とする。すべてWorkspace、Service Group、Membership、Userの範囲で取得する。複数のACTIVE Enrollmentがある場合は開始日時と作成日時が新しいものを使用する。

## 4. 実行した検証

- CIで失敗した`packages/database/src/index.ts`をPrettierで整形
- 変更対象ファイルのPrettier検査
- Web TypeScript型検査
- WebとDatabaseのlint
- 配信設定、初回設定、Service生成、予備案、自動配信、AI上限の関連テスト
- DatabaseのSchedulerページング、Service分離、参加制約テスト

## 5. 未解決事項

- 画像本体は利用者がMission画面から明示的に生成する。毎日の自動画像生成とLINE画像送信は未接続。
- 動画本体は動画企画、Render、運営者割当、完成通知の別経路で動く。毎日の自動動画生成とは未接続。
- Service Commercial Settingの画像・動画月間値は保存項目であり、Service単位の実行上限には未接続。
- 複数の販売プラン、契約変更、課金、日割り、解約は実装していない。

## 6. 次Phaseへ進める条件

文章系3プランの実受信を先に確認する。Service初期値と参加者Program設定を変え、同じ企業プロフィールから`IDEA_ONLY / GUIDED / READY_TO_USE`が意図どおり表示されること、AI障害時も同じレベルになることを確認した後、画像本体の自動生成・審査・配信へ進む。
