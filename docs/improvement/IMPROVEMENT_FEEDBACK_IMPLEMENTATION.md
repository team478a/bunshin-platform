# 本人の「困った」Feedback — 最小入力・保存

## 結論と範囲

2026-10-03 (Asia/Tokyo)、main `9f6fc42e2583199b3be972dad717f77e847770dd`（PR #1085マージ）から独立ブランチ `codex/improvement-trouble-feedback`。
共通Application契約・専用原本・本人入力・HTTP・永続化・認可/冪等性回帰を一つのゴールとする。初回接続はSOCIAL能力が有効なサービスの本人投稿パートナーホームのみ。ハッシー名/OEM名で分岐しない。研修・占い・個人Workspaceホームへは接続していない。OpenMontageや外部Providerは使用しない。

保存した信号は利用者の困りごとの自己申告であり、BUG確定、改善Candidate、自動検知、個別返信/解決済みではない。

## 保存先の比較と判断

| 既存原本                                   | 今回再利用しない理由                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| MissionFeedback / PostRecord.manualMetrics | 投稿の本人らしさ・成果を扱う。Mission不要の操作報告を混ぜない             |
| SupportCase / SupportCaseNote              | 対象Userと運営者の対応管理。Service/Package/Bunshinの本人起点原本ではない |
| SocialActivityBarrierCase                  | SNS継続障壁と支援履歴。画面不具合等を障壁確定へ置換しない                 |
| ImprovementFeedback（新規）                | 選択コードと本人scope・送信キー・受付時刻のみ。原文/写真/会話/Memoryなし  |

## 呼び出し経路・入力

`ServiceBunshinDetailView` → `ImprovementFeedbackForm` → POST `/api/services/[serviceSlug]/bunshins/[bunshinId]/improvement-feedback` → `improvementFeedbackResponse` → `RecordImprovementFeedback` → `PrismaImprovementFeedbackRepository` → `improvement_feedback`。

- 種類: OPERATION / CONTENT / WAITING / OTHER。
- 場面: SETUP / TODAY / PHOTO / VIDEO / NOTIFICATION / OTHER。
- 困り具合: BLOCKED / DIFFICULT / SUGGESTION。
- クライアント入力は上記3コードとUUID submissionKeyだけ。strict schemaで追加フィールドを拒否。自由文、URL、素材、Goal、User、Service、Workspace、Packageの任意入力は不可。
- actorはSession、Workspace/Serviceは既存Member Service Resolver、Packageは当該経路のSOCIAL。本文はJSON、ストリーム読み取りを2,048 bytesで打ち切る。既存Same Originチェック/OEM独自ドメイン境界を使用する。
- Repositoryでも本人Bunshin所有、Workspace/Service、ACTIVE User/Workspace/Group/Membership/SOCIAL能力、ServiceConfiguration存在を照合。個人Bunshin、他人所有、失効所属、異なるServiceを拒否する。Service管理者であっても他人のBunshinへ書けない。

## 二重送信・失敗

- DB Transaction内のWorkspace＋actor advisory lock、同境界＋UUID送信キーのunique制約。別インスタンス/同時送信を直列化。
- 同じキー・同じscope/内容は元のid/createdAtを返す。scope/内容変更はCONFLICT、原本を更新しない。権限失効後は再送にも原本を返さない。
- 新規は同じWorkspace＋actorで直近24時間10件まで。保存済みキーの再送は上限到達後も確認可。上限は運用開始前にレビューする固定V1値（SNS投稿Quota/費用とは別）。
- UIは最初の送信でキーと内容を固定し、二重クリックを同期ガードする。保存確認ができなければ同じ内容で再送。成功時だけ保存済み表示。通信失敗で新キーを発行しない。Service/Bunshin変更はReact keyでフォームを再作成。
- このキーはマウント中のみ保持。画面再読込/別タブ/別端末は別報告となり得る。報告内容の意味的重複検知やOffline queueは未実装。受付IDを受け取らずにタブを閉じないよう案内する。
- 保存エラーを成功扱いにしない。公開API応答は既存の一般化エラーのみ、DB URL等を返さない。Provider・Job・通知・AI生成・文章/画像配信に同期依存しない。

## Schemaと適用

`20261003010000_improvement_feedback`に専用表、選択コードCHECK、unique/index、Workspace/Bunshin複合FK＋削除CASCADE、RLS有効化（公開ポリシーなし）。Bunshin側は逆relation追加だけ。最新Migration readinessを更新する。既存原本の書換え/バックフィルなし。

Service/actorのBunshin所有対応はRepository認可でありSQL複合FKによる全境界保証ではない。広い資格情報の直接DB操作まで安全化したとはしない。RLS対応の実本番DBロール検証は未実施。

本番Migration/デプロイは未実施。適用後に入力が可能になる。専用表が未適用なら保存失敗を表示する（投稿生成自体は独立）。切り戻しは新フォーム/API露出を止める。既存表へ移し替えたり破壊的rollbackで保存原本を消さない。保持期限、Service退会後の削除/匿名化、本人の個別報告削除APIは後続の明示設計が必要。Bunshin実削除時のCASCADEのみ追加する。

## 検証・制約

Node 24.21.0 / pnpm 10.10.0 / Windows PowerShell。

- Application契約: 10テスト成功。
- Repository mock: 10テスト成功。実where句・保存指示・再送/競合・失敗伝播を検証。
- Web HTTP: 8テスト成功。fake依存とfetch禁止ガード、追加フィールド/過大本文/Origin/未認証/保存障害を確認。
- 実DB統合: `test/database.integration.test.ts`に同時2インスタンス、本人境界、別Bunshin/Service/Workspace/User/Package、所属/能力失効、上限/再送、CHECK、削除連動を追加。隔離PostgreSQL16の通常PR CIで検証する。本番DBは使わない。
- `pnpm --filter @bunshin/database db:validate`: 初回DIRECT_URL未設定で停止。その後、接続しない架空localhost URLで再実行し成功。
- 型/lint/全回帰/buildと最新headのCI結果はPR/最終報告を正本とし、未完の実行を成功とは記載しない。
- スマートフォン実機、実Session/OEM独自ドメイン、本番E2E、画面再読込をまたぐ応答喪失は未確認。静的UIだけを実操作保証として扱わない。

再実行: Node24 PATHの下で `pnpm --filter @bunshin/application exec vitest run test/improvement-feedback.test.ts`、`pnpm --filter @bunshin/database exec vitest run test/improvement-feedback.test.ts`、`pnpm --filter web exec vitest run test/improvement-feedback.test.ts`。実DBは既存CIの隔離DB/Migration/`pnpm test:integration`手順に限定する。

## 次の最小ゴール

本人Feedbackの選択コードを、許可された同Service/SOCIALのImprovement Adapterで読み取る。元のUser/Bunshin/受付ID/時刻を明示参照し、別Serviceや生素材は取得しない。母集団不足で発生率を出さず、報告をBUGや因果効果へ昇格させない。管理UI・Candidate承認・自動指示実行をまとめて先行追加しない。
