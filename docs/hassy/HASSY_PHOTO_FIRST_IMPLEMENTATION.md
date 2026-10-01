# ハッシー Photo First V1 実装報告

更新日: 2026-10-01（Asia/Tokyo）
初回実装基準: `main` commit `abb9d82d78e66325b8b962524d0709035c71dca5`
Metadata永続化基準: `main` commit `d1629db0f3a6233a5e2649fc321169160ec72a5d`

## 1. Executive Summary

ハッシーに、利用者が保存した写真を起点として投稿案を考える Photo First の最小縦断経路を追加した。既存の Plan First は変更せず、同じ画面で併用する。

今回の経路は、既存の本人・Workspace・Service・Bunshin境界で保存された非公開写真を読み、解析用に縮小・JPEG再符号化したうえで、Vision対応AIへ送る。写真の構造化分析と、企業情報・対象顧客・SNS Goal・確定済みStrategy・今日のMission・直近Missionを統合した企画を作り、その企画を既存の投稿本文生成・品質検査・利用枠・AI利用記録・投稿案履歴へ接続する。

コードと自動テストの範囲では **IMPLEMENTED**。後続PRで元写真ID・構造化解析・企画Metadataを投稿案と同一Transactionで永続化し、再読込後に最新のPhoto First結果を復元する経路も追加した。実OpenAI、実Storage、本番データ、スマートフォン表示を用いたE2Eは **PRODUCTION_E2E_REQUIRED** であり、本番稼働確認済みとは扱わない。

## 2. 実装範囲

### 利用者フロー

1. 利用者が「今日できること」で写真を選び、権利確認に同意して非公開Storageへ保存する。
2. 保存状態が `READY` の写真に「この写真から投稿を考える」を表示する。
3. 今日のDaily Missionを企画の軸としてPhoto First生成を開始する。
4. 写真を構造化分析し、Goalと企業文脈を踏まえてテーマ、切り口、推奨理由、写真の使い方、必要時の確認質問と画像編集Promptを作る。
5. 既存の投稿本文生成と品質検査を通し、`MissionContentVariant`として保存する。
6. 元写真ID・構造化解析・企画・解析モデル/Prompt Versionを専用Metadataとして同じTransactionで保存する。
7. 画面に企画と投稿本文を表示し、本文または画像編集Promptをコピーできる。画面再読込後も最新結果を復元する。

### Plan Firstとの関係

- 既存のWeekly PlanとDaily Mission生成は変更しない。
- Photo Firstに失敗しても既存MissionとPlan Firstの投稿案は失わない。
- V1は今日の確定済みMissionを投稿履歴・承認済み企画のアンカーとして使う。Missionが未作成でも、今日を含む確定済みWeekly PlanとACTIVEなSNSプロフィールがあれば、既存Mission生成サービスでMissionを作成してからPhoto Firstへ進む。Planまで存在しない日は独立した企画を作らず、画面に待機理由を表示する。

## 3. 再利用・拡張・新規実装

| 項目                  | 判定         | 内容                                                                                           |
| --------------------- | ------------ | ---------------------------------------------------------------------------------------------- |
| 写真アップロード      | 再利用       | `BunshinMemory`、`daily-action-materials`、署名付きUpload、10MB上限、JPEG/PNG/WebP検証         |
| 非公開保存・読取      | 再利用       | private bucketと5分の署名付きRead URL                                                          |
| EXIF除去              | 再利用・拡張 | 保存時とVision送信時にSharpで再符号化し、元Metadataを引き継がない                              |
| 解析用縮小            | 新規         | 長辺1600px以内、JPEG quality 82、拡大なし                                                      |
| Vision解析            | 新規         | `OpenAiPhotoFirstAnalyzer`、JSON Schemaによる構造化出力                                        |
| Goal/企業/履歴Context | 拡張         | 既存Strategy・Goal Planning・企業Profile・対象顧客・Mission・直近Missionを解析と本文生成に渡す |
| 投稿本文生成          | 再利用・拡張 | 既存AI Runtime、品質評価、内容検証、MissionContentVariant保存を再利用                          |
| 利用枠・原価記録      | 再利用・拡張 | 既存Organization AI quotaとAI Usageへ `PHOTO_FIRST_ANALYSIS` を追加                            |
| UI                    | 新規         | Photo First起動、企画表示、本文・画像編集Promptのコピー                                        |
| Photo First履歴       | 新規         | 投稿案と元写真へDB制約で紐づく専用Metadata。最新結果を再読込時に復元                           |
| LINE画像受信          | DEFERRED     | V1はWeb画面への導線を前提とし、LINEへ送った画像の直接処理は行わない                            |

