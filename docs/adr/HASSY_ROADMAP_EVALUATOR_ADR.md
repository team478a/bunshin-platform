# ADR: 成長ロードマップの進捗判定

## Status

Accepted for Phase 1-B1 implementation (2026-11-02).

## Decision

- Applicationに版付きの5段階定義、純粋な進捗判定関数、既存GetMemberUsageSummaryを合成する取得Use Caseを追加する。DB Adapter、保存・管理画面、HTTP、UIは独立した後続PR。現在の固定90日ロードマップのrouteを変更しない。
- 初期定義はコピーを返すfactoryで提供する。既定版の内容を書き換えた定義は拒否し、変更時には別versionを要求する。Service固有定義はWorkspace / Serviceを束縛する。これは定義の永続化・HQ/OEM編集権限の完成ではない。将来の保存先は監査後のmigrationタスクで決定する。
- 現版では5段階と既存の15項目を必須とし、別versionで名称・閾値・段階内の順序を変更できる。任意の紹介項目はSTEP 5への追加に限定する。基本項目を消して紹介条件へ置き換える定義は拒否する。
- 生成成功、採用または不採用、累計活動日数は既存MemberUsageSummaryから判定する。生成・判断は1件、継続は累計3活動日が初期値。7日/30日の窓を達成条件にせず、窓移動だけで過去の達成を失わせない。別の初期設定・履歴閲覧・ガイド利用等をこれらの回数から推測しない。
- 既存集計にない事実は、scope / asOf / timezoneを持つContext Portの明示的な証拠（true / false / null）として受け取る。未取得・nullはUNKNOWNとし、falseや0へ補完しない。紹介は既存紹介基盤の有効・確定成果数の投影だけを受け取り、紹介コードや登録人数から推測しない。
- milestoneごとの利用可否は既存EffectiveGroupFeatureAccessの投影と、実装済み・停止スイッチ・予算の照合結果を受け取る。新しいFeature Definition / Flag / Entitlement / Creditを作らず、権限を付与・消費しない。未取得はPREPARING。停止・権限なし・予算なしは利用不可として別の理由を返す。
- 達成状態（COMPLETED / INCOMPLETE / UNKNOWN）と利用状態を分離する。表示用状態はCOMPLETED / AVAILABLE / PREPARINGとし、PREPARINGの詳細理由を必ず返す。達成済みでも利用停止なら利用不可を保持し、達成を取り消さない。
- ステージ順と項目順で、未達成が確認でき、かつ現在利用できる項目を1件だけ優先する。前のステージの達成を権限・機能利用の前提にしない。未確認項目や利用不可項目は優先候補にしない。この優先表示は自動化提案履歴・抑制エンジンではない。
- Contextは操作上の前提を確認したreadyForRecommendationも明示する。未確認をtrueへ補完せず、falseの項目は権限上利用可能でも優先候補から除外する。前提の確認を進捗の順番による機能lockへ転用しない。
- 紹介条件を使えるのは任意のREFERRAL_MILESTONEだけとし、基本機能やガイドの達成条件への混入を拒否する。紹介による実際の試用・特典開放は既存Entitlementの責務で、人数から利用権を生成しない。
- 取得Use Caseは既存の認可付き集計を先に実行し、Context Portにも本人・現在の所有権と同意の再検証を要求する。返却scope / asOf / timezoneの不一致は拒否する。純粋な判定関数自体は認可を代替しない。
- 新規イベント、集計table、達成記録、AI呼び出し、外部操作、migrationは追加しない。Context Adapter接続前にユーザー提供済みとは扱わない。

## Initial stages

1. SNS運用を始める: 初期設定 / 投稿案生成 / 採用・不採用
2. 継続して利用する: 投稿履歴 / 週間計画 / 累計活動日数
3. 投稿の負担を減らす: SNS連携ガイド / 投稿準備 / 予約投稿
4. 成果を分析する: SNS実績取得 / 投稿分析 / 改善反映
5. 自動化を拡張する: MUSEガイド / Zapierガイド / 外部AI連携

紹介milestoneはService別の別versionで追加できる任意項目で、初期5段階の基本項目には含めない。案内文や指示文、外部API接続自体は今回実装しない。
