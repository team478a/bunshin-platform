# 本人Feedbackの管理者確認画面 — 読み取り専用V1

## 結論と調査基準

2026-10-03 Asia/Tokyo。PR #1088のmergeを確認し、最新origin/main `fafb063170c0c88870ecded7e4ddc2e757a377fe`を基点に`codex/improvement-feedback-admin-preview`で実装する。Windows、Node 24.21.0、pnpm 10.10.0。既存の非永続Evidenceを同Serviceの管理者が週単位で確認する最小導線を追加する。

これは本人の自己申告の整理であり、BUG確定・原因診断・解決率測定ではない。原本の書込、Application/DatabaseのEvidenceロジック、schema、migration、依存関係を変更しない。永続Issue/Candidate、承認、改善指示案、自動修正、Job、他Adapterの画面接続を追加しない。mergeと本番適用を区別する。

## 実行経路と認可

`/s/[serviceSlug]/manage`の「SNSの困った報告」 → `/s/[serviceSlug]/manage/improvement-feedback` → `resolveManagedServiceContext(..., ADMINISTRATION)` → scoped SOCIAL存在確認 → `PrismaImprovementFeedbackObservationAdapter.reviewEvidence` → `BuildImprovementFeedbackReviewEvidence` → サーバー側表示projection → Server Component。

- ログインと同ServiceのSERVICE_OWNER/ADMINを必須にする。CONTENT_EDITOR・参加者・暗黙の本部横断権限は認めない。非公開Serviceでも管理Resolverから本人権限で解決する。リンクにはResolverが返す正規slugを使用する。
- AdapterがACTIVE管理所属、User/Workspace/Group/設定、Bunshin所有・Service一致をDBで再確認する既存契約を維持する。読取途中の認可失効は404。想定された不存在/拒否だけ404にし、未知の管理Resolver障害は握りつぶさない。
- 自Workspace/ServiceにSOCIAL capability assignmentを持つBunshin、または既存SOCIAL Feedbackがある場合だけメニューとページを利用可能にする。ブランド名からSNSと推測しない。研修/占い専用Serviceへ暗黙に接続しない。明示的にSOCIALも持つServiceは利用可能。過去の報告確認を妨げないため、この存在確認はcapabilityの現在statusだけで除外しない。存在確認は認可の代替ではない。
- 外部入力は許可した週の選択だけ。scope、actor、環境、subject=null、上限1,000はサーバーで固定する。tenantRefは既存契約どおりWorkspace namespace。APP_ENVを既存設定から取得し、秘密値を出力しない。

## 表示の最小化

- 日本時間の完了済み月曜0時〜翌月曜0時の半開期間を直近12週から選択する。当週/未来/範囲外/任意日付/重複week/未知query/利用者別の指定を拒否し、Evidenceを読まず選び直しを案内する。月曜境界もテストする。
- Engineの要確認ルール（3報告以上・2人以上）と画面の開示基準を分離する。画面は**各bucketで5人以上**を仮基準とする。どれか1つでも未達なら、全bucketのラベル・件数/人数と全体件数/人数を伏せる。部分合計との差から少人数を逆算する表示を避ける。
- PARTIAL/UNKNOWNなら詳細と件数を表示せず判定保留。COMPLETEで保存報告がない状態と、取得不能/不完全を区別する。自己申告がないことを「困っていない」と解釈しない。
- 同scope・Service全体選択・期間・Adapter/rule版・整数件数・bucket合計を検証し、サーバー側で許可した固定ラベルだけへ変換する。raw Evidence、sourceRefs、受付ID、scope ID、個人ID、clusterRef、Revision、digestをUI modelやHTMLへ渡さない。CSSで隠す方式ではない。本文・素材・Memoryを読み取って表示しない。
- DB/Evidence障害は「取得できない、0件とは判定していない」と表示する。ログには固定route/errorCodeだけを残し、例外本文や原本IDを出さない。
- 技術原因・外部Provider障害・母集団・発生率・解決率・原価は未確認/未測定と明記する。CSV、個票、コピー、承認、再生成、通知、更新操作はない。force-dynamicの認証済みServer Componentで、ユーザー横断cacheを追加しない。

