# Feedback人手確認: 実HTTP・認証・DB E2Eの実行条件

## 結論と調査基準

2026-10-03 Asia/Tokyo。PR #1099のmergeを確認した。基準mainは `0d618433d230e8fc5142852013b9fbe12b3fa4cd`、同PRのheadは `0d8cbf695b8da1a9ad3a78233c21cf0bf0fd6524`。作業branchは `codex/improvement-feedback-e2e-readiness`。

既存の使い捨てPostgreSQLでRepository/applicationの実DB統合試験を実行可能。ただし、現在のCIとテスト用React画面には実Supabase Auth、実Next HTTP、ブラウザを一体で実行する環境がない。**完全なE2Eは未実施であり、本番NO-GOは解除しない。** 偽のcookieやSessionUserVerifierのmockを本物の認証として扱わない。

今回は既存テストの実行と条件整理のみ。アプリ、テスト、schema、migration、依存、lockfile、CI/CD、設定を変更しない。新クラウド環境、実ユーザー、外部Provider、Storage、LINEを使用しない。

## 実行経路と証明範囲

| 層           | 実コード・根拠                                                                                                                                             | 現在確認できること                                                                              | 残る条件                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| UI           | `apps/web/app/s/[serviceSlug]/manage/improvement-feedback/feedback-review-control.tsx`、既存browser報告                                                    | 実React/fake応答の9ケース、終端表示、同一body再送                                               | 実認証/HTTP/DBと同一実行での接続は未確認                                 |
| HTTP         | `apps/web/app/api/services/[serviceSlug]/improvement-feedback/review/route.ts`、`apps/web/src/http/improvement-feedback-review.ts::feedbackReviewResponse` | Origin、4096 byte上限、strict command、private/no-store、既存単体試験                           | Nextサーバーで実cookieを受け取る通し確認                                 |
| 認証         | `apps/web/src/auth/current-user.ts::currentUserProvider`、`apps/web/src/auth/supabase.ts::createSupabaseServerClient`                                      | Next cookies→Supabase `auth.getUser()`→本人DB照合の経路が存在                                   | 合成ユーザー用の実Auth環境がない。SESSION_SECRETだけではログインできない |
| 本人照合     | `packages/auth/src/index.ts::SessionCurrentUserProvider`                                                                                                   | 既存AuthIdentityを照合、未知identityはprovisionする                                             | fixtureの事前identity紐付けが必要。意図しないprovisionを成功扱いしない   |
| scope/handle | `apps/web/src/services/public-service.ts::resolveManagedServiceContext`、`apps/web/src/services/improvement-feedback-review.ts::executeFeedbackReview`     | 現在管理権限、actor/workspace/service/environment、期限、Evidence、固定operation/revisionを検査 | 実セッションを使った別Service/別actor HTTP拒否                           |
| 保存         | `PrismaImprovementFeedbackTriageRepository`、`ReviewImprovementFeedbackCandidate`、`packages/database/test/improvement-triage.integration-cases.ts`        | 実PostgreSQLのCAS/監査一体保存、再読込、削除/失効/認可の既存試験                                | HTTP応答喪失とブラウザ再送を同じDB状態につなぐ                           |
| CI           | `.github/workflows/ci.yml`                                                                                                                                 | verifyとPostgreSQL16のdatabase Job                                                              | Auth service、Next HTTP起動、ブラウザE2Eはない                           |

既存のbrowser報告は `IMPROVEMENT_FEEDBACK_BROWSER_VERIFICATION.md`。以前の9件成功と今回のDB試験を足し合わせて「9件の実E2E成功」とは記載しない。CI databaseの `VERCEL_ENV=production` はCIサービスDBに対するmigration経路の検証であり、本番deployの証拠ではない。

## 今回の隔離DBと実行

Windows / Node24（専用PATH）/ pnpm10.10 / Docker server29.8.0。既存cached `postgres:16` image `sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20` を `--pull never` で使用。合成パスワード、専用DB名 `bunshin_platform_test`、loopback `127.0.0.1:18998` だけにpublishし、host bind mount/共有volumeなし、`--rm` の一時containerを使用した。他の作業DBには接続しない。

