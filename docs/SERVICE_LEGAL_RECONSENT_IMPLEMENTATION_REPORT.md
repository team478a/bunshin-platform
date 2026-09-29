# Service法務文書の再同意導線 実装報告

日付: 2026-09-30。基準: main `54e77258`（PR #1020マージ後）。本番反映とは区別する。

## 1. 調査した内容

- #1020で最新版同意を利用・通知に要求するようになったが、既存ACTIVE参加者の画面には再同意操作がない。公開参加ページは「参加完了」と表示する。
- 再度参加申請を使うとMembership更新、紹介、登録メール、Program自動登録などの参加副作用が走り得るため、再同意には流用できない。
- 利用・通知は現在有効な公開文書を種別ごとに要求する。一方、公開参加フォーム/APIはTERMSとPRIVACYの最大2件に制限され、COMMERCE_DISCLOSURE公開時に参加と利用条件が一致しない。

## 2. 変更したファイル

- `packages/application/src/service-participation.ts`、`packages/database/src/service-participation*.ts`: 本人の現在版・同意済みIDの表示と、所属状態を変えない最新版再同意を追加。
- `apps/web/app/s/[serviceSlug]/legal-consent/*`、`apps/web/app/api/services/[serviceSlug]/legal-consent/route.ts`、`apps/web/src/http/service-participation.ts`、`apps/web/src/auth/line-return.ts`: 本人画面とsame-origin/認証/入力検証つきAPI、認証後の復帰先を追加。
- 参加フォーム、Serviceホーム、LINE設定画面: 3種類の文書を参加時に提示し、既存参加者へ再同意の入口を追加。
- Application/DB単体・隔離DB統合テスト、D-157、この報告と機能監査・Roadmap。

## 3. 主要な設計判断

- 旧版同意を履歴として残し、最新版への同意を追記する。Service/Workspace/本人ACTIVE所属をDBで再照合し、送信時の文書ID集合と完全一致しない場合は拒否する。非公開Serviceは既存参加者に限り同じ導線を提供する。
- 参加申請と再同意は別APIとする。再同意はMembership、承認、紹介、メール、Program、通知設定を変更しない。同じIDの再送は既存一意制約と`skipDuplicates`で冪等にする。
- 現行の利用判定と同じ公開文書3種を参加・再同意の対象とする。法務上の同意対象を再定義する場合は別判断が必要。

## 4. 実行した検証

- Application/DB単体で重複ID拒否、旧版拒否、本人・Service Scope、Membership不変、最新版表示を確認する。
- 隔離DBで公開3文書の初回参加、旧版のみとなった状態の利用/通知拒否、本人再同意後の回復を確認する。最終CI結果はPRに記録する。
- lint、format、typecheck、全体test/buildはPRのCIで検証する。

## 5. 未解決事項

- 本番データを閲覧・移行していない。旧版同意者の件数、再同意時の実端末表示、法務本文/同意対象の事業判断は別途確認する。
- LINE等で既存参加者へ一斉通知しない。本番リリースと本番データ修正も行わない。

## 6. 次へ進める条件

- PRの全CI・隔離DB成功、レビュー、マージ。リリース前に旧同意者の読み取り専用件数監査と再同意導線の実端末確認を行う。