固定窓と5人基準は再識別・差分攻撃・匿名化を保証しない。管理者が別途知る事実、報告の削除/変更による時点差、過去に得た情報との組み合わせは残余リスク。開示基準は運用前レビューと少数Serviceでのモニターが必要であり、統計的有意性の閾値として扱わない。

## 変更箇所

- web services: `improvement-feedback-admin-preview.ts`（期間・開示projection）、`improvement-feedback-admin-data.ts`（scoped存在確認・既存Adapter接続）。
- 管理ページ: `improvement-feedback/page.tsx`、`feedback-admin-summary.tsx`。
- 管理home: repository/data/view-modelと`service-management-navigation.ts`に明示SOCIAL導線を追加する。
- テスト: `improvement-feedback-admin-preview.test.tsx`、`improvement-feedback-admin-page.test.tsx`、既存navigationテスト。
- 文書: 本報告、Decision Log、Roadmap、Engine V1、Adapter Contractの最新状態を追記する。過去段階の未実装記録は履歴として維持する。

## 検証

今回の対象・関連回帰コマンド（外部通信禁止guardを新規テストで復元付きで設置）:

```text
pnpm --filter web exec vitest run test/improvement-feedback-admin-preview.test.tsx test/improvement-feedback-admin-page.test.tsx test/service-management-navigation.test.ts test/service-management-home-module-boundary.test.ts test/service-management-role-authorization.test.ts test/service-management-view-model.test.ts
```

結果: **6ファイル・77件成功**。実BuildImprovementFeedbackReviewEvidenceを合成原本から呼び、同じEvidenceのprojectionとSSR HTMLを検査する。DB Adapter接続はfake Prisma/Adapter、認証/Resolverはmockであり、実DB/ブラウザの認可E2Eとは区別する。

確認した条件: 完了週/月曜JST境界、12週範囲、重複/未知query拒否、未ログイン・管理権限違い・非SNS拒否、DB再認可拒否、私的scope/subjectの返却拒否、5人開示・1〜4人抑制・大セル＋小セル全体抑制、不完全と空の区別、ID/hash/Revisionの非露出、障害時の非0表示とログ最小化、正規slug導線、既存管理homeモジュール境界。

初回CI `37086703564`は整形と隔離DBが成功し、型チェックで異常なrule版を渡すテストfixtureのliteral型不一致が失敗した。異常入力の境界castだけを明示し、拒否assertionを維持して修正する。本番ロジックの緩和ではない。手元の全Web型チェックは端末負荷で長時間となり中断し、最新headのCIで再確認する。lint・architecture・整形・差分確認と最新headの通常PR CIは完了時のPR検証欄に実結果を記録する。Vite既存configLoader警告は今回の変更対象ではなく、上記テストの失敗ではない。

## 未確認・運用前条件

- 本番へのmigration/コード適用、実所属データ、実セッション、OEM別の少数セル運用は未確認。本番DB/Storage/資格情報は使用しない。
- SSR HTMLを検査したが、実スマートフォンでの表示・操作、ブラウザNetwork/RSC、アクセシビリティの実端末検証は未実施。視覚的な完成をテスト結果から断定しない。
- 12週より古い確認、当週の緊急報告確認、cursor/大規模閲覧、個票の限定開示、削除/保持ポリシーは別判断。最大1,000件で不完全なら件数を抑制し、全件取得済みとはしない。
- 原本自体の保持・削除や永続Candidateの設計はこのページで解決しない。表示基準とEngineの要確認基準は別の仮値で、運用モニター前にレビューする。

## 切り戻し・次の最小ゴール

新規ページとメニュー接続をこのPR単位で戻す。原本/DB schema/Application/Databaseに変更がないため、データ巻戻しを行わない。既存の本人Feedback入力と内部Evidence生成は維持できる。

次は**人手トリアージCandidateの最小永続化・Revision/認可・保持/削除方針を設計して承認条件を確定する**。今回の自己申告表示をBUG確定や自動修正へ直結しない。新schemaや承認実装は別PRの判断とする。本番変更、課金、実生成、実送信、merge、deployは実施しない。