最初の `--internal` networkではDockerがhost向けportを公開せず、接続確認で停止。その空のcontainer/networkを除去し、専用通常bridgeとloopback publishで再作成した。通常bridgeは外向き通信の完全なOS隔離ではない。Feedback統合fixtureのglobal fetch拒否はProvider通信のガードであって、任意socket全体の禁止を保証しない。今回Auth/HTTP/Providerは起動せず、DBはローカル接続のみ。

既存integration suiteは `beforeAll` で多数のtableを `deleteMany` する。現在のガードはURL文字列の `/localhost|127\.0\.0\.1|test/i` と `APP_ENV !== production` のみで、正しい隔離DBを保証しない。今回は事前にtask label、container、loopback publish、明示URLを照合してから実行した。`test` を含む既存/外部DBへ流用してはいけない。このガードの強化は別のテスト専用PR候補とし、その場で変更しない。

実行コマンド（repo root、DATABASE_URL/DIRECT_URLは今回作成した一時DBだけへ明示。既存資格情報をコピーしない）:

```text
pnpm --filter @bunshin/database db:migrate:deploy
pnpm --filter @bunshin/database db:assert-ready
pnpm --filter @bunshin/database test:integration
```

今回の結果（過去のCI成功とは別）:

- 一時DBへの226 migration適用: 成功。
- `db:assert-ready`: 成功。
- `test:integration`: 1ファイル86件すべて成功。開始20:04:41 JST、Vitest実行36.55秒。Feedback triageとretention Jobを含む既存DB統合全体であり、ブラウザ/認証E2Eではない。
- 続けて同じDBへ `pnpm --filter @bunshin/database exec vitest run test/database.integration.test.ts -t 'improvement triage isolated PostgreSQL contracts'` を実行すると、`beforeAll` の `groupMembership.deleteMany()` が `program_enrollments_membership_fkey` で失敗。1 suite失敗、86件は前処理で未実行（runner表示skipped）。新しいskip指定やassertion変更は行っていない。前回のfixtureが残るDBを再利用できるという保証はない。
- このため再実行は同じcontainer内の新しい空DB `bunshin_feedback_targeted_test` を作成し、226 migrationを適用。同じ対象指定コマンドで19件成功、67件は `-t` の対象外（開始20:06:30 JST、16.57秒）。除外67件は直前の全体86件の成功に含まれ、今回の19件とは重複して数えない。

19件はfresh-instanceでの保存後再送、同時CAS、原本削除/変更/所有変更、scope/権限取消、lock順序、audit書込fault rollback、退会消去、期限/purge再開、少数/不完全Evidence拒否、非owner DB role/RLS、直接書込CHECKを含む。15件のretention/maintenanceケースは全体86件で実行済み。この検証はローカル実DBでの既存回帰であり、本番障害や本番migration適用の証明ではない。

終了後、task labelと完全IDを照合して一時containerをstopし、`--rm` により両方の合成DBと匿名volumeを除去。専用networkも削除し、task label付きcontainer/networkが残らないことを確認した。共有資源のpruneや他containerの停止は行わない。format/diff checkと最新head CIの結果はPRに記録する。

再現手順は**毎回新しい使い捨てDBを作成**して上記3コマンドを実行すること。既存cleanupの順序/FK問題は別のテスト専用改善候補であり、今回は修正しない。テストを通すために失敗を削除・期待失敗・skipへ変更しない。

## 次のE2Eに必要な最小構成

既存composition root/Job/Repositoryを維持し、新Worker/queueや本番認証の迂回を追加しない。第一候補は**ローカルの使い捨て実Supabase Auth＋独立PostgreSQL＋実Next＋ブラウザ**。Authのruntime/image/起動方法とネットワーク制限を先にレビューする。Supabase CLIは今回の環境では見つからず、インストールやstack起動は行っていない。

