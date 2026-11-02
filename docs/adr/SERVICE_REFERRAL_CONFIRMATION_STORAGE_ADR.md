# B3 紹介資格の審査・確定・取消を保存する境界

日付: 2026-11-02 / 基点: main #1431

## 今回の範囲

共通の純粋な状態遷移と、本書の保存設計を確定する。今回migrationは作らない。
次のDB実装は本書の明示的な作業範囲に限定し、既存紹介・報酬・Creditの新テーブルを作らない。
未実装のDB契約を、永続化・SQL検証・本番稼働済みとは扱わない。

## 正本と最小保存

1. 紹介関係・被紹介会員の一意性は既存ServiceReferralを維持する。旧status・成果日時は変更しない。
2. ServiceReferralに資格state（UNASSESSED / CONFIRMED / REVOKED）、review（UNKNOWN / REQUIRED / CLEAR）、
   revision、confirmedPolicyVersionId、confirmedAt、revokedAtを追加する。
   初期値は未評価・審査不明・revision=0とし、旧成果から自動確定しない。
3. 新しいServiceReferralQualificationPolicyVersionは、既存Creditルールと異なる未保存の資格定義だけを扱う。
   Workspace / Service / policyKey / 正のversionの一意性、profileKeyと条件JSON、
   timezone、ACTIVE / SUSPENDED、作成者・理由・作成日時を保存する。
   版は追記のみ。既存版の条件・作成者・状態を更新しない。停止も新しい版を保存する。
   最新版を明示的に選び、未設定は無効。今回Hassyの既定値や全Serviceへのseedを作らない。
   初版で扱うprofileはSOCIAL_REFERRALのみ。profileRevisionは既存SOCIAL評価契約版を明示し、
   条件JSONはrequireNewRegistration / requireOnboarding / requireFirstUserGeneration /
   minimumActiveDaysの固定キーに限定する。SNS条件の検証は既存SOCIAL normalizerを利用し、
   Hassyの人数特典・文言・閾値の既定値を共通Policyへ埋め込まない。
   未知profile / revision・余分なキー・任意SQLや実行指示は保存・実行を拒否する。
4. 新しいServiceReferralQualificationAuditは、再構築不能なREVIEW / CONFIRM / REVOKE操作だけを追記する。
   scope・referralId・commandId・操作者・理由・前後revision/state・policyVersionId・操作日時と
   boundedなcommand fingerprintを保存する。本文、Memory、全活動・登録イベントを複製しない。
5. policyとauditの外部キーはWorkspace / Serviceを含む複合キーで結ぶ。
   確定結果は既存ServiceReferralの1行に結び付け、ルール版ごとの別紹介人数を作らない。

## 状態遷移

- REVIEWはUNASSESSEDだけで実施する。UNKNOWN / REQUIRED / CLEARを明示し、CLEARを暗黙既定値にしない。
- CONFIRMは最新のACTIVE資格Policy・CLEAR審査と、その版で同じscope/referralを評価したQUALIFIEDの証拠を必要とする。
  UNKNOWN / PARTIAL / PENDING / REJECTED・停止は確定しない。
- CONFIRMEDのpolicyVersionIdとconfirmedAtは不変。同じ版の再実行で再確定せず、
  別版で既存確定を上書きしようとしたら拒否する。
- REVOKEはCONFIRMEDに対する、理由付きの明示的な管理操作だけ。
  REVOKEDは終端状態で、自動復活・再付与を行わない。
- Rule変更・審査のやり直しだけで既存確定を取り消さない。確定後の調査は明示的な取消と区別する。
- 資格取消はCredit取消や返金ではない。既存台帳は書き換えず、補償・返却は別の認可・操作として扱う。

## DB実装で必要な排他・認可・再試行

サービス単位の既存Group行をロックして資格Policyの版番号・最新版を直列化する。
確認系は同じ順序（Group→ServiceReferral）でロックし、
current Policy / review / membership / referral / revisionをtransaction内で再取得する。
確定と取消にはrevisionのcompare-and-swapを使い、状態変更とauditを同一transactionで保存する。
CONFIRM要求はexpectedPolicyVersionIdも指定し、最新版と異なれば拒否する。
画面表示後のルール変更を、利用者が選んでいない新版の確定へ自動的に読み替えない。

同Service / commandIdの一意性をauditで持つ。初回の完全なcommand fingerprintを保存し、
同じcommand・同じpayloadの再試行は以前の結果を返す。
同じcommandIdで異なるactor / referral / kind / reason / revision等を送ったらCONFLICTにする。
fingerprintの対象は許可された要求フィールド（CONFIRMのexpectedPolicyVersionIdを含む）だけとする。
再試行ごとに変わるサーバー時計・生成した評価証拠を含めない。
認可後、保存済みcommandの完全一致を先に照合してから、新規要求だけを評価する。
再試行で返すのは過去の操作結果であり、現在の資格stateの再確定ではない。
後でREVOKEDになっていても、再試行から状態や特典を復活させない。
純粋遷移関数だけを冪等性や並行確定の保証とは扱わない。

既存管理者認可を再利用し、DB transaction内でもACTIVE User / Workspace / Serviceと
SUPER_ADMINまたは対象ServiceのSERVICE_OWNER / SERVICE_ADMINを検証する。
未許可の他OEM・一般会員は書き込めない。資格評価の成否をクライアントJSONから受け付けない。
操作者を被紹介者のactorへすり替えない。#1431の本人専用Readerを管理Jobへ流用しない。
管理用評価証拠の取得は別の明示認可境界を必要とし、未実装時は確定操作を有効にしない。
OEMの設定可能範囲・本部上限が未設定の場合も、自動有効化しない。

## 次のDB PRの作業範囲・品質ゲート

対象は上記の新規2モデルと既存ServiceReferralの資格属性、scope複合FK、
CHECK / immutable update guard、migration、LATEST_DATABASE_MIGRATIONとreadiness関連、
保存Repository・監査・管理者認可と使い捨てPostgreSQL検証。
HTTP / UI / Cron / 既存付与 / validReferrals / Hassy有効化 / production適用は対象外。

最低限、同時確定、同時版作成、同command再試行、payload衝突、他OEM拒否、
一般会員拒否、停止・審査不明・証拠不明の拒否、確定版の不変性、
取消後の再確定拒否、旧データの未評価初期値、旧報酬・台帳の非変更、
schema/readiness、全migrationの使い捨てDB適用を検証する。
確定・審査・監査の永続化が通っても、特典付与や本番有効化の完了とはしない。
