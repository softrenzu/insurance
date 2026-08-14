'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const SAMPLE_DATA_FILE = path.join(ROOT, 'data', 'store.json');
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'runtime.json');
const PORT = Number(process.env.PORT || 3000);
const BODY_LIMIT = 2 * 1024 * 1024;
const PUBLIC_FILES = new Set(['/index.html','/app.js','/styles.css','/admin.html','/admin.js','/widget.js','/LICENSE.md','/COMMERCIAL_USE.md']);

function b64url(input) { return Buffer.from(input).toString('base64url'); }
function readKey(envName, fileEnvName) {
  if (process.env[fileEnvName]) return fs.readFileSync(process.env[fileEnvName], 'utf8');
  if (process.env[envName]) return process.env[envName].replace(/\\n/g, '\n');
  return '';
}
function signLicense(payload, privateKeyPem) {
  if (!privateKeyPem) throw new Error('license signing private key is required');
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.sign(null, Buffer.from(encoded), privateKeyPem).toString('base64url');
  return `${encoded}.${signature}`;
}
function verifyLicense(key, publicKeyPem, expectedTenantId) {
  if (!key || !publicKeyPem) return { valid: false, reason: 'missing_key_or_public_key' };
  const [encoded, signature] = String(key).split('.');
  if (!encoded || !signature) return { valid: false, reason: 'malformed' };
  let verified = false;
  try { verified = crypto.verify(null, Buffer.from(encoded), publicKeyPem, Buffer.from(signature, 'base64url')); }
  catch { return { valid: false, reason: 'invalid_public_key' }; }
  if (!verified) return { valid: false, reason: 'bad_signature' };
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { return { valid: false, reason: 'bad_payload' }; }
  if (payload.expiresAt && Date.parse(payload.expiresAt) < Date.now()) return { valid: false, reason: 'expired', payload };
  if (expectedTenantId && payload.tenantId !== expectedTenantId) return { valid: false, reason: 'tenant_mismatch', payload };
  return { valid: true, payload };
}
function calculatePremium(product, input = {}) {
  const pricing = product.pricing || {};
  const age = Number(input.age || 40);
  const desiredCoverage = Number(input.coverage || product.coverage || pricing.baseCoverage || 0);
  let premium = Number(pricing.basePremium ?? product.premium ?? 0);
  const baseCoverage = Number(pricing.baseCoverage ?? product.coverage ?? 0);
  const step = Number(pricing.coverageStep || 0);
  const perStep = Number(pricing.premiumPerStep || 0);
  if (step > 0 && desiredCoverage > baseCoverage) premium += Math.ceil((desiredCoverage - baseCoverage) / step) * perStep;
  const band = Array.isArray(pricing.ageBands) ? pricing.ageBands.find(x => age >= Number(x.min) && age <= Number(x.max)) : null;
  if (band) premium *= Number(band.multiplier || 1);
  const riderMap = pricing.riders || {};
  const riders = Array.isArray(input.riders) ? input.riders : [];
  for (const rider of riders) premium += Number(riderMap[rider] || 0);
  return { monthlyPremium: Math.round(premium), assumptions: { age, coverage: desiredCoverage, riders }, note: '表示額は登録された計算ルールによる試算です。実際の保険料・引受可否を保証しません。' };
}
function ensureStore() {
  if (!fs.existsSync(DATA_FILE)) { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); fs.copyFileSync(SAMPLE_DATA_FILE, DATA_FILE); }
}
function loadStore() { ensureStore(); return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveStore(store) {
  const tmp = `${DATA_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8'); fs.renameSync(tmp, DATA_FILE);
}
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
function text(res, status, body, contentType = 'text/plain; charset=utf-8') { res.writeHead(status, { 'content-type': contentType, 'x-content-type-options': 'nosniff' }); res.end(body); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > BODY_LIMIT) { reject(new Error('body_too_large')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid_json')); } });
    req.on('error', reject);
  });
}
function adminAuthorized(req) {
  const token = process.env.ADMIN_TOKEN; if (!token || !req.headers['x-admin-token']) return false;
  const supplied = Buffer.from(String(req.headers['x-admin-token'])); const expected = Buffer.from(token);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
function getTenant(store, tenantId) { return store.tenants.find(t => t.id === tenantId); }
function licenseForTenant(tenant) {
  if (!tenant?.requiresCommercialLicense) return { valid: true, demo: true };
  const publicKey = readKey('LICENSE_VERIFY_PUBLIC_KEY', 'LICENSE_VERIFY_PUBLIC_KEY_FILE');
  let licenseKey = process.env.COMMERCIAL_LICENSE_KEY || '';
  if (process.env.COMMERCIAL_LICENSE_KEYS) {
    try { licenseKey = JSON.parse(process.env.COMMERCIAL_LICENSE_KEYS)[tenant.id] || licenseKey; } catch { return { valid: false, reason: 'invalid_license_key_map' }; }
  }
  const result = verifyLicense(licenseKey, publicKey, tenant.id); if (!result.valid) return result;
  const siteLimit = Number(result.payload?.siteLimit || 1); const domains = tenant.allowedDomains || []; const licensedDomains = Array.isArray(result.payload?.domains) ? result.payload.domains : [];
  if (domains.length > siteLimit) return { valid: false, reason: 'site_limit_exceeded', payload: result.payload };
  if (licensedDomains.length && domains.some(d => !licensedDomains.includes(d))) return { valid: false, reason: 'domain_not_licensed', payload: result.payload };
  return result;
}
function incrementUsage(store, tenantId, metric) { store.usage[tenantId] ||= {}; store.usage[tenantId][metric] = Number(store.usage[tenantId][metric] || 0) + 1; }
function publicTenant(store, tenantId, res) {
  const tenant = getTenant(store, tenantId); if (!tenant) { json(res, 404, { error: 'tenant_not_found' }); return null; }
  const license = licenseForTenant(tenant); if (!license.valid) { json(res, 402, { error: 'commercial_license_required', reason: license.reason }); return null; } return tenant;
}
function serveFile(res, pathname) {
  const target = pathname === '/' ? '/index.html' : pathname; if (!PUBLIC_FILES.has(target)) return false;
  const file = path.join(ROOT, target.slice(1)); if (!fs.existsSync(file)) return false;
  const ext = path.extname(file); const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : ext === '.css' ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8';
  text(res, 200, fs.readFileSync(file, 'utf8'), type); return true;
}
async function handleApi(req, res, url) {
  const store = loadStore(); const tenantId = url.searchParams.get('tenant') || 'demo';
  if (req.method === 'GET' && url.pathname === '/api/v1/health') return json(res, 200, { ok: true, version: '2.0.0' });
  if (req.method === 'GET' && url.pathname === '/api/v1/config') {
    const tenant = publicTenant(store, tenantId, res); if (!tenant) return; incrementUsage(store, tenantId, 'configRequests'); saveStore(store);
    return json(res, 200, { tenant: { id: tenant.id, name: tenant.name, brand: tenant.brand, disclosure: tenant.disclosure, fields: tenant.fields } });
  }
  if (req.method === 'GET' && url.pathname === '/api/v1/products') {
    const tenant = publicTenant(store, tenantId, res); if (!tenant) return; incrementUsage(store, tenantId, 'productRequests'); saveStore(store);
    return json(res, 200, { products: store.products.filter(p => p.tenantId === tenantId) });
  }
  if (req.method === 'POST' && url.pathname === '/api/v1/simulate') {
    const body = await readBody(req); const id = body.tenantId || tenantId; const tenant = publicTenant(store, id, res); if (!tenant) return;
    const product = store.products.find(p => p.tenantId === id && p.id === body.productId); if (!product) return json(res, 404, { error: 'product_not_found' });
    incrementUsage(store, id, 'simulations'); saveStore(store); return json(res, 200, { productId: product.id, productName: product.name, ...calculatePremium(product, body) });
  }
  if (url.pathname.startsWith('/api/admin/')) {
    if (!adminAuthorized(req)) return json(res, 401, { error: 'admin_token_required' });
    if (req.method === 'GET' && url.pathname === '/api/admin/state') return json(res, 200, { tenants: store.tenants, products: store.products, usage: store.usage, audit: store.audit.slice(-100) });
    if (req.method === 'POST' && url.pathname === '/api/admin/tenants') {
      const body = await readBody(req); if (!body.id || !/^[a-z0-9_-]{2,50}$/i.test(body.id)) return json(res, 400, { error: 'invalid_tenant_id' });
      const idx = store.tenants.findIndex(t => t.id === body.id); const tenant = { id: body.id, name: body.name || body.id, plan: body.plan || 'commercial', siteLimit: Math.max(1, Number(body.siteLimit || 1)), allowedDomains: Array.isArray(body.allowedDomains) ? body.allowedDomains : [], requiresCommercialLicense: body.id === 'demo' ? false : body.requiresCommercialLicense !== false, brand: body.brand || { brandName: body.name || body.id, primaryColor: '#185adb', logoUrl: '', footerText: '' }, disclosure: body.disclosure || {}, fields: Array.isArray(body.fields) ? body.fields : [] };
      if (idx >= 0) store.tenants[idx] = tenant; else store.tenants.push(tenant); store.audit.push({ at: new Date().toISOString(), action: idx >= 0 ? 'tenant.update' : 'tenant.create', tenantId: tenant.id }); saveStore(store); return json(res, 200, { tenant });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/products/import') {
      const body = await readBody(req); if (!getTenant(store, body.tenantId)) return json(res, 404, { error: 'tenant_not_found' }); if (!Array.isArray(body.products)) return json(res, 400, { error: 'products_array_required' });
      const normalized = body.products.map((p, i) => ({ tenantId: body.tenantId, id: String(p.id || `product-${Date.now()}-${i}`), name: String(p.name || '名称未設定'), company: String(p.company || ''), category: String(p.category || ''), premium: Number(p.premium || 0), coverage: Number(p.coverage || 0), attributes: p.attributes && typeof p.attributes === 'object' ? p.attributes : {}, pricing: p.pricing && typeof p.pricing === 'object' ? p.pricing : { basePremium: Number(p.premium || 0), baseCoverage: Number(p.coverage || 0) } }));
      if (body.mode === 'replace') store.products = store.products.filter(p => p.tenantId !== body.tenantId); const existing = new Map(store.products.filter(p => p.tenantId === body.tenantId).map(p => [p.id, p])); for (const product of normalized) existing.set(product.id, product); store.products = store.products.filter(p => p.tenantId !== body.tenantId).concat([...existing.values()]); store.audit.push({ at: new Date().toISOString(), action: 'products.import', tenantId: body.tenantId, count: normalized.length, mode: body.mode || 'upsert' }); saveStore(store); return json(res, 200, { imported: normalized.length, total: existing.size });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/licenses/generate') {
      const body = await readBody(req); const privateKey = readKey('LICENSE_SIGNING_PRIVATE_KEY', 'LICENSE_SIGNING_PRIVATE_KEY_FILE'); if (!privateKey) return json(res, 503, { error: 'signing_disabled' }); const licensedTenant = getTenant(store, body.tenantId); if (!licensedTenant) return json(res, 404, { error: 'tenant_not_found' });
      const payload = { tenantId: body.tenantId, plan: body.plan || 'commercial', issuedAt: new Date().toISOString(), expiresAt: body.expiresAt || null, siteLimit: Math.max(1, Number(body.siteLimit || 1)), domains: Array.isArray(body.domains) ? body.domains : (licensedTenant.allowedDomains || []), features: Array.isArray(body.features) ? body.features : ['comparison','simulation','widget','api','whiteLabel'] };
      const key = signLicense(payload, privateKey); store.audit.push({ at: new Date().toISOString(), action: 'license.generate', tenantId: body.tenantId, expiresAt: payload.expiresAt }); saveStore(store); return json(res, 200, { key, payload });
    }
    return json(res, 404, { error: 'admin_endpoint_not_found' });
  }
  return json(res, 404, { error: 'endpoint_not_found' });
}
function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); res.setHeader('referrer-policy', 'same-origin');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const store = loadStore(); const tenant = getTenant(store, url.searchParams.get('tenant') || 'demo'); const allowed = (tenant?.allowedDomains || []).map(d => d === 'localhost' ? 'http://localhost:*' : `https://${d}`); const frameAncestors = allowed.length ? allowed.join(' ') : "'self'"; res.setHeader('content-security-policy', `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors ${frameAncestors}`);
      } else res.setHeader('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'");
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url); if (serveFile(res, url.pathname)) return; json(res, 404, { error: 'not_found' });
    } catch (error) { console.error(error); json(res, error.message === 'body_too_large' ? 413 : 400, { error: error.message || 'request_failed' }); }
  });
  server.listen(PORT, () => console.log(`Insurance Compare Engine listening on http://localhost:${PORT}`)); return server;
}
if (require.main === module) startServer();
module.exports = { signLicense, verifyLicense, calculatePremium, startServer };