- localhost Authは現行 `authConfiguration` により `APP_ENV=development` だけで許可される。staging設定でHTTP localhostを通すために本番validationを緩めない。
- DB/Auth/アプリのURLを厳密なloopback allowlistで固定し、外部Provider・Storage・mail・LINE・SNSの到達を拒否する。fixtureのfetch guardだけでNext/SDKを含む全processを安全と判定しない。起動時envを許可listで作り、`.env*` にある既存資格情報の自動読込を防止する。
- Auth用admin資格情報はfixture processだけに保持し、Nextには限定public keyと合成SESSION_SECRETだけを渡す。cookie/handle/メール/生Feedbackをログ・スクリーンショット・PRへ残さない。
- 合成管理者A/B、非管理者、Workspace A/B、Service A/B、最低5人の報告者、完了済みJST週の固定Feedbackを作る。AuthIdentityを事前に紐付け、正常操作で意図しないUser/Workspaceの自動provisionが起きないことをDBで確認する。
- Fixture作成/削除はテスト専用helper、packageの公開export、既存migrationだけを使用する。seed、本番Repository、schemaは変更しない。作業領域/DB/ブラウザprofileをrun単位で分離する。
- 本番Feedback、他Service、個人Memory、顧客素材の持込なし。Providerを不要とする完了済み週の人手確認だけを対象にする。

代替の実HTTP＋実DB＋fake SessionUserVerifierは部分統合として有用だが、実認証E2Eとは別名・別証跡にする。現在の優先タスクはこの代替のために本番authへテスト用bypassを足すことではない。

## 受入ケースと判定

| ケース                                | 実E2Eの合格条件                                                                         | 既存の証拠・不足                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 正常確認/対象外2理由                  | 実ログイン→GET無保存→PREPARE→確認→POST、候補1変更/監査1、終端記録済み                   | UI、HTTP単体、DBは別々。通し未確認                         |
| 保存後応答喪失                        | test proxyがcommit後の応答だけを落とす。同じbody/operation再送で監査1、再読込の終端一致 | fresh-instance DB再送とUI fakeは既存試験。実HTTP喪失未確認 |
| 二重操作/同時CAS                      | 明示barrierで2画面を制御、成功1/他方停止、監査重複なし                                  | PostgreSQL競合試験あり。画面間通し未確認                   |
| 別actor/Service/Workspace/environment | 正規セッション＋別scopeのhandleは拒否、他scope保存0                                     | DB認可/handle単体あり。実cookie通し未確認                  |
| 権限取消/原本変更                     | PREPARE後に隔離DBのmembership/Evidenceを変更。確定/再送は停止、古い根拠で保存しない     | DB lock/revoke/失効試験あり。HTTP接続未確認                |
| 実session失効                         | Auth側の失効・有効期限とgetUser結果を観測。管理操作は認証拒否/停止                      | fake401だけでは合格にしない。実Auth未確認                  |
| privacy/cleanup                       | private/no-store、非管理者表示なし、handleをURL/logに残さない、テスト後run限定cleanup   | HTTP単体/設計あり。実Next headers/log確認未実施            |
| mobile                                | Chrome390×844で通し操作、後に実端末Safariの別証跡                                       | 実React/fake9件のみ。実スマートフォン未確認                |

失敗・環境不足は報告し、skipやmock化で「実認証合格」に変更しない。新しい生成、通知、承認、自動修正、他Package横展開は対象外。

## 次の最小タスクと本番境界

次は**隔離DBの破壊的テスト前preflightを厳密化するテスト専用PR**。URL substringではなく明示したloopback host/port/DBとrun markerを照合し、DATABASE_URL/DIRECT_URLの不一致、外部host、production、既存DBを拒否する。否定テストと一時DBでの回帰を含め、DB破壊操作に先立って停止できることを受入条件にする。本番ソース/CI/schemaは変えない。

その後、実Auth runtimeの追加取得・合成アカウント作成・限定loopback Auth通信・Next起動を含む最小構成について承認を確認してからE2Eを実行する。新クラウドprojectは既定案にしない。ローカルAuthの運用条件が確定するまで「E2E準備完了」「本番公開可」とはしない。

Feedback maintenanceの停止/drain/preflight/backup復元後再削除は別の未完gate。PR mergeはdeployではない。今回本番変更、課金、実生成、実送信、merge/deployを行わない。切り戻しは追加文書だけを除くことで可能で、アプリ/本番データの変更はない。
