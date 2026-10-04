# 本人Feedbackの要確認Evidence — 非永続V1

## 結論・基準・範囲

2026-10-03 Asia/Tokyo、PR #1087のmerge後の最新main `ccab2691115cbc790b8710663aa71f065ee724b7`から`codex/improvement-feedback-review-evidence`で進める。既存の本人報告を選択コード別にまとめ、原本参照・件数・人数・読取完全性・規則版・決定的Revisionを持つ、読み取り専用の要確認Evidenceを追加する。

これは順序5の最初の限定実装である。永続Issue/Candidate、承認、改善指示案、管理UI/HTTP/Jobは追加しない。外部Provider障害除外、機械エラーとの相関、品質/支援Adapter横断、修正前後の効果比較は未実装。技術原因や再現率を自己申告から推測しない。

## 接続と再利用

`PrismaImprovementFeedbackObservationAdapter.reviewEvidence` → `BuildImprovementFeedbackReviewEvidence.execute` → 既存`CollectImprovementObservations` → 同AdapterのDB認可/限定select → code別Evidence。

- Applicationの独立モジュール`improvement-feedback-review-evidence.ts`に規則を置く。Provider/Prisma/ブランドへの依存なし。package公開入口を使用する。
- 同Workspace/Service/SOCIALのACTIVE SERVICE_OWNER/ADMIN再認可、Bunshin所有・現在Service照合、期間/subject制限、原本限定selectはPR #1087のAdapterを再利用する。既存の書込契約を緩めない。
- 認可後にscope・期間・上限・subject・source重複/矛盾・metadataを既存Collectで検証する。Callerの非同期途中の入力変更からscope/subject/期間を分離する。
- 既知Adapter key/package/versionと固定allowlistに限定。source種別、UNKNOWN/自己申告、明示受付ID参照、User/Bunshin存在、コード3項目を検証する。機械イベントをこの規則へ混ぜない。別Adapterの規則を自動追加しない。

## V1規則と解釈

種類・場面・困り具合の一致する報告をbucketにする。V1 `SELECTED_FEEDBACK_REVIEW` / `selected-feedback-review-v1`の確認対象基準は、同bucketに3報告以上・2人以上、かつ保存原本の読取COMPLETE。閾値は仮の人手確認ルーティングであり、統計的有意性や小集団匿名化の保証ではない。運用モニター前にレビューする固定値で、顧客UIから調整する機能はない。

満たすとREVIEW_REQUIRED（人の確認が必要）、それ以外はHELD。保留理由はREAD_INCOMPLETE / SMALL_REPORT_SAMPLE / SMALL_REPORTER_SAMPLE。1件のBLOCKEDも破棄せず、参照と件数を保留bucketに残す。種類が違う報告を合算して閾値を満たさない。

distinctReportersはUser単位。1人が複数Bunshinから報告しても1人。別受付IDの意味的重複は統合しない。source重複は既存Collectで排除し、内容矛盾は失敗させる。

分類は常にUNKNOWN、evidenceKindはSELF_REPORTED_TROUBLE、technicalValidationはNOT_PERFORMED、externalProviderCauseはUNKNOWN。REVIEW_REQUIREDはBUG/DETECTED/TRIAGED/APPROVEDへの遷移ではない。障害の緊急度・優先順位スコア・Confidence・自動修正を生成しない。外部障害を除外できたことにもならない。

## 再現性と根拠変更

clusterRefはscope、Adapter版、規則版/閾値、半開期間、subject選択、コード3項目のSHA-256。直接User/Bunshin IDをクラスタ文字列へ埋め込まない。subject限定読取はその選択のdigestを区別し、Service全体の結果に混ぜない。actor（読取管理者）はクラスタ同一性に含めない。

