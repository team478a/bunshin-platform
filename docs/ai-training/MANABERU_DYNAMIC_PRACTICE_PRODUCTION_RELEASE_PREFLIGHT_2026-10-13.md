# マナベル自由課題・実践フロー Production Release Preflight

更新日: 2026-10-13 (Asia/Tokyo)

## 対象と状態

- Production基点: `4c7928a66586ca77f22b77916a8c3cabf5c8e5f1`
- Main採用候補: `1af37078c5867ecd510708a966b96c006509e0c3`（PR #1270 merge SHA）
- 対象機能PR: #1261–#1270。自由希望、受講開始、AI利用枠、候補・実践、途中支援、結果確認、次課題、画像1枚添付を一つの利用フローとして扱う。
- 対象外: Feedback Overview、OEM料金・請求変更、他のmain差分。本リリース候補は `production` を基点に対象PRだけを取り込み、main全体をproductionへ移さない。
- 状態: **Release PRのレビュー候補。Production Migration / Deploy / 利用開始は未実施、未承認。**

## 差分とMigration

Productionとの差分は、119ファイル、約11.8k追加行を含む機能一式である。ファイル数ではなく、自由希望から実践・支援・提出レビュー・継続へ到達する依存機能をまとめている。

新規Migrationは5件:

1. `20261013000000_personal_learning_requests`: Enrollment / Membershipに所有関係を結んだ希望・候補記録。
2. `20261013010000_personal_learning_operation_cost`: AI操作種別を費用Admissionへ記録。
3. `20261013020000_personal_learning_lesson_candidate`: 本人確認前の候補と確定時刻。
4. `20261013030000_personal_learning_answer_revisions`: 複数の提出revisionを許し、既存Answer一意indexを非一意indexへ置換。
5. `20261013040000_personal_learning_practice_support_images`: Enrollment / Membership / Assignment / immutable相談Eventへscopeされた非公開JPEG bytes。

5件すべてに `BEGIN`、`lock_timeout=5000ms`、`statement_timeout=60000ms`、`idle_in_transaction_session_timeout=60000ms`、`COMMIT`を設定した。Production migration runnerのbounded migration一覧へも登録し、Vercel build前にSQL内容を検査する。

Productionに存在する既存Migration 10件はmainと内容が異なるが、checksumを変更しない。候補では既存production版を維持し、上記5件だけを追加する。これはGit上の差分であり、実DBの適用履歴・pending一覧を証明しない。

## 確認済み / 未確認

- PR #1270: 2026-10-13にmainへmerge済み。PRのverifyとdatabase CIは成功。
- merge後main CI: verifyとdatabaseの全steps成功（run `38342960122`）。
- Production branch head: `4c7928a6...`。GitHub Production deployment metadataも同SHAを示す。これは現在の公開aliasやDB状態を単独では証明しない。
- 実DB接続、`_prisma_migrations`、実際のDB role/RLS、最新backupと隔離restore、pending SQLの実行時間・lock影響: **UNKNOWN / 未実施**。
- 実AI生成、画像Provider費用、本番Enrollment、利用者の実端末操作、学習効果: **未確認**。

## Deploy前Gate（すべて未確認はPASS扱いにしない）

1. Ownerが承認した非公開環境で、対象Production project / role / SHAを照合し、秘密を表示せずMigration connection probeとread-onlyのmigration履歴確認を実施する。
2. 最新成功backup、隔離restore rehearsal、削除の再適用計画、復旧責任者を確認する。
3. 5件のSQLについて既存行数・FK対象・index lock、`training_mission_answers`一意制約変更の既存Runtime互換性を実データを出さず評価する。
4. schema / RLS / 実行DB roleの権限を確認する。CI superuser成功を本番roleの認可確認とみなさない。
5. `main`の対象機能PRとproduction固有修正の差分を再確認し、対象限定release PRのCIを確認する。
6. 上記証跡の後、Migration実行・production deployの明示承認を別途得る。Deploy成功後にlive/ready、schema readiness、既存千ノ国メディアの非破壊smokeを確認する。

本PRのmergeはproduction deployの実行承認ではない。Vercel Production buildは全pending Migrationを公開前に適用し、後続build失敗でもDB変更は自動rollbackしないため、未確認の状態でbuildを起動しない。

## 失敗時の扱い

Migration失敗または結果不明、readiness不一致、既存service regression、scope不一致があれば利用開始せず停止する。自動再試行、手動SQL、`migrate resolve`、既存Migrationの書換え、過去データ削除で復旧しない。DB状態を確認し、レビュー済みforward-fixまたは承認済み復旧手順を使う。
