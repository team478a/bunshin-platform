# グループ発信 G6 安全検証基盤 実装報告

## 完了した範囲

- Campaign参加人数上限の既存トランザクション制御を再確認
- 1参加者あたりのCampaign企画生成上限
- Campaignごとの類似度閾値
- 保存前の類似企画検査
- 重複停止の本文なし監査
- Campaign別KPIと管理画面
- Campaign中止による新規生成・通知停止
- 先行テスト推奨人数・期間の確認表示

## 類似検査

投稿案をNFKC正規化し、URL、空白、記号の表面的な差を除いてSHA-256 fingerprintと64-bit SimHashを作る。比較対象は同じCampaignで過去に安全検査へ合格した企画だけとする。類似度がCampaignの閾値以上ならMissionを永続化せず、`POSSIBLE_DUPLICATE`の件数監査だけを残す。

企業側へ投稿本文、Prompt、Knowledge、Memory、Workspace ID、User ID、Bunshin ID別の一覧を返さない。管理画面はCampaign単位の集計だけを表示する。

## 利用制限と停止

- 参加人数はCampaignの`participationLimit`で制御する。
- 招待利用回数は既存の`GroupInvitation.maxUses`で制御し、上限到達後の参加を拒否する。
- 企画生成は`generationLimitPerParticipant`で制御する。
- 類似判定は`similarityThresholdBasisPoints`で制御する。
- `CANCELLED`または`CLOSED`、期間外、参加撤回、Group退出、Assignment解除後は既存G5境界により生成とLINE通知を停止する。

## KPI

管理画面には生成、採用、コピー、投稿完了、GOOD評価、重複停止、採用率、投稿完了率を表示する。参加者別ランキングや投稿本文は表示しない。

## 先行テスト

画面上で参加10〜22人、期間30〜60日を満たすか確認できる。実運用では1社・1商品に限定し、参加は本人の明示操作、SNS投稿は本人の手動操作とする。運用開始、参加者募集、成功判定は人間が行う。

## 残る運用作業

実際の企業・商品・参加者の確定、法務確認、閾値調整、30〜60日のKPI評価は本番データが必要である。これらはコード上の完了として扱わない。
