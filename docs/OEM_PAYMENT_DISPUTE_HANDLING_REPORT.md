# OEM決済 異議申立て・チャージバック対応

## 目的

Stripeで入金後に異議申立てが発生した際、OEM運営団体の売上と購入者のProgram利用状態を一致させる。返金と異議申立ては別の状態と金額で記録する。

## 実装内容

- `charge.dispute.created` / `updated` で購入を `DISPUTED` とし、対応する有料Program Enrollmentだけを一時停止する。
- `charge.dispute.closed` が `won` または `warning_closed` なら購入を `PAID` へ戻し、異議申立て前のEnrollment状態を復元する。利用期限済みなら `EXPIRED` とする。
- `lost` なら購入を `CHARGEBACK_LOST` とし、Enrollmentを `CANCELLED` のまま保つ。
- Workspace、Payment Configuration、Payment Intent、金額、通貨、実行環境をすべてサーバー側で照合する。
- Webhook Event IDによる冪等性を維持し、解決済みの異議申立てが遅延イベントで再開しないよう防ぐ。
- 係争額を返金額と分けて保存し、運営画面とCSVの差引売上から除外する。
- `PAYMENT_DISPUTED` / `PAYMENT_DISPUTE_WON` / `PAYMENT_CHARGEBACK_LOST` をProgram Action Eventへ追記する。

## Stripe設定

Webhook Endpointで従来のイベントに加え、次を有効にする。

- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`

Stripeは `charge.dispute.closed` で `lost` / `warning_closed` / `won` を通知する。システムは `funds_withdrawn` / `funds_reinstated` も受信可能だが、運用上の必須登録は上記3イベントとする。

## 本番確認

1. Stripe test modeで異議申立てイベントを送信する。
2. 運営画面の状態、係争額、差引売上、購入者の利用停止を確認する。
3. `won` で利用復旧、`lost` で取消継続を確認する。
4. 同じEventの再送と開始・解決イベントの順序入れ替えで重複・逆戻りがないことを確認する。

## 参考

- https://docs.stripe.com/api/events/types
- https://docs.stripe.com/api/disputes/object