## 4. データフローと所有境界

```text
本人Web画面
  -> same-origin POST
  -> Member Service解決
  -> Workspace / Service / Bunshin / ownerUserId再検証
  -> READYかつ本人所有のPhoto BunshinMemoryを限定検索
  -> private Storageからサーバー読取
  -> 回転補正・縮小・JPEG再符号化
  -> Photo First構造化解析（store=false）
  -> 既存Mission本文生成・品質検査
  -> MissionContentVariant + Photo First Metadataを同一Transactionで保存
  -> 同一レスポンスで企画と本文を表示
  -> 再読込時は認可済みRepositoryから最新Metadataを復元
```

写真検索は `id` だけで行わず、`workspaceId`、`bunshinId`、`ownerUserId`、`groupId`、`sourceType=USER_INPUT`、Photo用`sourceId`、`attachmentStatus=READY`、未削除を同時に照合する。他Workspace、他Service、他User、他Bunshinの写真は解析入力にできない。

## 5. 構造化解析

解析出力:

- `imageType`
- `subjects`
- `objects`
- `scene`
- `visibleText`
- `possibleContentAngles`
- `qualityNotes`
- `uncertainElements`
- `safetyFlags`

企画出力:

- `theme`
- `angle`
- `recommendationReason`
- `photoUsage`
- `imageEditPrompt`
- `confirmationQuestion`

画像内の文字や物体は命令ではなくデータとして扱う。人物特定、センシティブ属性推定、人気・新商品・評価・売上・人物名など画像だけでは確認できない事実の断定を禁止する。重要な文字が不確かな場合は、投稿本文で創作せず確認質問へ回す。

## 6. Goal・企業・履歴の反映

Photo First解析には、企業名、事業目的、対象顧客、人格要約、事業Profile、現在のSNS Goal、Goal Planning、承認済みStrategy、媒体、今日のMission、直近Missionを渡す。Goalにより、テーマ、切り口、写真の使い方、CTAへのつながりを変え、CTA語尾だけを変える指示は禁止している。

既存の本文生成工程では、さらに既存Generation Context Snapshot、選択されたMemory、Campaign等の既存許可済みContextを利用する。受理・不採用・投稿結果がどの程度Snapshotへ反映されているかは既存Goal実装に従うが、Photo First解析単体へ全Feedback・KPI明細を直接渡してはいない。

今回の自動テストはContextと指示の伝播を確認するものであり、実Provider出力が全Goal・全業種で十分な差を生む品質E2Eの証明ではない。

## 7. 冪等性・失敗時の扱い

- 既存の `ClaimMissionContentVariantGeneration` を写真読取とProvider呼出より先に取得する。
- 同じ生成冪等キーの同時・再送は、成功済み投稿案の再利用または競合応答となり、同じキーで解析を重複実行しない。
- 成功済み生成の再送では、保存済み投稿案だけでなく同じPhoto First Metadataを返す。
- 解析、本文生成、品質検査、保存に失敗した場合は既存の失敗記録とAI利用記録を使用する。
- Photo Firstの失敗で、既存Mission、Weekly Plan、保存写真、Plan First本文を削除しない。
- 同じ写真でも新しい冪等キーによる明示的な作り直しでは再解析・再生成が起きる。写真内容hashによる解析cacheは未実装である。

## 8. セキュリティとプライバシー

- 認証済みMemberとsame-origin要求を必須にする。
- private bucket、署名付きUpload、非公開のサーバー読取を維持する。
- MIME、サイズ、画素数を制限する。
- 元画像をそのままProviderへ渡さず、回転補正・縮小・再符号化した画像を送る。
- OpenAI Responses APIの `store` は `false`。
- ProviderへStorage資格情報、署名URL、Workspace全体の資格情報を渡さない。
- 画像内Prompt Injectionを命令として扱わないSystem指示を付ける。
- V1の画像編集Promptはコピー専用で、自動編集や外部編集Providerへの送信はしない。

Provider側の保持、契約上の取扱い、本番データ処理条件は運用開始前に別途確認が必要である。

## 9. 実装状態

