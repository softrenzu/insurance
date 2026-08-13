const products = [
  { id: 'm1', name: '医療 Standard', company: 'サンプル生命A', category: 'medical', premium: 2980, coverage: 1000000 },
  { id: 'm2', name: '医療 Light', company: 'サンプル共済B', category: 'medical', premium: 1980, coverage: 500000 },
  { id: 'l1', name: '定期生命 1000', company: 'サンプル生命C', category: 'life', premium: 3480, coverage: 10000000 },
  { id: 'l2', name: '定期生命 2000', company: 'サンプル生命D', category: 'life', premium: 5980, coverage: 20000000 },
  { id: 'c1', name: 'がん Basic', company: 'サンプル保険E', category: 'cancer', premium: 2580, coverage: 2000000 },
  { id: 'c2', name: 'がん Plus', company: 'サンプル保険F', category: 'cancer', premium: 4580, coverage: 3000000 }
];

const selected = new Set();
const categoryNames = { medical: '医療', life: '生命', cancer: 'がん' };
const byId = id => document.getElementById(id);
const yen = value => new Intl.NumberFormat('ja-JP').format(value) + '円';

function addText(parent, tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.appendChild(node);
  return node;
}

function visibleProducts() {
  const category = byId('category').value;
  const maxPremium = Number(byId('maxPremium').value || 100000000);
  const sort = byId('sort').value;
  const list = products.filter(product =>
    (category === 'all' || product.category === category) && product.premium <= maxPremium
  );
  list.sort((a, b) => {
    if (sort === 'coverageDesc') return b.coverage - a.coverage;
    if (sort === 'nameAsc') return a.name.localeCompare(b.name, 'ja');
    return a.premium - b.premium;
  });
  return list;
}

function renderProducts() {
  const root = byId('products');
  root.replaceChildren();
  const list = visibleProducts();
  byId('resultCount').textContent = String(list.length);
  byId('selectedCount').textContent = String(selected.size);

  if (!list.length) {
    addText(root, 'p', '条件に一致する商品がありません。');
  }

  for (const product of list) {
    const card = document.createElement('article');
    card.className = 'product-card';
    addText(card, 'h3', product.name);
    addText(card, 'p', product.company);
    addText(card, 'p', '種類: ' + categoryNames[product.category]);
    addText(card, 'p', '月額保険料: ' + yen(product.premium));
    addText(card, 'p', '主契約保障額: ' + yen(product.coverage));

    const button = document.createElement('button');
    button.className = 'compare-button';
    button.textContent = selected.has(product.id) ? '比較から外す' : '比較に追加';
    button.setAttribute('aria-pressed', String(selected.has(product.id)));
    button.addEventListener('click', () => toggleProduct(product.id));
    card.appendChild(button);
    root.appendChild(card);
  }
  renderComparison();
}

function toggleProduct(id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else if (selected.size < 3) {
    selected.add(id);
  } else {
    window.alert('比較できる商品は3件までです。');
    return;
  }
  renderProducts();
}

function renderComparison() {
  const section = byId('comparisonSection');
  const table = byId('comparisonTable');
  table.replaceChildren();
  const items = products.filter(product => selected.has(product.id));
  section.hidden = items.length === 0;
  if (!items.length) return;

  const rows = [
    ['商品名', item => item.name],
    ['会社', item => item.company],
    ['種類', item => categoryNames[item.category]],
    ['月額保険料', item => yen(item.premium)],
    ['主契約保障額', item => yen(item.coverage)]
  ];

  for (const [label, value] of rows) {
    const row = document.createElement('tr');
    addText(row, 'th', label);
    for (const item of items) addText(row, 'td', value(item));
    table.appendChild(row);
  }
}

['category', 'maxPremium', 'sort'].forEach(id => byId(id).addEventListener('input', renderProducts));
byId('reset').addEventListener('click', () => {
  byId('category').value = 'all';
  byId('maxPremium').value = '10000';
  byId('sort').value = 'premiumAsc';
  renderProducts();
});
byId('clearSelection').addEventListener('click', () => {
  selected.clear();
  renderProducts();
});

renderProducts();
