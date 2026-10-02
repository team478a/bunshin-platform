# ハッシー Photo First 確認回答 実装報告

## 1. 結論

Photo Firstの企画に確認質問が残った場合、利用者が画面で回答し、同じ写真・Daily Mission・SNS Goalを維持したまま投稿案を見直せる最小経路を追加した。

回答前の投稿案は上書きしない。質問、回答、回答元Variant IDを新しいPhoto First VariantのMetadataへ保存し、再読込時には最新の案を復元する。通常の別案生成の1件制限は維持し、確認回答だけを直前のPhoto First Variantから最大5版まで追記できる。

## 2. 接続経路

```text
保存済みPhoto First案の確認質問
  -> 利用者が500文字以内で回答
  -> Service / User / Bunshin / Mission / 写真 / 回答元Variantをサーバーで照合
  -> 同じ写真を再解析（回答は命令ではなく所有者の事実データ）
  -> Goal・Strategy・履歴を維持して本文を再生成
  -> 既存品質検査
  -> 新しいVariantとPhoto First Metadataを同一Transactionで追記
  -> 最新案を画面へ表示
```

## 3. 境界と設計判断

- クライアントが質問文を送り直す方式にはしない。サーバーが回答元Variantの保存済み`confirmationQuestion`を取得する。
- 回答元Variantは、同じWorkspace、Service、User、Bunshin、Daily Mission、写真に属する必要がある。
- Repositoryは直前のPhoto First Variantだけを回答元として受理し、古い版からの分岐や通常Variantからの回答を拒否する。
- 回答履歴は既存の`planningJson`へ追記する。新しいDB表・migration・依存関係は追加しない。
- 写真分析Promptは回答を命令ではなく事実データとして扱い、確認できた範囲だけを企画へ反映する。解決済みの質問を繰り返さず、なお重要情報が不足するときだけ新しい質問を一つ返す。
- 同一の冪等キーは既存Generationを返し、新しい外部リクエストを開始しない。
- Photo First以外のPackage、AI研修、占い、千ノ国メディアへ回答ロジックを混在させない。

## 4. 保存する回答証跡

新しいPhoto First Variantの`planningJson`へ次を保存する。

- `confirmationAnswer`: 利用者の回答
- `confirmationSourceVariantId`: 回答元Variant
- 新しい解析で追加確認が必要な場合の`confirmationQuestion`

元Variantには元の質問と本文が残るため、回答前後を追跡できる。

## 5. 検証

非課金fixture・mockだけを使用した。

- Capability: Metadataと回答元IDの長さ検証・正規化
- Database Repository: 最新Photo First版だけをclaimでき、古い版を拒否すること
- HTTP: 認証済みService scopeの保存済み質問だけを回答できること
- Provider contract: 回答を所有者の事実データとして渡し、命令として扱わないこと
- UI: 確認質問があるときだけ回答欄と見直し操作を表示すること
- Regression: Mission Variant、Photo First差分、ポイント経路の既存テスト

実行結果は対象PRの最新CIを正本とする。ローカル対象テストはCapability 7件、Database 9件、Web 59件が成功した。

## 6. 未確認事項

- 実Providerが回答を意図どおり反映する品質
- 本番DB・Storageを用いた回答前後の復元
- スマートフォン実機での入力・待機表示
- 回答再生成時の本番利用枠、AI Usage、原価記録
- 新しい確認質問が連続した場合の利用者体験
- quality checkerが未確認事実の断定を独立して検出すること

## 7. 次の最小タスク

追加課金を行わず、quality checkerへPhoto Firstの未確定情報と確認回答を構造化して渡し、未回答の事実を断定した本文を`REVISE`へ分類する契約テストを追加する。今回の回答導線と同じPRへ実Provider検証を混在させない。
