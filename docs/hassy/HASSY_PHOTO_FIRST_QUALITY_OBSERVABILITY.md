# ハッシー Photo First 品質観測 実装報告

## 1. 結論

監査時点では、Photo First Variantに最終品質スコア、モデル、Prompt Version、Token、原価、処理時間は保存されていたが、品質判定のissue codeと修正回数は保存されていなかった。

そのため、初回品質判定で`PHOTO_FIRST_UNCONFIRMED_FACT`が発生し、1回の自動修正後にPASSした場合、最終スコアは残るものの「未確認事実が修正された」という経過を後から集計できなかった。2回目も品質検査を通過せずGenerationが失敗した場合も、既存の`CONTENT_REJECTED`だけでは品質issueの種類を判別できなかった。

既存の`MissionContentVariantGeneration`へ品質監査項目を追加し、成功・失敗の両方で同じGenerationに記録する。新しいTelemetry基盤やPhoto First専用テーブルは追加しない。

## 2. 監査した既存記録

| 記録                                      | 既存の内容                                                     | 不足                                               |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| `AiUsageEvent`                            | 工程、Provider、Model、Prompt Version、Token、原価、時間、成否 | 品質verdict、score、issue code、修正回数           |
| `GenerationContextSnapshot`               | Daily Mission生成時のquality issue codeと修正回数              | Variant単位ではなく、Photo First再生成後は更新不可 |
| `MissionContentVariant`                   | 最終品質スコア、生成観測値                                     | 修正前issue code、修正回数                         |
| `MissionContentVariantGeneration`         | claim、成功・失敗、生成観測値、一般的なerror category          | 品質判定の詳細                                     |
| `MissionContentVariantPhotoFirstMetadata` | 写真、解析、企画、確認質問・回答                               | 品質経過。企画Metadataへ混在させるべきではない     |

## 3. 追加する記録

`MissionContentVariantGeneration`へ次を追加する。

- `qualityVerdict`: 最後に実行できた品質判定。品質判定前の失敗はnull。
- `qualityScore`: 最後に実行できた品質スコア。品質判定前の失敗はnull。
- `qualityIssueCodes`: 同じGenerationの全品質試行で観測したcodeの重複なし一覧。
- `qualityRepairCount`: 実際に本文を修正生成した回数。現在の上限は1。

最終PASS後も、最初の`PHOTO_FIRST_UNCONFIRMED_FACT`を`qualityIssueCodes`へ残す。通知、表示、本文生成など別工程の失敗を品質issueとして混ぜない。

## 4. 実行経路

```text
Variant本文生成
  -> quality attempt 0
  -> verdictがREVISEなら修正生成を1回
  -> quality attempt 1
  -> 全attemptのissue codeを重複排除
  -> 成功: Variant Generationへ最終判定と品質履歴を保存
  -> 失敗: 同じVariant Generationへ最後の判定と品質履歴を保存
```

Provider呼び出しや再試行回数は変更しない。品質履歴の保存失敗を握りつぶさず、既存Generation更新と同じTransaction境界で扱う。

## 5. 分離と安全性

- Workspace、Bunshin、User、Daily Missionの既存認可境界を変更しない。
- Photo First専用の監視基盤を作らず、既存Variant Generationへ記録する。
- AI研修、占い、千ノ国メディアのGenerationへ項目を混在させない。
- issueの詳細メッセージ、写真内容、確認回答本文は保存しない。集計に必要なbounded codeだけを保存する。
- `qualityIssueCodes`は最大20件、各80文字。重複を拒否する。
- 完了Variantは最終`PASS`とVariantの`qualityScore`一致を必須にする。

## 6. 運用上可能になること

- `PHOTO_FIRST_UNCONFIRMED_FACT`が発生したGeneration件数。
- そのうち1回の修正でPASSした件数。
- 同issueが残ったまま`CONTENT_REJECTED`になった件数。
- Prompt Versionごとの発生傾向。

今回、管理画面や定期集計は追加しない。まず既存運用クエリで必要性を確認し、表示要件が決まった後に別作業とする。

## 7. 未確認事項

- 本番での発生件数と修正成功率。
- 管理画面へ表示する必要性と閲覧権限。
- 長期保存期間と集計期間。
- 他の品質issueを同じ運用指標として扱う優先度。

## 8. 次の最小タスク

本変更をマージ・デプロイした後、架空データまたは許可済み運用データだけを使い、`PHOTO_FIRST_UNCONFIRMED_FACT`を含むGenerationと修正後PASSのGenerationがテナント境界付きで取得できることを確認する。本番データの内容や確認回答本文は表示しない。

## 9. テナント境界付き照会の確認

2026-10-02、架空データだけを使うRepositoryテストを追加した。照会はWorkspace、Bunshin、Daily Mission、操作Userの既存認可を先に確認し、認可後にだけGenerationを検索する。

- issue codeを完全一致で指定できる。
- `PHOTO_FIRST_UNCONFIRMED_FACT`を含み、修正1回後に最終`PASS`となったGenerationを取得できる。
- 別Workspaceなど認可外のMissionではGeneration検索自体を実行せず、空配列ではなく非公開として扱う。
- 返却対象はGeneration ID、状態、Variant ID、一般エラー分類、Prompt Version、品質判定・点数・issue code・修正回数、時刻だけに限定する。
- 投稿本文、写真解析、確認質問・回答、User ID、idempotency keyは返却しない。
- 最大100件、作成日時の新しい順に限定する。

この段階では管理画面や外部HTTP APIを追加しない。運用上の表示要件と閲覧権限が決まるまでは、認可済みRepository契約と自動テストを正本とする。

次の最小タスクは、デプロイ後の発生状況を確認し、管理画面に表示する必要がある場合だけ、既存のサービス運用権限へ接続した読み取り専用の集計APIを追加することである。
