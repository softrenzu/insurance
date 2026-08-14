'use strict';

const query = new URLSearchParams(location.search);
const adminMode = query.get('admin') === '1';
const publicRoot = document.getElementById('publicApp');
const adminRoot = document.getElementById('adminApp');
publicRoot.hidden = adminMode;
adminRoot.hidden = !adminMode;
adminMode ? startAdmin() : startPublic();

function node(root, id) { return root.querySelector('[id="' + id + '"]'); }
function yen(value) { return new Intl.NumberFormat('ja-JP').format(Number(value || 0)) + '円'; }
function text(parent, tag, value, className) {
  const el = document.createElement(tag);
  el.textContent = String(value ?? '-');
  if (className) el.className = className;
  parent.appendChild(el);
  return el;
}

function startPublic() {
  const tenantId = query.get('tenant') || 'demo';
  const embedded = query.get('embed') === '1';
  const selected = new Set();
  let tenant;
  let products = [];
  const $ = id => node(publicRoot, id);
  const fallbackTenant = {
    id: 'demo',
    brand: { brandName: 'Insurance Compare Engine', primaryColor: '#185adb', footerText: 'デモ環境 - 掲載データは架空です' },
    disclosure: { operator: 'デモ運営者', dataSource: '架空のサンプルデータ', relationship: '実在の保険会社との利害関係はありません', updatedAt: '2026-08-14' },
    fields: [
      { key: 'company', label: '会社', type: 'text' }, { key: 'category', label: '種類', type: 'text' },
      { key: 'premium', label: '月額保険料', type: 'yen' }, { key: 'coverage', label: '主契約保障額', type: 'yen' },
      { key: 'deductible', label: '免責・自己負担', type: 'text' }, { key: 'waitingPeriod', label: '待機期間', type: 'text' }
    ]
  };
  const fallbackProducts = [
    { id:'m1',name:'医療 Standard',company:'サンプル生命A',category:'医療',premium:2980,coverage:1000000,attributes:{deductible:'なし',waitingPeriod:'30日'} },
    { id:'m2',name:'医療 Light',company:'サンプル共済B',category:'医療',premium:1980,coverage:500000,attributes:{deductible:'5,000円',waitingPeriod:'30日'} },
    { id:'l1',name:'定期生命 1000',company:'サンプル生命C',category:'生命',premium:3480,coverage:10000000,attributes:{deductible:'-',waitingPeriod:'なし'} },
    { id:'c1',name:'がん Basic',company:'サンプル保険D',category:'がん',premium:2580,coverage:2000000,attributes:{deductible:'なし',waitingPeriod:'90日'} }
  ];
  const value = (p, key) => p[key] ?? p.attributes?.[key] ?? '-';
  const format = (v, type) => type === 'yen' ? yen(v) : type === 'number' ? new Intl.NumberFormat('ja-JP').format(Number(v || 0)) : String(v ?? '-');

  async function load() {
    try {
      const [configRes, productRes] = await Promise.all([
        fetch('/api/v1/config?tenant=' + encodeURIComponent(tenantId)),
        fetch('/api/v1/products?tenant=' + encodeURIComponent(tenantId))
      ]);
      if (!configRes.ok || !productRes.ok) throw new Error('api');
      tenant = (await configRes.json()).tenant;
      products = (await productRes.json()).products;
    } catch {
      if (tenantId !== 'demo') {
        $('errorBox').hidden = false;
        $('errorBox').textContent = 'このテナントを表示できません。商用ライセンスまたはサーバー設定を確認してください。';
        return;
      }
      tenant = fallbackTenant; products = fallbackProducts;
    }
    applyTenant(); buildCategories(); render();
  }
  function applyTenant() {
    document.documentElement.style.setProperty('--brand', tenant.brand?.primaryColor || '#185adb');
    $('brandName').textContent = tenant.brand?.brandName || tenant.name || 'Insurance Compare Engine';
    if (tenant.brand?.logoUrl) { $('brandLogo').src = tenant.brand.logoUrl; $('brandLogo').hidden = false; }
    $('footerText').textContent = tenant.brand?.footerText || 'Business and organizational use requires a paid commercial license.';
    ['operator','dataSource','relationship','updatedAt'].forEach(k => $(k).textContent = tenant.disclosure?.[k] || '-');
    if (embedded) { $('siteHeader').classList.add('compact'); $('siteFooter').hidden = true; }
  }
  function buildCategories() {
    [...new Set(products.map(p => p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')).forEach(c => {
      const option = document.createElement('option'); option.value = c; option.textContent = c; $('category').appendChild(option);
    });
  }
  function list() {
    const c = $('category').value, max = Number($('maxPremium').value || Number.MAX_SAFE_INTEGER), sort = $('sort').value;
    const rows = products.filter(p => (c === 'all' || p.category === c) && Number(p.premium || 0) <= max);
    rows.sort((a,b) => sort === 'premiumAsc' ? a.premium-b.premium : sort === 'coverageDesc' ? b.coverage-a.coverage : a.name.localeCompare(b.name,'ja'));
    return rows;
  }
  function render() {
    const root = $('products'); root.replaceChildren(); const rows = list();
    $('resultCount').textContent = rows.length; $('selectedCount').textContent = selected.size;
    rows.forEach(p => {
      const card = document.createElement('article'); card.className = 'product-card';
      text(card,'p',p.company,'company'); text(card,'h3',p.name); text(card,'p','登録月額: ' + yen(p.premium),'price');
      const facts = document.createElement('dl'); facts.className = 'facts';
      (tenant.fields || []).filter(f => !['company','premium'].includes(f.key)).forEach(f => { const row=document.createElement('div'); text(row,'dt',f.label); text(row,'dd',format(value(p,f.key),f.type)); facts.appendChild(row); });
      card.appendChild(facts);
      const actions=document.createElement('div'); actions.className='card-actions';
      const compare=document.createElement('button'); compare.className='compare-button'; compare.textContent=selected.has(p.id)?'比較から外す':'比較に追加'; compare.onclick=()=>toggle(p.id);
      const simulate=document.createElement('button'); simulate.className='secondary'; simulate.textContent='この条件で試算'; simulate.onclick=()=>simulateProduct(p);
      actions.append(compare,simulate); card.appendChild(actions); root.appendChild(card);
    });
    renderComparison();
  }
  function toggle(id) { if (selected.has(id)) selected.delete(id); else if (selected.size < 3) selected.add(id); else return alert('比較できる商品は3件までです。'); render(); }
  function renderComparison() {
    const items=products.filter(p=>selected.has(p.id)), table=$('comparisonTable'); table.replaceChildren(); $('comparisonSection').hidden=!items.length;
    [{key:'name',label:'商品名',type:'text'},...(tenant.fields||[])].forEach(f=>{const tr=document.createElement('tr');text(tr,'th',f.label);items.forEach(p=>text(tr,'td',format(value(p,f.key),f.type)));table.appendChild(tr);});
  }
  async function simulateProduct(p) {
    const age=Number($('age').value||40),coverage=Number($('desiredCoverage').value||p.coverage||0); let result;
    try { const res=await fetch('/api/v1/simulate?tenant='+encodeURIComponent(tenantId),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tenantId,productId:p.id,age,coverage})}); if(!res.ok)throw new Error('api'); result=await res.json(); }
    catch { result={productName:p.name,monthlyPremium:p.premium,assumptions:{age,coverage},note:'API未接続時の参考表示です。'}; }
    const root=$('simulationResult'); root.replaceChildren(); $('simulationSection').hidden=false; text(root,'h3',result.productName); text(root,'p','試算月額: '+yen(result.monthlyPremium),'simulation-price'); text(root,'p','前提: 年齢 '+age+'歳 / 保障額 '+yen(coverage)); text(root,'p',result.note,'muted');
  }
  ['category','maxPremium','sort'].forEach(id=>$(id).addEventListener('input',render));
  $('reset').onclick=()=>{$('category').value='all';$('maxPremium').value=10000;$('sort').value='nameAsc';$('age').value=40;$('desiredCoverage').value=1000000;render();};
  $('clearSelection').onclick=()=>{selected.clear();render();}; load();
}

