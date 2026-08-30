# Bunshin サービス分離 Core 実装報告

## 目的

既存の個人向けBunshinを壊さず、サービス（内部Group）内で作成するBunshinをサービス単位で分離できる永続化・認可境界を追加する。

## 実装範囲

- `Bunshin.groupId` をnullableで追加
- `workspaceId + groupId` によるGroup参照整合性をDBで保証
- サービス所属Bunshin作成時、作成者と所有者のACTIVE参加をサーバー側で検証
- サービス参加者だけが対象サービスのBunshinを一覧取得できるRepository APIを追加
- 既存の詳細・更新・停止操作は指定がなければ個人Bunshinだけを対象とし、サービス操作では明示的な `groupId` を必須にできる境界を追加
- 既存Bunshinは `groupId = null` の個人向けデータとして維持

## 分離ルール

- `groupId` は単独で信用せず、常に `workspaceId` と組み合わせる。
- 作成者または所有者が対象サービスのACTIVE参加者でなければ、サービス所属Bunshinを作成しない。
- サービス一覧は `workspaceId + groupId + actorUserId` を必須とし、ACTIVEなサービス参加を照合する。
- 他サービス、他Workspace、未参加ユーザーのBunshinは返さない。

## 段階移行

本PRではCoreのみを追加する。既存の個人向けAPI/UIは従来どおり `groupId = null` を扱うため、挙動を変更しない。

次PRでサービス専用Bunshin作成・一覧API/UIを接続し、その後、投稿人格・投稿計画・生成履歴のサービス境界を順に接続する。

## 非対象

- 既存Bunshinの自動移行
- サービス専用Bunshin UI
- サービスをまたぐBunshin移動・コピー
- 投稿履歴、ポイント、バッジのサービスホーム表示
