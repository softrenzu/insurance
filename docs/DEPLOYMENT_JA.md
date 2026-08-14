# デプロイと商用ライセンス運用

## 必要環境

- Node.js 20以上
- 永続化可能なデータ保存領域
- 本番ではHTTPS終端を行うリバースプロキシまたはロードバランサ

## 起動

```bash
npm test
ADMIN_TOKEN=十分に長いランダム値 node server.js
```

通常画面:

```text
http://localhost:3000/
```

管理画面:

```text
http://localhost:3000/?admin=1
```

## データ保存

初回起動時に `data/store.json` を元に `data/runtime.json` が作成されます。

本番ではリポジトリ外の永続ボリュームを指定してください。

```bash
DATA_FILE=/var/lib/insurance-compare/runtime.json node server.js
```

`data/runtime.json` には企業設定、商品情報、利用量、監査履歴が含まれるため、本番ではGitへコミットしないでください。

## ライセンス署名鍵

Ed25519鍵を使用します。秘密鍵は商用ライセンス発行側だけで保管し、顧客環境には公開鍵のみを配置します。

OpenSSL例:

```bash
openssl genpkey -algorithm ED25519 -out license_private.pem
openssl pkey -in license_private.pem -pubout -out license_public.pem
```

秘密鍵をGitHub、顧客サーバー、配布パッケージに含めないでください。

## ライセンス発行環境

```bash
ADMIN_TOKEN=発行管理用秘密値 \
LICENSE_SIGNING_PRIVATE_KEY_FILE=/secure/license_private.pem \
LICENSE_VERIFY_PUBLIC_KEY_FILE=/secure/license_public.pem \
node server.js
```

管理画面からTenant ID、有効期限、サイト数を指定してライセンスキーを発行できます。

## 顧客環境

単一テナント:

```bash
ADMIN_TOKEN=顧客管理用秘密値 \
LICENSE_VERIFY_PUBLIC_KEY_FILE=/app/license_public.pem \
COMMERCIAL_LICENSE_KEY=発行済みキー \
DATA_FILE=/var/lib/insurance-compare/runtime.json \
node server.js
```

複数テナントを同一サーバーで運用する場合:

```bash
COMMERCIAL_LICENSE_KEYS='{"tenant-a":"発行済みキーA","tenant-b":"発行済みキーB"}'
```

ライセンス検証ではTenant ID、有効期限、サイト上限、許可ドメインを確認します。

## 商品一括登録

管理画面でCSVまたはJSONファイルを選択します。

CSV基本列:

```text
id,name,company,category,premium,coverage
```

任意の追加列は比較属性として保持されます。JSONでは `pricing` に年齢帯、保障額増額単位、追加保険料等の計算ルールを持たせられます。

## 埋め込み

顧客Webサイトには次のように埋め込みます。

```html
<iframe
  src="https://compare.example.com/?tenant=tenant-a&embed=1"
  title="保険商品比較"
  width="100%"
  height="800"
  style="border:0">
</iframe>
```

企業テナントの `allowedDomains` と発行ライセンスの許可ドメインを一致させてください。

## REST API

公開側:

```text
GET  /api/v1/health
GET  /api/v1/config?tenant=TENANT_ID
GET  /api/v1/products?tenant=TENANT_ID
POST /api/v1/simulate?tenant=TENANT_ID
```

管理側:

```text
GET  /api/admin/state
POST /api/admin/tenants
POST /api/admin/products/import
POST /api/admin/licenses/generate
```

管理APIには `x-admin-token` ヘッダーが必要です。

## 本番化時の推奨追加対策

現在のv2は商用MVPです。本番規模に応じて、ファイル保存からPostgreSQL等への移行、管理者RBAC、SSO、多要素認証、秘密情報管理、監査ログ外部転送、バックアップ、WAF、レート制限、脆弱性診断、障害監視、個人情報を扱う場合の暗号化とアクセス制御を追加してください。
