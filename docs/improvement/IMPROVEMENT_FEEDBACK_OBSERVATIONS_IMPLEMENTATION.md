# 本人Feedbackの限定読取・Improvement観測

## 結論と基準

2026-10-03 Asia/Tokyo、PR #1086をマージした最新main `4bfabd70a52b05220d24a3af2305e1fccd35cab7`から、`codex/improvement-feedback-observations`で実装する。既存の本人「困った」原本を既存Engineの収集契約へ渡す内部Adapterと回帰テストを一つのゴールとする。報告を確定BUG・改善Candidate・解決済みへ変換しない。

新しいDB表、migration、書込経路、Provider、HTTP API、管理画面、定期Jobは追加しない。SOCIAL限定の初回Adapterであり、ハッシーのブランド名で分岐しない。研修・占いの報告収集へは接続していない。本番の設定・データ・配信・デプロイは変更しない。

## 経路と正本

`PrismaImprovementFeedbackObservationAdapter.summarize` → `CollectImprovementObservations` → `readObservations` → DB管理権限照合 → `ImprovementFeedback`最小select → `projectImprovementFeedbackObservation` → 既存sanitize/収集検証・受付ID重複排除 → `summarizeImprovementFeedback`。

- `packages/application/src/improvement-feedback-observations.ts`: 純粋なprojection、Adapter定義、件数集計。Prisma/Provider非依存。
- `packages/database/src/improvement-feedback-observation-adapter.ts`: 固定された認可済みscopeを受け取り、原本を読み取る。tenant/environmentをクライアント入力から信頼する公開口は作らない。
- 原本の受付ID・受付日時・actor/User・Bunshinを明示参照。submissionKey、自由文、プロフィール、Memory、写真、ログは取得しない。追加フィールドはprojectionで落とす。
- 選択コードはreportedCategory/reportedSurface/reportedImpactのみ。共通診断categoryはUNKNOWN、subtypeはSELF_REPORTED_TROUBLE、statusはREPORTED。選択された「操作」をBUGと断定しない。

## 分離と認可

固定scopeのtenant/Workspace/Service/Package/Adapter/environmentを照合する。初回はSOCIAL/TROUBLE_FEEDBACKのみ。DBの同じWorkspace/ServiceにACTIVEのSERVICE_OWNERまたはSERVICE_ADMIN所属が必要。User/Group/WorkspaceもACTIVE、ServiceConfiguration存在を確認する。Content Editor、一般参加者、暗黙の全体運営権限では読めない。

RepeatableRead transactionで権限確認と読取を行う。原本のstampと現在のBunshinのWorkspace・Group・ownerを照合する。移管等による不一致は一括読取を失敗させ、別Serviceへ付け替えない。移管履歴を使った読取設計は未実装。権限は各読取時点のDB snapshotで確認し、読取中の取消しをリアルタイムに取り消せる保証はない。

報告者の現在の所属/Capability失効を理由に過去の報告を消さない。ただし読取管理者の権限失効は拒否する。既存の本人入力Repositoryの条件は変更しない。Bunshin実削除時の既存CASCADEは維持する。

## 集計の意味と限界

期間は半開区間、既存契約の最大90日・1,000件。日時とIDで安定順序、limit+1の存在でPARTIAL/truncatedを表す。ページングは未実装で、切り詰めた件数を全体件数と表示しない。読み取れた保存原本のCOMPLETEは、全利用者の困りごとを捕捉した意味ではない。

報告件数、重複受付ID数、報告者人数、Bunshin数、選択コード別の件数/人数を分ける。利用者母集団、発生率、解決率は取得していない。denominatorはnull、populationCoverageはUNKNOWN、発生率/解決率は常にnull。0報告でも0%とはしない。見積/確定原価/未確定件数もnullであり、0円を推測しない。

受付IDによる重複排除は同一原本の再読取に限定する。別キー・別報告の意味的重複は統合しない。個人参照を含む内部観測は匿名化済みデータではない。将来の管理UI/外部共有には小集団抑制・用途/保持期限の別レビューが必要。

## 検証

Windows PowerShell / Node 24.21.0 / pnpm 10.10.0。外部Provider・本番資格情報は使用しない。

- Application: 新規projection/集計12件＋既存Engine23件＋既存本人Feedback10件、合計45件成功。
- Database: 新規読取mock22件。実where/select・固定scope・管理権限拒否・subject・上限・汚染原本/所有不一致・エラー伝播・非同期待機中の入力変更分離を検証。fetch禁止ガードを終了時に復元する。
- 実DB: 既存`database.integration.test.ts`の本人Feedback試験を拡張。管理者と書込本人の権限の違い、期間/subject、Content Editor拒否、報告者失効後の過去原本保持、上限、移管時拒否、管理者失効を隔離PostgreSQL16の通常PR CIで確認する。実行結果は最新headのCIを正本とする。
- 再実行: `pnpm --filter @bunshin/application exec vitest run test/improvement-engine.test.ts test/improvement-feedback.test.ts test/improvement-feedback-observations.test.ts`、`pnpm --filter @bunshin/database exec vitest run test/improvement-feedback.test.ts test/improvement-feedback-observation-adapter.test.ts`。既存読取Adapter回帰、architecture、型/lint/整形/buildも確認する。実DBは既存CIの隔離DB手順に限定する。
- 作業中の失敗: 新規mockのquery.selectがanyと推論され対象ESLintが1件拒否。Prismaの実query型をテストへ指定し修正。本番契約/assertion/CIは弱めていない。
- ローカル型/lint/関連回帰と全体CIの結果・head/run URLはPR/最終報告に記録する。過去headの成功を流用しない。

## 未確認・切り戻し・次のゴール

本番DBロール/RLS、実データの不一致件数、Service移管の履歴方針、保持期限/個別削除/匿名化、実Session・スマートフォン・OEM実環境・管理画面は未確認または未実装。新しい公開実行口がないため、内部Adapterの存在だけで本番自動収集済みとは扱わない。

切り戻しはAdapterの内部利用/公開exportを外す。原本の書込・保存履歴に変更がなく、破壊的DB rollbackは不要。

次の最小ゴールは、この限定観測から読み取り専用の要確認Evidence候補を組み立てる規則と回帰テスト。利用者自己申告と機械エラーの根拠を別に保持し、BUG確定・永続Candidate・自動修正・管理UIを先行追加しない。
