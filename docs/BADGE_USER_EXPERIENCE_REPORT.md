# バッジ利用者画面 実装報告

## 目的

利用者が、自分の獲得済みバッジ、挑戦中の進み具合、次のおすすめをスマートフォンで確認できるようにする。バッジとワタシポイントは別画面・別台帳のまま維持する。

## 実装範囲

- `/badges` に「もらったバッジ」「もう少しでもらえるバッジ」「次におすすめ」を表示
- 獲得理由、現在値、目標値、残り回数を表示
- 認証済みUser本人のWorkspace内データだけを返すAPI
- 獲得バッジの公開範囲を、本人が`PRIVATE`または所属中の`GROUP`から選択
- `BadgeAwardVisibility`を獲得記録から分離し、獲得履歴を変更せず公開設定だけ更新
- 下部ナビゲーションに「バッジ」を追加

## 安全境界

- 初期値は必ず`PRIVATE`
- `GROUP`は本人が現在ACTIVEで所属する、同一WorkspaceのACTIVE Groupだけ
- Group脱退・停止後は保存値が残っていても画面/API上の実効公開範囲を`PRIVATE`として扱う
- Group管理者やシステム管理者が本人の公開設定を強制変更するAPIは追加しない
- `PUBLIC`、ランキング、他User比較、AI品質評価、Point付与は対象外

## API

- `GET /api/workspaces/:workspaceId/badges`
- `PATCH /api/workspaces/:workspaceId/badges/:badgeAwardId/visibility`

更新APIは同一Origin、認証済みUser、Workspace所属、Award所有、Group所属をサーバー側で再検証する。

## 次の段階

B-4でGroup独自Badgeの下書き、SUPER_ADMIN承認、候補承認、監査を追加する。B-3の本人公開設定をGroup管理者機能へ流用して強制公開しない。
