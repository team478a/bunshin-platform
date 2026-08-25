# グループ発信 G5 実装報告

## 1. 完了したゴール

本人が参加を承認したCampaignを、週間計画、今日の企画、Web表示、LINE通知へ安全につないだ。通常投稿を維持しながら商品関連投稿の量を制御し、参加条件が失われた後の生成・通知を停止する。

## 2. 投稿分類と比率

- `ORGANIC`: 通常投稿。Campaignを参照しない。
- `PRODUCT_RELATED`: 商品に関連する投稿。Campaignを参照する。
- `ADVERTISEMENT`: 商品を直接紹介する投稿。Campaignを参照する。

Campaignは週間の商品関連上限、広告上限、投稿間のクールダウン日数を持つ。Weekly Plannerへ制約を伝えるだけでなく、生成結果をApplication層で再検査し、違反する計画を保存しない。DBにもCampaign参照と分類の整合制約を置く。

## 3. 生成Context

次の条件をすべて満たすCampaignだけを利用する。

- 本人所有のPersonal Workspace／Bunshinである
- Group Membershipが有効で、参加同意がある
- Campaign Participationが本人・対象Bunshinで`ACCEPTED`である
- Campaignが対象期間に`OPEN`である
- Product Pack Versionが`PUBLISHED`である
- Product Pack Assignmentが対象Bunshinで有効である

生成にはVersion固定した公式事実、商品ルール、Campaign指定素材だけを渡す。他ユーザーのMemory、Knowledge、Mission本文は渡さない。

## 4. 広告安全Gate

CampaignのDaily Missionは保存前にG3の決定的Gateを通す。分類、公式事実、必須表示、本人Evidenceを確認し、不合格ならMissionを保存しない。合格後はMissionへ紐づく監査記録を追記する。

## 5. WebとLINE

週間計画と今日の企画には、通常投稿、商品に関連する投稿、商品を紹介する投稿を日本語で表示する。LINE通知はCampaign名と分類だけを安全に要約し、詳しい内容はログイン後のWeb画面で確認させる。

参加撤回、Group退出、商品割当解除、Campaign終了は、Daily Mission保存時とLINE送信直前にも再検証する。過去データは監査のため保持するが、新規生成と通知には利用しない。

## 6. Isolation Test

Workspace、User、Bunshin、Group Membership、Campaign Participation、Product Pack Assignmentを複合条件で検査する。別Workspace、別User、別Bunshin、未同意、未参加、撤回済み、未公開Version、解除済みAssignmentは生成Contextへ入らない。

## 7. 対象外

SNS自動投稿、グループ内の類似投稿検査、利用制限、KPI画面、人格の自動学習、報酬、ランキング、課金は実装していない。次のゴールはG6の安全検証である。