各bucketのevidenceRevisionはclusterRef＋完全性＋安定順序の原本種別/ID/版/時刻/User/Bunshinから作る。全体Revisionはbucket Revisionをコード順に束ねる。追加・削除・所有対応/時刻・完全性・scope/期間/選択/版の変更でRevisionが変わる。同じ受付IDの重複配信数や入力順だけでは変わらない。将来の承認はEvidence Revisionに結びつける必要があり、本PRに承認処理はない。

Node24の標準Web CryptoでSHA-256を使い、依存関係や型設定は追加しない。digest失敗は成功扱い/別の弱いhashへfallbackしない。source ID一覧を含む内部Evidenceは非公開の認可済み用途に限定し、hashがあることを匿名化や改ざん防止署名の保証としない。

## 欠損・Privacy・副作用

最大90日/1,000件、最初のbounded batchのみ。PARTIAL/UNKNOWNは全bucketを保留する。COMPLETEで0件はNO_STORED_REPORTS、不完全で0件はINSUFFICIENT_DATA。どちらも利用者が困っていない証拠ではない。

母集団/発生率/解決率/費用は未測定のnull/UNKNOWNを維持する。DB失敗は伝播し、0報告へ置換しない。原本参照と受付時刻・選択コードを返すが、直接User/Bunshin参照、原文、写真、Memory、submissionKey、追加metadataはEvidence出力に複製しない。参照や少数件数から再識別はあり得る。公開表示・本部集約・Codex共有は別途privacyレビューが必要。

DB schema/migration、原本書込、既存生成/通知/利用枠、依存/lockfile/CI、本番設定・データは変更しない。実Provider課金・実生成・LINE送信・merge/deployは行わない。

## 検証と再実行

Windows PowerShell / Node 24.21.0 / pnpm 10.10.0。

- 新規Application規則38件。閾値、人数、保留、0件/欠損、重複/矛盾、順序/Revision、scope/subject/期間分離、種別/分類/コード/allowlist、raw field projection、認可拒否・障害伝播・非同期入力変更を検証。fetch禁止ガードを各試験後に復元する。
- DB mockは既存22件に、新規reviewEvidenceが同じ管理者認可を通る1件を追加。
- 隔離DB: 既存統合試験を拡張。1人の報告を保留、2人の同bucket報告を人手確認対象、同原本の再読取Revision一致、limit打切り保留、管理者失効拒否を実Adapter経由で確認する。最新headの通常CI（隔離PostgreSQL16、既存52試験）の実行結果をPRへ記録する。本番DBを使用しない。
- ローカル再実行: `pnpm --filter @bunshin/application exec vitest run test/improvement-feedback-review-evidence.test.ts test/improvement-feedback-observations.test.ts test/improvement-feedback.test.ts test/improvement-engine.test.ts`、`pnpm --filter @bunshin/database exec vitest run test/improvement-feedback-observation-adapter.test.ts test/improvement-feedback.test.ts`。
- 型チェック、対象lint/整形、architecture検査/回帰、`git diff --check`、最新CIの全体test/buildを確認する。過去headの成功は流用しない。
- 作業中の失敗: 初回のNode crypto importはApplicationにNode型がなくtypecheckが拒否した。型/依存追加ではなく標準Web Cryptoへ変更して再実行する。assertionやCI条件は弱めていない。

## 未確認・切り戻し・次の最小ゴール

閾値の実運用での有用性・人手負荷、外部障害の除外、真の問題件数、保持期限/削除要求、Service移管履歴、本番RLS、実Session/OEM/端末、本番自動収集は未確認または未実装。閾値未達を「問題なし」としない。

切り戻しはreviewEvidenceの内部呼出しを外す。非永続で原本変更がなくDB rollbackは不要。

次は永続化を先行させず、同Serviceの管理画面へ限定した読み取り専用のEvidence確認導線を設計・接続する。少数セル/参照露出、実管理Resolver認可、空/欠損/保留表示を確認し、Candidate・承認・改善指示案は別ゴールへ分ける。
