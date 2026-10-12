# マナベルスタイル 実運用判定

## 判定

- **現在の実受講開始: NO-GO**
- **内部1〜2人のWave 0: 全開始条件を満たした後のみCONDITIONAL GO**
- **一般提供・再現性保証: NO-GO**

人間は3件の学習設計方針を承認済みだが、本番APPROVE登録、参加者準備、Pilot開始、実課金は未実施である。方針承認を本番状態へ読み替えない。

## 利用フロー

| 段階         | 実装                                                       | 現在の利用可否・限界                                                   |
| ------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| 受講者登録   | Membership、Enrollment、Program、内部Seat/Allowlist        | 実装済み。本番参加者登録・Seat付与は未実施                             |
| 初期設定     | Profile Preparation、職種/AI経験/時間、相談                | 画面・保存経路あり。初心者の自力完走は実ユーザー未検証                 |
| 学習目標     | 相談→Goal候補→本人確認→保存                                | UNKNOWNをNONEにせず、CONSULTINGを学習Goal化しない。実本番保存未検証    |
| 学習計画     | 3つの承認済みDefinitionを版固定してPlan化                  | 教育方針は承認済み。本番3件APPROVE登録は未実施                         |
| 個別課題     | Definition→既存PROMPT_BASIC / PROMPT_CONDITION Assignment  | 目的/履歴で進路は変わるが、職種別教材本文を自由生成する機能ではない    |
| 本人の実践   | Guided Practice、本人操作申告、支援量、完了確認            | AIが完成品を代行しない設計。外部仕事ツールでの実操作は直接測定しない   |
| 回答・AI評価 | Answer job、評価、Skill/understanding、監査                | PENDING/不明を合格にしない。実Provider品質・誤合格率は未検証           |
| 次の課題     | NEXT / REVIEW / RETRY / BLOCKED / UNKNOWN / PLAN_COMPLETED | 版・回答・評価・監査が揃わなければ進めない。Plan完了を能力習得としない |
| 成果確認     | First Success、Capability Evidence、Fit Feedback           | 自己申告と検証評価を分離。本人再現性・転用力のRuntimeは未完成          |

主な根拠は Personal Learning Pilot HTTP/UI、`definePersonalLearningPlan`、`routeAiTrainingLearning`、`guided-practice.ts`、`OpenAiTrainingAnswerEvaluator`、Learning Definition ApprovalのDB/API/UI、および対応テスト。

## 個別化と本人支援

Goal、経験、既存Skill、回答/評価、Plan revisionから次のDefinitionやREVIEW/RETRYを決める接続はある。回答不足、評価なし、版不一致をUNKNOWNとして止める点も実装されている。

ただし個別化は主に「次にどの学習段階へ進むか」であり、本人の業種・職務ごとに新しい教材や課題を生成する完成機能ではない。現行Wave 0はPROMPT_STRUCTURE、CONTEXT_SETTING、CONSTRAINT_SETTINGの3段階と既存Missionを使う。画像、動画、Excel、API、自動化、AI Agent等はDefinition Gapのままとする。

## EVO-05の接続状況

| 範囲                 | 完成                                                         | 未完成                                                                   |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| #1193                | 2回の明示Evidenceを同scope・同Definition版で比較する純粋契約 | 実履歴、課題提示、UIなし                                                 |
| #1194〜#1196         | Privacy設計、限定ownerアクセス、版付き再現題材参照           | 題材はDraft。自動承認禁止                                                |
| #1197                | 本人scopeの2Assignment履歴projection                         | 題材参照のない旧履歴はUNKNOWN                                            |
| #1198〜#1199         | review assertion、CAS、immutable audit、取消                 | 管理HTTP #1200はOPEN。production未配備                                   |
| Runtime / learner UI | 既存学習・履歴部品を再利用可能                               | Approved題材Reader→新再実践Assignment Bridge→本人UI→比較結果表示が未接続 |

このため「課題に合格した」と「本人が後でもう一度できる」はまだ別である。EVO-05を提供済みの再現性評価と表示しない。

## productionで確認できる範囲

production `e5812090…` には、Pilot学習焦点表示、学習設計レビュー/承認UI、原価可視化、Personal Learning日次費用Hard Stopと対象Migrationが限定releaseされている。公開healthも正常。

一方、次は未実施またはUNKNOWNである。

- Production 3DefinitionのAPPROVE receiptと再GET/監査
- Pilot flag、単一authority、対象Program、Seat/Allowlist、内部人数、Profile
- AI Provider source/model/価格版/日次金額/同時数/外部account budget
- 実認証、実DB RLS role、最新Backup/復旧、STOP/drain
- 実スマホ/LIFF、再ログイン、評価待ち、First Successの完走
- Pilot専用LINE学習通知。既存30日研修通知は代用しない

## Wave 0開始条件

1. release SHA、DB全履歴/RLS/role、最新Backup/復旧を読取確認する。
2. 3Definitionを固定版・digest・7項目で1件ずつ本番APPROVEし、GETと監査で確認する。
3. 対象Programを停止状態で準備し、内部1〜2人のEnrollment/Seat/Profileを明示承認する。
4. Provider価格・日次費用・同時数・総予算・監視/停止担当を設定し、費用発生を承認する。
5. 全GateがPASSした後だけ開始し、実端末で相談→Plan→実践→回答→評価→次課題→復元→STOPを確認する。

どれかがUNKNOWNなら開始しない。LINE通知を提供条件に含める場合は、専用通知経路の実装と実配送受入も開始前P0になる。
