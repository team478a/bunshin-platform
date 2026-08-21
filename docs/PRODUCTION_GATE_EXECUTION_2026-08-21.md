# FREE MVP Production Gate 実行記録 — 2026-08-21

## 対象

- Repository: `team478a/bunshin-platform`
- Production commit: `4bfaa0a87ec712f265136df7349a915ec9de50e8`
- Production URL: `https://bunshin-platform-web.vercel.app`
- 実行方針: Secret値・個人情報・生成本文を記録しない

## 確認済み

| 項目 | 結果 | 根拠 |
| --- | --- | --- |
| main CI | 成功 | GitHub Actions run `32442521627` |
| verify / database | 成功 | 同runの両job |
| Vercel Production | 成功 | GitHub deployment `6014707901` |
| Production commit | 一致 | deployment SHA `4bfaa0a...` |
| `/api/health/live` | HTTP 200 / `status: ok` | 2026-08-21確認 |
| `/api/health/ready` | HTTP 200 / configuration・database `ok` | 2026-08-21確認 |
| GitHub Production reviewer | 設定済み | Environment protection rule |
| GitHub DB secret名 | `DATABASE_URL` / `DIRECT_URL`あり | 値は取得していない |
| Vercel function region | `hnd1` | `apps/web/vercel.json` |
| AI timeout | Provider 45秒 / Function 60秒 | 実コードとVercel設定 |
| Production migration | 成功 | GitHub Actions run `32443354178` |
| migration status | 14件 / up to date | 同runの実行後status |
| migration後health | live・readyともHTTP 200 / database `ok` | 2026-08-21再確認 |

## 未完了・Blocker

1. Supabase dashboardでbackup保持期間、restore手順、接続方式、Auth Site URL / Redirect allowlistを人間確認する必要がある。
2. Vercel dashboardでProductionのOpenAI変数名、Spend Management、Production URLを人間確認する必要がある。
3. `FREE_MVP_SMOKE_TEST.md`の正常系・Isolation・mobileを実施する必要がある。

## 次の操作

Production migrationは完了した。次にSupabase / Vercelの設定確認と、Production Magic Linkを使う本番スモークテストを実施する。テストデータ作成、メール送信、実投稿記録を伴う操作は、対象アカウントとデータを確認してから行う。

## Migration実行結果

- Run: `https://github.com/team478a/bunshin-platform/actions/runs/32443354178`
- Head SHA: `4bfaa0a87ec712f265136df7349a915ec9de50e8`
- 実行前: 14件中12件が未適用
- 実行: 未適用12件を順番に適用
- 実行後: `Database schema is up to date!`
- 備考: 実行前statusのexit code 1は未適用migration検出による想定結果で、当該stepは`continue-on-error`。migration本体と実行後statusは成功した。