function startAdmin() {
  const $ = id => node(adminRoot, id);
  const out = data => $('output').textContent = typeof data === 'string' ? data : JSON.stringify(data,null,2);
  const headers = () => ({ 'content-type':'application/json', 'x-admin-token':$('adminToken').value });
  async function api(path, options={}) { const res=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}}); const data=await res.json().catch(()=>({})); if(!res.ok)throw new Error(res.status+' '+JSON.stringify(data)); return data; }
  function csvLine(line) { const cells=[]; let cell='',quoted=false; for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){if(quoted&&line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){cells.push(cell);cell='';}else cell+=c;} cells.push(cell); return cells; }
  function parseCsv(raw) { const rows=raw.split(/\r?\n/).filter(Boolean).map(csvLine); const keys=rows.shift()||[]; return rows.map(values=>{const p={attributes:{}};keys.forEach((k,i)=>{const v=(values[i]||'').trim();if(['premium','coverage'].includes(k))p[k]=Number(v||0);else if(['id','name','company','category'].includes(k))p[k]=v;else p.attributes[k]=v;});return p;}); }
  function fill(t){ $('tenantId').value=t.id||'';$('tenantName').value=t.name||'';$('tenantPlan').value=t.plan||'commercial';$('siteLimit').value=t.siteLimit||1;$('domains').value=(t.allowedDomains||[]).join('\n');$('brandName').value=t.brand?.brandName||'';$('brandColor').value=t.brand?.primaryColor||'#185adb';$('logoUrl').value=t.brand?.logoUrl||'';$('operator').value=t.disclosure?.operator||'';$('dataSource').value=t.disclosure?.dataSource||'';$('relationship').value=t.disclosure?.relationship||'';$('fieldsJson').value=JSON.stringify(t.fields||[],null,2);$('importTenant').value=t.id;$('licenseTenant').value=t.id; }
  $('loadState').onclick=async()=>{try{const data=await api('/api/admin/state');out(data);fill(data.tenants.find(t=>t.id!=='demo')||data.tenants[0]||{});}catch(e){out(e.message);}};
  $('saveTenant').onclick=async()=>{try{const body={id:$('tenantId').value.trim(),name:$('tenantName').value.trim(),plan:$('tenantPlan').value,siteLimit:Number($('siteLimit').value||1),allowedDomains:$('domains').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),requiresCommercialLicense:true,brand:{brandName:$('brandName').value.trim(),primaryColor:$('brandColor').value.trim()||'#185adb',logoUrl:$('logoUrl').value.trim(),footerText:'Powered by Insurance Compare Engine'},disclosure:{operator:$('operator').value.trim(),dataSource:$('dataSource').value.trim(),relationship:$('relationship').value.trim(),updatedAt:new Date().toISOString().slice(0,10)},fields:JSON.parse($('fieldsJson').value)};out(await api('/api/admin/tenants',{method:'POST',body:JSON.stringify(body)}));}catch(e){out(e.message);}};
  $('importProducts').onclick=async()=>{try{const file=$('productFile').files[0];if(!file)throw new Error('ファイルを選択してください');const raw=await file.text();const parsed=file.name.toLowerCase().endsWith('.json')?JSON.parse(raw):parseCsv(raw);const products=Array.isArray(parsed)?parsed:parsed.products;if(!Array.isArray(products))throw new Error('商品配列を読み込めません');out(await api('/api/admin/products/import',{method:'POST',body:JSON.stringify({tenantId:$('importTenant').value.trim(),mode:$('importMode').value,products})}));}catch(e){out(e.message);}};
  $('generateLicense').onclick=async()=>{try{const date=$('expiresAt').value;out(await api('/api/admin/licenses/generate',{method:'POST',body:JSON.stringify({tenantId:$('licenseTenant').value.trim(),plan:'commercial',expiresAt:date?new Date(date+'T23:59:59+09:00').toISOString():null,siteLimit:Number($('licenseSites').value||1)})}));}catch(e){out(e.message);}};
}
