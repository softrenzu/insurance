# Insurance Compare Engine v2

保険商品をWeb上で整理、絞り込み、横並び比較、料金試算するためのsource-available比較エンジンです。

## v2機能

- 動的な比較項目と最大3商品の横並び比較
- 年齢、希望保障額、商品別料金ルールによる試算
- CSV / JSON商品一括登録
- 企業テナント管理
- ブランド名、カラー、ロゴによるホワイトラベル
- 比較主体、情報源、利害関係、更新日の表示
- REST APIとiframe埋め込み
- 利用量、監査ログ
- Ed25519署名付き商用ライセンスキー
- Tenant ID、有効期限、サイト数、許可ドメインの検証
- `?admin=1` の管理画面

デモデータはすべて架空です。

## 起動

Node.js 20以上を使用します。

```bash
npm test
ADMIN_TOKEN=change-this-secret node server.js
```

比較画面: `http://localhost:3000/`

管理画面: `http://localhost:3000/?admin=1`

## API

```text
GET  /api/v1/health
GET  /api/v1/config?tenant=demo
GET  /api/v1/products?tenant=demo
POST /api/v1/simulate?tenant=demo
GET  /api/admin/state
POST /api/admin/tenants
POST /api/admin/products/import
POST /api/admin/licenses/generate
```

管理APIは `x-admin-token` と起動時の `ADMIN_TOKEN` が一致する場合だけ利用できます。

## CSV / JSON登録

CSV基本列:

```text
id,name,company,category,premium,coverage
```

その他のCSV列は比較用属性として保持します。JSONでは `attributes` と `pricing` に追加比較項目や料金計算ルールを設定できます。

## 埋め込み

```html
<iframe src="https://your-host.example/?tenant=customer1&embed=1" title="保険商品比較" width="100%" height="800" style="border:0"></iframe>
```

## 商用ライセンス

このリポジトリはOSI準拠のオープンソースではありません。非商用利用は `LICENSE.md`、企業・事業利用は `COMMERCIAL_USE.md` に従います。評価、PoC、デモ、開発、本番、保険比較・見積・試算サイト、SaaS、API、埋め込み、ホワイトラベル、OEM、SI等の事業利用には有償契約が必要です。

商用ライセンス、導入支援、保守: support@rooomtech.com

ライセンスキーはEd25519署名方式です。発行用秘密鍵はライセンス発行側だけで保管し、利用環境には検証用公開鍵を配置します。

## 保険比較サービスとしての設計

標準機能では自動的な商品推奨や順位付けを行いません。比較主体、情報源、利害関係、更新日を表示でき、保険料以外の保障条件も比較できます。実サービスでは運営者自身が適用法令、許認可、表示、個人情報保護等を確認してください。

`index1.html` と `index2.html` は2023年の旧式簡易計算ページです。v2は `index.html` を使用します。
