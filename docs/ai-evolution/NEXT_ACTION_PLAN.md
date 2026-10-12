# 次に実施すべき開発・検証・運用準備

## 方針

新機能を増やす前に、既存成果を安全に利用できる証拠を揃える。未検証をバグと決めつけず、実受入で再現した利用不能点だけを小さく修正する。mainとproductionは別release系統のため、main全体を本番へ反映しない。

## 優先順位

| 優先度 | 作業                        | 種別            | 完了条件                                                                                                                |
| ------ | --------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| P0-1   | 本番安全条件の読取監査      | 運用準備        | 採用SHA、全Migration、schema、RLS/role、Backup/復旧、設定、価格/予算、停止担当を証拠化。UNKNOWNを残した対象は開始しない |
| P0-2   | マナベル開始前準備          | 運用準備        | 3Definitionを本番APPROVE→再GET/監査、対象Program停止、内部1〜2人Seat/Profile、Provider/Admission、STOP/drainを確認      |
| P0-3   | 少数の実縦フロー受入        | 検証            | ハッシー数社とマナベル内部1〜2人が実認証・スマホで完走し、越境なし、保存復元、誤合格なし、費用、停止を確認              |
| P0-4   | 発見した重大問題の修正      | 開発            | 認証、tenant分離、重複、データ損失、誤合格、予算超過、停止不能だけを再現テスト付き小PRで解消                            |
| P0-5   | OEM限定release設計          | 運用/検証       | #1176以降を一括せず、Migration lineage、初期履歴、shadow、cutover、旧請求非回帰を対象別にレビュー                       |
| P1-1   | ハッシー個別化品質受入      | 検証→必要時開発 | 企業、日付、不採用理由を1項目ずつ変え、実AI出力が意味のある差を示す。ランダム差では合格しない                           |
| P1-2   | マナベル再実践R3/R4         | 開発            | Approved題材Reader→本人明示のAssignment Bridge→本人UI→履歴比較。UNKNOWN/Privacy/版固定を維持                            |
| P1-3   | 初回UX・つまずき改善        | 検証→必要時開発 | 実利用者の離脱点に基づき、既存Profile/相談/Plan/Barrierを再利用して最小修正                                             |
| P1-4   | LINE学習通知                | 条件付き開発    | LINE通知を商品要件に含める場合のみ。対象、取消、重複、時間、停止、実配送を保証                                          |
| P2-1   | AI原価・請求照合            | 開発/運用       | Provider請求証拠と内部usageを照合し、UNKNOWN/OPEN/CONFLICT、OEM帰属限界を管理表示。人数請求と混ぜない                   |
| P2-2   | 候補モデル比較              | 検証            | 別承認の少量実API比較。品質、latency、token、費用、人間評価、切戻しを保存                                               |
| P2-3   | 100社容量試験               | 検証            | queue、同時数、DB、rate limit、retry、所要時間、30日原価、停止/復旧を隔離条件で測定                                     |
| P3     | 画像/音声/外部AI/高度自動化 | 将来            | 現在の実利用移行には不要。MVPのP0/P1を妨げない                                                                          |

## 最優先3項目

1. **本番安全条件を読取で確定する。**
2. **別承認後に少数の実利用者で両サービスを完走する。**
3. **実際に再現した利用不能点だけを修正する。**

OEM新課金のreleaseは上記と並行計画できるが、マナベル内部Pilot開始やハッシー少数受入へ不要に結合しない。実課金は独立承認とする。

## 受入シナリオ

### ハッシー

1. 同じ合成/許諾企業を基準に、企業情報だけを変える。
2. 同一企業で日付と直近28日履歴だけを変える。
3. 同一条件で具体的な不採用理由を追加する前後を比較する。
4. 主題、根拠、CTA、重複、創作、他社混入を人間評価する。
5. 採用と本人投稿を別操作し、投稿結果が次回へ反映されることを確認する。
6. LINE/スマホ、停止、Provider失敗、再試行、費用を記録する。

### マナベルスタイル

1. 「何を学ぶべきか不明」、CONTENT_REQUEST、CONSULTINGを含む相談を確認する。
2. Goal/Planの確認、3Definitionの順序と版固定、架空・非機密題材を確認する。
3. 不足回答、評価待ち、REVIEW/RETRY/BLOCKED/UNKNOWNを誤ってPASSにしない。
4. 本人が操作し、AIが完成品を代行しないことを観察する。
5. ログアウト/再ログイン、評価完了、次課題、First Success、STOPを確認する。
6. 再現性は未接続と表示し、課題合格だけで能力習得を保証しない。

## 証拠の最小形式

対象SHA、環境、設定版、匿名case/participant ID、期待、観測、PASS/FAIL/UNKNOWN、日時、実行者、費用、停止/復旧、未検証を記録する。秘密、顧客名、相談・回答・成果物本文は共有監査文書へ保存しない。

## 今回の再現コマンド

```powershell
pnpm test:ai-baseline
pnpm --filter @bunshin/capability-social test
pnpm --filter @bunshin/capability-training test
pnpm --filter web exec vitest run <Hassy・学習・承認・費用の選択テスト>
pnpm --filter @bunshin/application exec vitest run <原価・OEM・Admissionの選択テスト>
pnpm db:generate
pnpm --filter @bunshin/database exec vitest run <再現性・OEM schema・Admissionの選択テスト>
pnpm test:learning-ui
```

選択テスト1,041件、390×844の合成E2E 13件が成功。実API、実DB integration、負荷、実送信、実課金は未実施。

## 実利用へ移行できる境界

- ハッシー: P0安全条件と少数縦フローがPASSすれば限定利用へ移行。100社は容量・原価試験後。
- マナベル: 本番APPROVE、内部参加者/費用/停止Gateと実端末完走がPASSすれば内部Wave 0へ移行。一般提供・再現性保証はR3/R4と追加受入後。
- OEM: migration/初期履歴/shadow/cutover/旧請求非回帰を証拠化し、対象を限定したrelease後。請求・決済は別承認。

監査PR提出後は次の指示を待つ。自動merge、Deploy、本番操作へ進まない。
