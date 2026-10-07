# OEM registration billing V2

Status: implementation review; production cutover is not authorized.
Baseline: `6400027cd0e041d1fe732b178aeb502546df5aff`.

## Decision

課金対象人数はWorkspace単位の `R ∪ A` とする。Rは有効なOEM契約期間と有料提供期間に重なる正式登録、Aは無料提供期間の既存対象利用。MAUは実利用指標として別に保持する。決済方式、価格、ログイン、学習開始日、現在の権限から登録・提供区分を推測しない。

正式登録・終了、提供区分、OEM契約期間は独立した履歴を保持する。招待は正式登録ではない。停止と登録終了は別操作。終了・再登録は履歴を追記し、管理者昇格で登録を消さない。既存イベントの一生一回のidempotency keyは再登録履歴として不十分なので新しい登録期間の正本を設ける。

Manaberuの商品ポリシーは内部識別子で保持し、OEM複製に継承する。FREE禁止はOEM提供に限り、直営内部Closed Pilotへ広げない。

全OEM共通の料金表をdraft/CAS編集・将来月publish・開始前cancelで管理する。published価格は不変。月初のusage monthで料金versionを選択する。人数上限と価格帯は別責務。

新ルール開始月は人間の将来月指定が必要。履歴準備確認がない組織はREVIEW_REQUIREDとして確定しない。旧確定月、旧請求書、旧PDFは書き換えない。新nullable列のNULLだけが旧MAU fallbackで、0は有効な新方式の人数である。

## Safety / rollout

実PostgreSQL試験で、既存`group_memberships_state_check`が、後から追加済みのSUSPENDED/PENDING_APPROVALを拒否する不整合を確認した。今回の停止中登録保持・承認待ち非課金の検証に必要なため、既存ACTIVEと同じ本人同意必須・取消なし条件で当該2状態を追加する。INVITED/DECLINED/REVOKEDの既存条件は維持し、正式登録は承認後のみ別台帳へ記録する。

additive migration、隔離PostgreSQL試験、shadow比較、人間による初期履歴確認、将来月cutoverを分離する。本番Migration、deploy、設定、実請求、決済、課金APIは今回実行しない。確定月のimmutable triggerは解除しない。終了契約の最終月請求と利用権は別。終了後の自動回収は追加しない。
