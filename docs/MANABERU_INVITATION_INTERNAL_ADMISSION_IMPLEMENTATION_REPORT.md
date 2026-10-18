# マナベル招待時の内部研修枠自動付与 — 実装報告

## 目的

マナベルスタイルの招待者が、招待URLから通常参加したときに研修参加枠まで自動で準備し、運営者による個別Enrollment/Seat登録を挟まずに参加確認へ進める。ハッシーおよびその他Serviceの招待挙動は変えない。

## 実装

- 有効なマナベル参加招待の受諾時、Membership作成と同じSerializable transaction内で、停止中のAI_TRAINING_V1 Pilot用Enrollmentと`INTERNAL` Seatを作る。
- 対象は`manaberu-style`、`INVITATION_ONLY`、参加者招待、自動承認に限定。LINE FOLLOW由来で招待作成者がnullの場合は、記録上の承認者としてACTIVEなService Ownerを使用する。
- 有効なWave 0の内部上限1〜3名、現在Wave 0、停止中Program、無料・有効・招待限定・GUIDED Offeringがそれぞれ一意であることを検証する。Seatの履歴を含む残枠、失効済み枠、Projection、重複Enrollmentもtransaction内で確認する。
- 前提不足・不整合・上限到達は例外にし、Invitationの消費、Membership、Enrollment、Seatの全てをrollbackする。上限を既定値で補ったり、別Offeringを推測選択したりしない。
- Seat・Enrollmentの監査記録を追加し、設定上のPilot状態は`enabled=false`を維持する。
- AI利用同意、Profile、Definition承認、Admission/料金、Pilot開始、LINE通知・AI呼出しは自動化しない。招待受諾はAI送信許可ではない。

## 変更ファイル

- `packages/database/src/personal-learning-invitation-admission.ts` — 招待の自動Enrollment/Seat付与。
- `packages/database/src/group-participation.ts` — 参加招待の受諾トランザクションから呼び出し。
- `packages/database/test/database.integration.test.ts` — 3席上限、4人目拒否、Pilot停止・AI同意なし、ハッシー分離の統合テスト。
- `docs/DECISION_LOG.md` — 2026-10-16の手動Enrollment/Seat方針を限定的に置き換えるユーザー決定。
- `docs/ai-training/MANABERU_STYLE_PRODUCTION_WAVE0_LAUNCH_RUNBOOK.md` — 招待後の運用順序を更新。

## 検証

- Node.js 24.19.0で`pnpm --filter @bunshin/database typecheck`成功。
- Prisma Client生成成功。
- 対象TypeScriptファイルのPrettier整形成功。
- DB統合テストは追加済みだが、ローカルに安全な使い捨てPostgreSQL接続が設定されていないため未実行。CIの`verify` / `database`結果はPRで確認する。
- Production設定・Migration・デプロイ・招待発行・LINE実機テストは未実施。

## 実端末での運用テスト手順（PR merge/deploy後）

1. マナベルの招待制が有効であること、LINEログインがテスト対象のLINEアカウントで利用可能であることを確認する。
2. 既存の招待画面またはLINEの招待返信から、テスター本人専用の1回限りURLを使う。
3. LINE内ブラウザでURLを開き、LINE Loginを行い、招待内容を確認して本人同意する。
4. 受諾後に研修確認画面へ遷移し、Enrollmentと内部枠が1件ずつ作られ、AI利用同意がまだ未記録、Pilotが停止中であることを管理画面/APIまたはDBの権限制限された監査ビューで確認する。
5. 3名まで成功し、4名目が参加確定前に拒否されること、再利用済みURLが使えないことを確認する。
6. AI送信は別確認。本人の明示同意、Program/Admission/費用/Definition/開始Gateが全て準備されていない限り実行しない。

## 未解決・次の条件

- 現在の管理画面読取では専用Pilotが停止中で、準備チェック項目・内部枠準備が完了した証拠はない。本機能は有効な内部上限・Offering・Program projectionが整うまで、招待受諾をfail-closedにする。
- PRのCI成功と人間レビューが必要。merge後もProductionへの反映、本番設定/Enrollment状態、LINEログイン有効化、実端末テストは別段階で証拠化する。
- AIでの実習まで確認する場合は、今回の招待自動付与とは別に、既存のWave 0開始・Admission・費用・同意Gateを確認してから行う。