| 機能                                     | 状態                    | 備考                                                     |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------- |
| Webでの安全な写真保存                    | IMPLEMENTED             | 既存機能を再利用                                         |
| 本人・Service・Bunshin分離               | IMPLEMENTED             | HTTPと生成Serviceの双方で照合                            |
| 構造化Vision解析                         | IMPLEMENTED             | fake fetchによる契約テスト済み                           |
| Goal/企業/履歴を含む企画                 | IMPLEMENTED             | Context伝播テスト済み                                    |
| 投稿本文・CTA生成                        | IMPLEMENTED             | 既存投稿案Pipelineへ接続                                 |
| 投稿案の履歴保存                         | IMPLEMENTED             | MissionContentVariantへ保存                              |
| 解析・企画Metadataの永続化               | IMPLEMENTED             | 元写真・投稿案へtenant制約付きで保存し、再読込時に復元   |
| Mission未作成日のPhoto First開始         | IMPLEMENTED             | 今日の確定済みPlanとACTIVEプロフィールが必要             |
| 障壁サポートからの案内                   | IMPLEMENTED             | ハッシーのCONTENT・MEDIA・CONFIDENCE支援から既存欄へ接続 |
| Goal・企業・履歴の差分契約               | FIXTURE_VERIFIED        | 同一写真・外部通信なしの決定的fixtureで一軸ずつ検証      |
| 受理・不採用・結果の解析工程への直接入力 | PARTIAL                 | 既存Snapshot/本文生成Context経由。解析単体へ明細は未接続 |
| Goal/業種別の実生成品質                  | PRODUCTION_E2E_REQUIRED | 実API生成は未実施                                        |
| 実Storage・スマートフォン表示            | PRODUCTION_E2E_REQUIRED | 本番資格情報は未使用                                     |
| LINEへの写真送信で直接生成               | DEFERRED                | Web導線を採用                                            |
| 自動画像編集                             | DEFERRED                | Promptコピーのみ                                         |

## 10. 検証

対象テスト:

- `apps/web/test/openai-photo-first-analyzer.test.ts`
  - 構造化JSON Schema
  - `store=false`
  - 写真と企業・Goal・履歴Contextの送信
  - Goalだけを変えた場合の入力差
  - 事実性・センシティブ属性・Prompt Injection防止指示
- `apps/web/test/service-daily-actions.test.ts`
  - 認証済みService Scopeの伝播
  - same-origin拒否
- `apps/web/test/daily-action-storage-photo-first.test.ts`
  - private Storageからの読取
  - 長辺1600px以内への縮小
  - JPEG再符号化とOrientation Metadata除去
- `apps/web/test/mission-content-variant-ai-runtime-boundary.test.ts`
  - Photo First解析がAI Runtime境界内にあること
- `packages/capability-social/test/mission-content-variant.test.ts`
  - Metadataの正規化と上限超過拒否
- `packages/database/test/photo-first-metadata-repository.test.ts`
  - 投稿案との同一Transaction保存
  - 投稿案と元写真のWorkspace/Bunshin複合外部キー
- `apps/web/test/service-daily-action-boundary.test.ts`
  - 最新の保存済みPhoto First結果を再読込時に画面へ渡すこと
- `apps/web/test/photo-first-entry-states.test.tsx`
  - Missionあり、Missionなし・Planあり、Missionなし・Planなしの3状態を外部通信なしで描画
  - Planなしでは開始操作を出さず、スマートフォン画面に待機理由を表示
- `apps/web/test/activity-barrier-photo-first-guidance.test.tsx`
  - CONTENT、MEDIA、CONFIDENCEの受理済み支援から既存Photo First欄へ進めること
  - ハッシー以外と無関係な障壁支援には導線を表示しないこと
- `apps/web/test/photo-first-differential-fixtures.test.ts`
  - 同一の写真bytesを維持し、Goal、企業情報、直近履歴だけを一つずつ変更すること
  - テーマ、切り口、推奨理由、本文、写真案、CTAが一体として変わること
  - Photo First企画が既存本文生成Provider入力へ渡り、CTAだけの差し替えを禁止すること
  - fake Providerによる決定的contractテストであり、実Provider品質の証明ではないこと

実行結果、型検査、lintはPRの最新検証結果を正本とする。実OpenAI、実Storage、LINE、SNS投稿、本番DB、本番デプロイは実行していない。

## 11. 未解決事項と次の最小タスク

次の最小タスクは、合成写真・テスト専用企業情報・主要2 Goalに限定した実Providerの手動品質確認である。実行前に課金、送信素材、試行上限、保存先の承認を得て、同じrubricでテーマ、切り口、本文、写真案、CTAを人手評価する。fixture成功を実Provider品質や事業成果の証明として扱わない。
