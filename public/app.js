const API = '';
let products = [];
let customers = [];
let currentViewInvoiceId = null;
let billType = 'gst';
let currentBrand = 'pushp';

// ── Auth ──
function getToken() { return sessionStorage.getItem('token'); }

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}

async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  if (!username || !password) { errEl.textContent = 'Enter username and password'; errEl.style.display = 'block'; return; }
  try {
    const res = await fetch(API + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
    sessionStorage.setItem('token', data.token);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('brandScreen').style.display = 'flex';
    document.getElementById('billTypeScreen').style.display = 'none';
    document.getElementById('appContent').style.display = 'none';
  } catch (e) {
    errEl.textContent = 'Connection error'; errEl.style.display = 'block';
  }
}

function selectBrand(brand) {
  currentBrand = brand;
  document.getElementById('brandScreen').style.display = 'none';
  document.getElementById('billTypeScreen').style.display = 'flex';
}

function switchBrand() {
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('billTypeScreen').style.display = 'none';
  document.getElementById('brandScreen').style.display = 'flex';
}

function doLogout() {
  sessionStorage.removeItem('token');
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('billTypeScreen').style.display = 'none';
  document.getElementById('brandScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPass').value = '';
}

function selectBillType(type) {
  billType = type;
  document.getElementById('billTypeScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  document.getElementById('billTypeBadge').textContent = type === 'gst' ? 'GST' : 'Non-GST';
  document.getElementById('brandBadge').textContent = currentBrand === 'pushp' ? '🌶️ Pushp' : '☕ Sapat';
  // Show/hide GST fields
  document.querySelectorAll('.gst-only').forEach(el => {
    el.style.display = type === 'gst' ? 'flex' : 'none';
  });
  initApp();
}

function switchBillType() {
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('billTypeScreen').style.display = 'flex';
}

async function initApp() {
  await Promise.all([loadProducts(), loadCustomers()]);
  await initInvoice();
  document.getElementById('itemsBody').innerHTML = '';
  addItemRow();
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (getToken()) {
    // Try to use existing token
    fetch(API + '/api/invoices/next-number', { headers: authHeaders() })
      .then(r => { if (r.ok) { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; document.getElementById('brandScreen').style.display = 'flex'; } else { doLogout(); } })
      .catch(() => doLogout());
  }
});

// ── Navigation ──
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('section-' + name).style.display = 'block';
  document.getElementById('nav-' + name).classList.add('active');
  if (name === 'history') { populateFilterCustomer(); loadInvoices(); }
  if (name === 'products') renderProductsList();
  if (name === 'customers') renderCustomersList();
  if (name === 'stock') { renderStockList(); loadStockLog(); }
  if (name === 'balances') loadBalances();
  if (name === 'unpaid') loadUnpaidReport();
  if (name === 'reports') initReport();
  if (name === 'analytics') initAnalytics();
}

// ── Partial Payment Toggle ──
function toggleAmountPaid() {
  const mode = document.getElementById('paymentMode').value;
  document.getElementById('amountPaidRow').style.display = mode === 'partial' ? 'flex' : 'none';
  if (mode !== 'partial') document.getElementById('amountPaid').value = '';
}

// ── Products ──
async function loadProducts() {
  products = await apiFetch('/api/products?brand=' + currentBrand).then(r => r.json());
}

function renderProductsList() {
  const tbody = document.getElementById('productsList');
  tbody.innerHTML = products.map(p => `
    <tr>
      <td>${esc(p.name)}</td><td>${esc(p.hsn_code)}</td><td>${esc(p.packaging)}</td><td>${p.price.toFixed(2)}</td>

      <td>
        <button class="btn-sm" onclick="editProduct(${p.id})">✏️</button>
        <button class="btn-remove" onclick="deleteProduct(${p.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function showAddProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('editProductId').value = '';
  document.getElementById('prodName').value = '';
  document.getElementById('prodHsn').value = '';
  document.getElementById('prodPkg').value = '';
  document.getElementById('prodPrice').value = '';
  document.getElementById('productModal').style.display = 'flex';
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('editProductId').value = id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodHsn').value = p.hsn_code;
  document.getElementById('prodPkg').value = p.packaging;
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('productModal').style.display = 'flex';
}

async function saveProduct() {
  const id = document.getElementById('editProductId').value;
  const data = {
    name: document.getElementById('prodName').value.trim(),
    hsn_code: document.getElementById('prodHsn').value.trim(),
    packaging: document.getElementById('prodPkg').value.trim(),
    price: parseFloat(document.getElementById('prodPrice').value)
  };
  if (!data.name || !data.hsn_code || !data.packaging || isNaN(data.price)) return alert('Fill all fields');
  if (id) await apiFetch('/api/products/' + id, { method: 'PUT', body: JSON.stringify(data) });
  else await apiFetch('/api/products', { method: 'POST', body: JSON.stringify({ ...data, brand: currentBrand }) });
  await loadProducts();
  renderProductsList();
  closeModal('productModal');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  await apiFetch('/api/products/' + id, { method: 'DELETE' });
  await loadProducts();
  renderProductsList();
}

// ── Customers ──
async function loadCustomers() {
  customers = await apiFetch('/api/customers').then(r => r.json());
  populateCustomerSelect();
}

function populateCustomerSelect() {
  const sel = document.getElementById('customerSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Customer --</option>' +
      customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  }
  // Custom searchable customer dropdown
  const custList = document.getElementById('customerItemsList');
  if (custList) {
    custList.innerHTML = customers.map(c =>
      `<div class="custom-select-item" data-id="${c.id}" data-label="${esc(c.name)}" onclick="pickCustomerItem(this)">${esc(c.name)}</div>`
    ).join('');
  }
}

function pickCustomerItem(item) {
  const wrap = item.closest('.custom-select-wrap');
  wrap.querySelector('.custom-select-trigger').textContent = item.dataset.label;
  wrap.querySelector('#customerSelectHidden').value = item.dataset.id;
  wrap.querySelector('.custom-select-panel').style.display = 'none';
  // Sync native select for compatibility
  const nativeSel = document.getElementById('customerSelect');
  if (nativeSel) { nativeSel.value = item.dataset.id; onCustomerChange(); }
}

function populateFilterCustomer() {
  const sel = document.getElementById('filterCustomer');
  sel.innerHTML = '<option value="">All</option>' +
    customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}

function onCustomerChange() {
  const id = parseInt(document.getElementById('customerSelect').value);
  const c = customers.find(x => x.id === id);
  const det = document.getElementById('customerDetails');
  if (c) {
    document.getElementById('custAddr').textContent = c.address || '-';
    document.getElementById('custMob').textContent = c.mob_no || '-';
    document.getElementById('custGst').textContent = c.gst_no || '-';
    det.style.display = 'block';
  } else {
    det.style.display = 'none';
  }
}

function renderCustomersList() {
  const tbody = document.getElementById('customersList');
  tbody.innerHTML = customers.map(c => `
    <tr>
      <td>${esc(c.name)}</td><td>${esc(c.address)}</td><td>${esc(c.mob_no)}</td><td>${esc(c.gst_no)}</td>
      <td>
        <button class="btn-sm" onclick="editCustomer(${c.id})">✏️</button>
        <button class="btn-remove" onclick="deleteCustomer(${c.id})">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function showAddCustomerModal() {
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  document.getElementById('editCustomerId').value = '';
  document.getElementById('custName').value = '';
  document.getElementById('custAddress').value = '';
  document.getElementById('custMobNo').value = '';
  document.getElementById('custGstNo').value = '';
  document.getElementById('customerModal').style.display = 'flex';
}

function editCustomer(id) {
  const c = customers.find(x => x.id === id);
  document.getElementById('customerModalTitle').textContent = 'Edit Customer';
  document.getElementById('editCustomerId').value = id;
  document.getElementById('custName').value = c.name;
  document.getElementById('custAddress').value = c.address;
  document.getElementById('custMobNo').value = c.mob_no;
  document.getElementById('custGstNo').value = c.gst_no;
  document.getElementById('customerModal').style.display = 'flex';
}

async function saveCustomer() {
  const id = document.getElementById('editCustomerId').value;
  const data = {
    name: document.getElementById('custName').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    mob_no: document.getElementById('custMobNo').value.trim(),
    gst_no: document.getElementById('custGstNo').value.trim()
  };
  if (!data.name) return alert('Customer name required');
  if (id) await apiFetch('/api/customers/' + id, { method: 'PUT', body: JSON.stringify(data) });
  else await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(data) });
  await loadCustomers();
  renderCustomersList();
  closeModal('customerModal');
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;
  await apiFetch('/api/customers/' + id, { method: 'DELETE' });
  await loadCustomers();
  renderCustomersList();
}

// ── Invoice ──
async function initInvoice() {
  const { next_no } = await apiFetch('/api/invoices/next-number?brand=' + currentBrand).then(r => r.json());
  document.getElementById('invoiceNo').value = next_no;
  document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
}

function addItemRow() {
  const tbody = document.getElementById('itemsBody');
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${idx}</td>
    <td class="product-cell">
      <div class="custom-select-wrap" data-type="product">
        <div class="custom-select-trigger" onclick="openCustomSelect(this)">-- Select --</div>
        <input type="hidden" class="product-id-hidden">
        <div class="custom-select-panel" style="display:none">
          <input type="text" class="custom-select-search" placeholder="🔍 Search item..." autocomplete="off" oninput="filterCustomSelect(this)">
          <div class="custom-select-list">
            ${products.map(p => `<div class="custom-select-item" data-id="${p.id}" data-label="${esc(p.name)} (${esc(p.packaging)})" onclick="pickProductItem(this)">${esc(p.name)} <span class="pkg-tag">${esc(p.packaging)}</span></div>`).join('')}
          </div>
        </div>
      </div>
    </td>
    <td class="hsn"></td>
    <td class="pkg"></td>
    <td><input type="number" value="1" min="1" onchange="calcRow(this)" oninput="calcRow(this)"></td>
    <td><input type="number" step="0.01" value="0" onchange="calcRow(this)" oninput="calcRow(this)" class="rate"></td>
    <td class="amt">0.00</td>
    <td><button class="btn-remove" onclick="this.closest('tr').remove(); recalcAll();">✕</button></td>
  `;
  tbody.appendChild(tr);
}

function openCustomSelect(trigger) {
  // Close any other open panels first
  document.querySelectorAll('.custom-select-panel').forEach(p => {
    if (p !== trigger.nextElementSibling.nextElementSibling && p !== trigger.nextElementSibling) p.style.display = 'none';
  });
  const wrap = trigger.closest('.custom-select-wrap');
  const panel = wrap.querySelector('.custom-select-panel');
  const isOpen = panel.style.display !== 'none';
  // Close all panels
  document.querySelectorAll('.custom-select-panel').forEach(p => p.style.display = 'none');
  if (!isOpen) {
    panel.style.display = 'block';
    const searchInput = panel.querySelector('.custom-select-search');
    searchInput.value = '';
    filterCustomSelect(searchInput);
    searchInput.focus();
  }
}

function filterCustomSelect(searchInput) {
  const panel = searchInput.closest('.custom-select-panel');
  const list = panel.querySelector('.custom-select-list');
  const query = searchInput.value.trim().toLowerCase();
  Array.from(list.children).forEach(item => {
    const label = item.dataset.label ? item.dataset.label.toLowerCase() : item.textContent.toLowerCase();
    item.style.display = query === '' || label.includes(query) ? '' : 'none';
  });
}

function pickProductItem(item) {
  const wrap = item.closest('.custom-select-wrap');
  const label = item.dataset.label;
  const productId = parseInt(item.dataset.id);
  wrap.querySelector('.custom-select-trigger').textContent = label;
  wrap.querySelector('.product-id-hidden').value = productId;
  wrap.querySelector('.custom-select-panel').style.display = 'none';
  const tr = wrap.closest('tr');
  const p = products.find(x => x.id === productId);
  if (p) {
    tr.querySelector('.hsn').textContent = p.hsn_code;
    tr.querySelector('.pkg').textContent = p.packaging;
    tr.querySelector('.rate').value = p.price.toFixed(2);
    calcRow(tr.querySelector('.rate'));
  }
}

// Close custom selects when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.custom-select-wrap')) {
    document.querySelectorAll('.custom-select-panel').forEach(p => p.style.display = 'none');
  }
});

function calcRow(el) {
  const tr = el.closest('tr');
  const qty = parseInt(tr.querySelector('input[type="number"]').value) || 0;
  const rate = parseFloat(tr.querySelector('.rate').value) || 0;
  const amt = qty * rate;
  tr.querySelector('.amt').textContent = amt.toFixed(2);
  recalcAll();
}

function recalcAll() {
  let subtotal = 0;
  document.querySelectorAll('#itemsBody tr').forEach(tr => {
    subtotal += parseFloat(tr.querySelector('.amt').textContent) || 0;
  });
  const cgstRate = billType === 'gst' ? (parseFloat(document.getElementById('cgstRate').value) || 0) : 0;
  const sgstRate = billType === 'gst' ? (parseFloat(document.getElementById('sgstRate').value) || 0) : 0;
  const totalGstRate = cgstRate + sgstRate;
  // Reverse GST: taxable = original / (1 + GST%), so that taxable + GST = original
  const taxableAmount = billType === 'gst' && totalGstRate > 0 ? subtotal / (1 + totalGstRate / 100) : subtotal;
  const discount = subtotal - taxableAmount;
  const cgst = taxableAmount * (cgstRate / 100);
  const sgst = taxableAmount * (sgstRate / 100);
  const grandTotal = billType === 'gst' ? taxableAmount + cgst + sgst : subtotal;
  document.getElementById('subtotal').textContent = '₹' + subtotal.toFixed(2);
  document.getElementById('discountTotal').textContent = '-₹' + discount.toFixed(2);
  document.getElementById('taxableAmount').textContent = '₹' + taxableAmount.toFixed(2);
  document.getElementById('cgstTotal').textContent = '₹' + cgst.toFixed(2);
  document.getElementById('sgstTotal').textContent = '₹' + sgst.toFixed(2);
  document.getElementById('grandTotal').textContent = '₹' + grandTotal.toFixed(2);
  document.getElementById('amountWords').textContent = numberToWords(grandTotal);
}

function getInvoiceData() {
  const items = [];
  document.querySelectorAll('#itemsBody tr').forEach(tr => {
    const productId = parseInt(tr.querySelector('.product-id-hidden').value);
    if (!productId) return;
    const qty = parseInt(tr.querySelector('input[type="number"]').value) || 0;
    const rate = parseFloat(tr.querySelector('.rate').value) || 0;
    items.push({ product_id: productId, quantity: qty, price: rate, amount: qty * rate });
  });
  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const cgstRate = billType === 'gst' ? (parseFloat(document.getElementById('cgstRate').value) || 0) : 0;
  const sgstRate = billType === 'gst' ? (parseFloat(document.getElementById('sgstRate').value) || 0) : 0;
  const totalGstRate = cgstRate + sgstRate;
  const taxableAmount = billType === 'gst' && totalGstRate > 0 ? subtotal / (1 + totalGstRate / 100) : subtotal;
  const discount = subtotal - taxableAmount;
  const cgst = taxableAmount * (cgstRate / 100);
  const sgst = taxableAmount * (sgstRate / 100);
  const grandTotal = billType === 'gst' ? taxableAmount + cgst + sgst : subtotal;
  const paymentMode = document.getElementById('paymentMode').value;
  const amountPaid = paymentMode === 'cash' ? grandTotal : 0;
  return {
    invoice_no: parseInt(document.getElementById('invoiceNo').value),
    invoice_date: document.getElementById('invoiceDate').value,
    customer_id: parseInt(document.getElementById('customerSelectHidden').value || document.getElementById('customerSelect').value),
    bill_type: billType,
    payment_mode: paymentMode,
    amount_paid: amountPaid,
    brand: currentBrand,
    items, subtotal, cgst_rate: cgstRate, sgst_rate: sgstRate, cgst_total: cgst, sgst_total: sgst,
    discount_rate: totalGstRate, discount_total: discount, grand_total: grandTotal
  };
}

async function saveInvoice() {
  const data = getInvoiceData();
  if (!data.customer_id) return alert('Select a customer');
  if (!data.items.length) return alert('Add at least one item');
  if (data.bill_type === 'gst') {
    const cust = customers.find(c => c.id === data.customer_id);
    if (!cust || !cust.gst_no || !cust.gst_no.trim()) return alert('GST Bill requires customer GST number. Please update the customer details.');
  }

  const res = await apiFetch('/api/invoices', {
    method: 'POST', body: JSON.stringify(data)
  });
  const result = await res.json();
  if (res.ok) {
    alert('Invoice #' + result.invoice_no + ' saved!');
    resetInvoice();
    return result;
  } else {
    alert('Error: ' + result.error);
    return null;
  }
}

async function saveAndDownload() {
  const result = await saveInvoice();
  if (result) {
    await viewInvoice(result.id);
    setTimeout(() => downloadCurrentInvoice(), 500);
  }
}

async function resetInvoice() {
  document.getElementById('itemsBody').innerHTML = '';
  document.getElementById('customerSelect').value = '';
  document.getElementById('customerSelectHidden').value = '';
  const custTrigger = document.querySelector('.customer-section .custom-select-trigger');
  if (custTrigger) custTrigger.textContent = '-- Select Customer --';
  document.getElementById('customerDetails').style.display = 'none';
  document.getElementById('paymentMode').value = 'credit';
  document.getElementById('amountPaid').value = '';
  toggleAmountPaid();
  await initInvoice();
  addItemRow();
}

// ── Invoice History ──
async function loadInvoices() {
  const params = new URLSearchParams();
  const cid = document.getElementById('filterCustomer').value;
  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  if (cid) params.append('customer_id', cid);
  if (from) params.append('from_date', from);
  if (to) params.append('to_date', to);
  params.append('brand', currentBrand);

  const invoices = await apiFetch('/api/invoices?' + params).then(r => r.json());
  document.getElementById('invoicesList').innerHTML = invoices.map(inv => `
    <tr>
      <td>${inv.invoice_no}</td>
      <td>${inv.invoice_date}</td>
      <td>${esc(inv.customer_name)}</td>
      <td>${inv.grand_total.toFixed(2)}</td>
      <td><span class="bill-badge-sm">${inv.bill_type === 'non-gst' ? 'Non-GST' : 'GST'}</span></td>
      <td><span class="bill-badge-sm" style="background:${inv.payment_mode === 'credit' ? '#fff3e0;color:#e65100' : '#e8f5e9;color:#2e7d32'}">${inv.payment_mode === 'credit' ? '📝 Credit' : '💵 Cash'}</span></td>
      <td>
        <button class="btn-sm" onclick="viewInvoice(${inv.id})">👁️ View</button>
        <button class="btn-remove" onclick="deleteInvoice(${inv.id})">🗑️</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align:center;padding:20px;">No invoices found</td></tr>';
}

function buildInvoiceHTML(inv) {
  const taxable = (inv.subtotal - (inv.discount_total || 0));
  const taxTotal = (inv.cgst_total || 0) + (inv.sgst_total || 0);
  const isGst = inv.bill_type !== 'non-gst';
  const hsnCodes = [...new Set(inv.items.map(i => i.hsn_code).filter(Boolean))].join(', ');
  const brandName = inv.brand === 'sapat' ? 'Sapat Chai' : 'Pushp Masala';
  return `
  <div class="print-invoice">
    <div class="pi-outer">

      <!-- TOP: Company + Title + Invoice Meta -->
      <div class="pi-top">
        <div class="pi-company">
          <div class="pi-company-name">Siddhi Enterprises</div>
          <div class="pi-company-brand">${brandName}</div>
          <div>Juna Mondha, Beed - 431122</div>
          <div>State: Maharashtra &nbsp;|&nbsp; Code: 27</div>
          <div>GSTIN/UIN: 27CKWPS3584D1ZF</div>
          <div>FSSAI No: 11515047000269</div>
          <div>Mob: 8275223287 / 9422911445</div>
        </div>
        <div class="pi-title-block">
          <div class="pi-title">${isGst ? 'TAX INVOICE' : 'INVOICE'}</div>
        </div>
        <div class="pi-meta-block">
          <table class="pi-meta-table">
            <tr><td>Invoice No.</td><td><strong>${inv.invoice_no}</strong></td></tr>
            <tr><td>Date</td><td><strong>${inv.invoice_date}</strong></td></tr>
            <tr><td>Payment</td><td>${inv.payment_mode === 'credit' ? 'Credit' : 'Cash'}</td></tr>
            ${inv.amount_paid > 0 && inv.amount_paid < inv.grand_total
              ? `<tr><td>Paid</td><td>₹${inv.amount_paid.toFixed(2)}</td></tr>
                 <tr><td>Balance Due</td><td style="color:#c00"><strong>₹${(inv.grand_total - inv.amount_paid).toFixed(2)}</strong></td></tr>`
              : ''}
          </table>
        </div>
      </div>

      <!-- PARTY -->
      <div class="pi-party">
        <span class="pi-party-label">Consignee / Buyer:</span>
        <strong>${esc(inv.customer_name)}</strong>
        ${inv.customer_address ? `&nbsp;|&nbsp; ${esc(inv.customer_address)}` : ''}
        ${inv.customer_mob ? `&nbsp;|&nbsp; Mob: ${esc(inv.customer_mob)}` : ''}
        ${inv.customer_gst ? `&nbsp;|&nbsp; GSTIN: ${esc(inv.customer_gst)}` : ''}
      </div>

      <!-- ITEMS TABLE -->
      <table class="pi-items">
        <colgroup>
          <col style="width:4%"><col style="width:34%"><col style="width:9%"><col style="width:11%">
          <col style="width:7%"><col style="width:11%"><col style="width:12%">
        </colgroup>
        <thead>
          <tr>
            <th>Sr.</th><th>Description of Goods</th><th>HSN/SAC</th><th>Packaging</th>
            <th>Qty</th><th>Rate (₹)</th><th>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${inv.items.map((it, i) => `
            <tr>
              <td class="tc">${i + 1}</td>
              <td>${esc(it.product_name)}</td>
              <td class="tc">${it.hsn_code || ''}</td>
              <td class="tc">${it.packaging || ''}</td>
              <td class="tc">${it.quantity}</td>
              <td class="tr">₹${it.price.toFixed(2)}</td>
              <td class="tr">₹${it.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
          <tr class="pi-items-spacer"><td colspan="7"></td></tr>
        </tbody>
        <tfoot>
          <tr class="pi-items-total">
            <td colspan="4" class="tc"><strong>Total</strong></td>
            <td class="tc"><strong>${inv.items.reduce((s,i)=>s+i.quantity,0)}</strong></td>
            <td></td>
            <td class="tr"><strong>₹${inv.subtotal.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>

      <!-- BOTTOM SECTION -->
      <div class="pi-bottom">

        <!-- LEFT: Amount in words + bank -->
        <div class="pi-bottom-left">
          <div class="pi-words">
            <strong>Amount in Words:</strong><br>
            ${numberToWords(inv.grand_total)}
          </div>
          ${isGst ? `<div class="pi-tax-words">
            <strong>Tax Amount in Words:</strong><br>
            ${numberToWords(taxTotal)}
          </div>` : ''}
          <div class="pi-bank">
            <strong>Bank Details:</strong><br>
            Bank of Maharashtra, Beed<br>
            A/c No: 60452321892<br>
            IFSC: MAHB0001329
          </div>
        </div>

        <!-- RIGHT: Totals -->
        <div class="pi-totals">
          ${isGst ? `
          <div><span>Taxable Amount:</span><span>₹${taxable.toFixed(2)}</span></div>
          ${(inv.discount_total || 0) > 0 ? `<div><span>Discount:</span><span>-₹${inv.discount_total.toFixed(2)}</span></div>` : ''}
          <div><span>CGST @ ${inv.cgst_rate || 2.5}%:</span><span>₹${(inv.cgst_total || 0).toFixed(2)}</span></div>
          <div><span>SGST @ ${inv.sgst_rate || 2.5}%:</span><span>₹${(inv.sgst_total || 0).toFixed(2)}</span></div>
          ` : `<div><span>Sub Total:</span><span>₹${inv.subtotal.toFixed(2)}</span></div>`}
          <div class="pi-grand"><span>Grand Total:</span><span>₹${inv.grand_total.toFixed(2)}</span></div>
        </div>
      </div>

      <!-- GST SUMMARY TABLE -->
      ${isGst ? `
      <table class="pi-gst">
        <thead>
          <tr>
            <th>HSN/SAC</th>
            <th>Taxable Value (₹)</th>
            <th>CGST Rate</th><th>CGST Amt (₹)</th>
            <th>SGST Rate</th><th>SGST Amt (₹)</th>
            <th>Total Tax (₹)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="tc">${hsnCodes}</td>
            <td class="tr">${taxable.toFixed(2)}</td>
            <td class="tc">${inv.cgst_rate || 2.5}%</td>
            <td class="tr">${(inv.cgst_total || 0).toFixed(2)}</td>
            <td class="tc">${inv.sgst_rate || 2.5}%</td>
            <td class="tr">${(inv.sgst_total || 0).toFixed(2)}</td>
            <td class="tr">${taxTotal.toFixed(2)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Total</strong></td>
            <td class="tr"><strong>${taxable.toFixed(2)}</strong></td>
            <td></td>
            <td class="tr"><strong>${(inv.cgst_total || 0).toFixed(2)}</strong></td>
            <td></td>
            <td class="tr"><strong>${(inv.sgst_total || 0).toFixed(2)}</strong></td>
            <td class="tr"><strong>${taxTotal.toFixed(2)}</strong></td>
          </tr>
        </tfoot>
      </table>
      ` : ''}

      <!-- FOOTER: Signature -->
      <div class="pi-footer">
        <div class="pi-footer-left">
          <div class="pi-sig-line"></div>
          <div>Receiver's Signature</div>
        </div>
        <div class="pi-footer-note">E. &amp; O.E. &nbsp;|&nbsp; This is a computer generated invoice.</div>
        <div class="pi-footer-right">
          <div><strong>for Siddhi Enterprises</strong></div>
          <div class="pi-sig-line"></div>
          <div>Authorised Signatory</div>
        </div>
      </div>

    </div>
  </div>`;
}

async function viewInvoice(id) {
  currentViewInvoiceId = id;
  const inv = await apiFetch('/api/invoices/' + id).then(r => r.json());
  document.getElementById('invoicePrintArea').innerHTML = buildInvoiceHTML(inv);
  document.getElementById('viewInvoiceModal').style.display = 'flex';
}

const BILL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 10px; background: #fff; color: #000; }
  .print-invoice { padding: 8px; }
  .pi-outer { border: 1.5px solid #000; }

  /* Top header */
  .pi-top { display: flex; border-bottom: 1px solid #000; }
  .pi-company { flex: 1; padding: 6px 8px; border-right: 1px solid #000; line-height: 1.5; }
  .pi-company-name { font-size: 15px; font-weight: bold; }
  .pi-company-brand { font-size: 11px; color: #444; margin-bottom: 2px; }
  .pi-title-block { width: 120px; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000; }
  .pi-title { font-size: 13px; font-weight: bold; letter-spacing: 1px; writing-mode: horizontal-tb; text-align: center; }
  .pi-meta-block { width: 200px; padding: 6px 8px; }
  .pi-meta-table { width: 100%; border-collapse: collapse; }
  .pi-meta-table td { padding: 2px 4px; font-size: 10px; line-height: 1.4; }
  .pi-meta-table td:first-child { color: #555; white-space: nowrap; }

  /* Party */
  .pi-party { padding: 5px 8px; border-bottom: 1px solid #000; font-size: 10px; line-height: 1.5; }
  .pi-party-label { font-weight: bold; margin-right: 4px; }

  /* Items table */
  .pi-items { width: 100%; border-collapse: collapse; border-bottom: 1px solid #000; }
  .pi-items th { background: #000; color: #fff; padding: 3px 5px; font-size: 9px; text-align: left; border-right: 1px solid #555; }
  .pi-items th:last-child { border-right: none; }
  .pi-items td { padding: 3px 5px; border-bottom: 1px solid #ddd; border-right: 1px solid #eee; font-size: 9.5px; line-height: 1.3; }
  .pi-items td:last-child { border-right: none; }
  .pi-items tfoot td { border-top: 1.5px solid #000; border-bottom: none; background: #f5f5f5; }
  .pi-items-spacer td { height: 10px; border: none !important; }
  .tc { text-align: center; }
  .tr { text-align: right; }

  /* Bottom */
  .pi-bottom { display: flex; border-bottom: 1px solid #000; }
  .pi-bottom-left { flex: 1; padding: 6px 8px; border-right: 1px solid #000; line-height: 1.6; }
  .pi-words { margin-bottom: 5px; font-style: italic; }
  .pi-tax-words { margin-bottom: 5px; font-style: italic; }
  .pi-bank { font-size: 9px; color: #333; }
  .pi-totals { width: 230px; padding: 6px 8px; }
  .pi-totals div { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dotted #ddd; font-size: 10px; }
  .pi-totals div span:last-child { text-align: right; min-width: 80px; }
  .pi-grand { font-weight: bold; font-size: 11px !important; border-top: 2px solid #000 !important; border-bottom: none !important; padding-top: 4px !important; }

  /* GST summary */
  .pi-gst { width: 100%; border-collapse: collapse; border-bottom: 1px solid #000; }
  .pi-gst th { background: #eee; color: #000; padding: 3px 5px; font-size: 9px; border: 1px solid #aaa; text-align: center; }
  .pi-gst td { padding: 3px 5px; font-size: 9.5px; border: 1px solid #ccc; }
  .pi-gst tfoot td { background: #f5f5f5; font-weight: bold; }

  /* Footer */
  .pi-footer { display: flex; justify-content: space-between; align-items: flex-end; padding: 8px 10px 6px; }
  .pi-footer-note { font-size: 8px; color: #666; text-align: center; align-self: flex-end; }
  .pi-sig-line { width: 120px; border-bottom: 1px solid #000; height: 24px; margin: 2px 0; }
  .pi-footer-left, .pi-footer-right { font-size: 9.5px; text-align: center; }

  @media print { body { margin: 0; } }
`;

function downloadCurrentInvoice() {
  const printArea = document.getElementById('invoicePrintArea');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Invoice</title><style>${BILL_CSS}</style></head><body>${printArea.innerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

function printInvoice(includeSeller) {
  const printArea = document.getElementById('invoicePrintArea');
  const invoiceHTML = printArea.innerHTML;
  const copyHTML = (label) => `
    <div class="copy-section">
      <div class="copy-label">${label}</div>
      ${invoiceHTML}
    </div>`;
  const bodyContent = includeSeller
    ? `${copyHTML('Customer Copy')}<div class="cut-divider">✂</div>${copyHTML('Seller Copy')}`
    : copyHTML('Customer Copy');
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Print Invoice</title>
    <style>
      ${BILL_CSS}
      @page { size: A4 ${includeSeller ? 'landscape' : 'portrait'}; margin: 4mm; }
      body { display: flex; gap: 0; }
      .copy-section { flex: 1; padding: 2px; }
      .copy-label { text-align: right; font-size: 8px; font-weight: bold; color: #555; text-transform: uppercase; margin-bottom: 2px; }
      .cut-divider { display: flex; align-items: center; padding: 0 4px; font-size: 12px; color: #aaa; }
    </style></head><body>${bodyContent}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

async function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  await apiFetch('/api/invoices/' + id, { method: 'DELETE' });
  loadInvoices();
}

// ── Helpers ──
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Authenticated fetch wrapper
function apiFetch(url, opts = {}) {
  opts.headers = { ...opts.headers, 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
  return fetch(API + url, opts).then(r => {
    if (r.status === 401) { doLogout(); throw new Error('Session expired'); }
    return r;
  });
}

// ── Stock Management ──
function renderStockList() {
  const tbody = document.getElementById('stockList');
  tbody.innerHTML = products.map(p => {
    const stock = p.stock || 0;
    let status = '<span style="color:#2e7d32;font-weight:bold;">In Stock</span>';
    if (stock <= 0) status = '<span style="color:#e53935;font-weight:bold;">Out of Stock</span>';
    else if (stock <= 10) status = '<span style="color:#e65100;font-weight:bold;">Low Stock</span>';
    return `<tr>
      <td>${esc(p.name)}</td><td>${esc(p.packaging)}</td>
      <td style="font-weight:bold;font-size:1.1em;">${stock}</td>
      <td>${status}</td>
      <td>
        <button class="btn-sm btn-success" onclick="showStockModal(${p.id}, 'in')" style="font-size:.75em;">📥 Stock In</button>
        <button class="btn-sm" onclick="showStockModal(${p.id}, 'out')" style="font-size:.75em;background:#e65100;">📤 Stock Out</button>
      </td>
    </tr>`;
  }).join('');

  // Populate filter dropdown
  const sel = document.getElementById('stockLogFilter');
  sel.innerHTML = '<option value="">All Products</option>' +
    products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.packaging)})</option>`).join('');
}

function downloadStockPDF() {
  const half = Math.ceil(products.length / 2);
  const col1 = products.slice(0, half);
  const col2 = products.slice(half);
  const maxRows = Math.max(col1.length, col2.length);
  let rows = '';
  for (let i = 0; i < maxRows; i++) {
    const left = col1[i] ? `<td>${esc(col1[i].name)} (${esc(col1[i].packaging)})</td><td>${col1[i].stock || 0}</td><td></td>` : '<td></td><td></td><td></td>';
    const right = col2[i] ? `<td>${esc(col2[i].name)} (${esc(col2[i].packaging)})</td><td>${col2[i].stock || 0}</td><td></td>` : '<td></td><td></td><td></td>';
    rows += `<tr>${left}<td class="gap"></td>${right}</tr>`;
  }
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Stock Report</title>
    <style>
      @page { size: A4; margin: 8mm; }
      body { font-family: 'Segoe UI', sans-serif; padding: 10px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 3px 5px; font-size: 9px; line-height: 1.2; }
      th { background: #000; color: #fff; text-align: left; }
      td.gap, th.gap { border: none; background: #fff; width: 10px; }
      th:nth-child(2), th:nth-child(3), th:nth-child(6), th:nth-child(7),
      td:nth-child(2), td:nth-child(3), td:nth-child(6), td:nth-child(7) { width: 40px; text-align: center; }
      @media print { body { margin: 0; } }
    </style></head><body>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th></th><th class="gap"></th><th>Item</th><th>Qty</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

function showStockModal(productId, type) {
  const p = products.find(x => x.id === productId);
  document.getElementById('stockModalTitle').textContent = type === 'in' ? '📥 Stock In' : '📤 Stock Out';
  document.getElementById('stockProductId').value = productId;
  document.getElementById('stockProductName').value = p.name + ' (' + p.packaging + ')';
  document.getElementById('stockType').value = type;
  document.getElementById('stockQty').value = 1;
  document.getElementById('stockNotes').value = '';
  document.getElementById('stockModal').style.display = 'flex';
}

async function saveStockEntry() {
  const productId = document.getElementById('stockProductId').value;
  const type = document.getElementById('stockType').value;
  const quantity = parseInt(document.getElementById('stockQty').value);
  const notes = document.getElementById('stockNotes').value.trim();
  if (!quantity || quantity <= 0) return alert('Enter a valid quantity');
  if (type === 'out') {
    const p = products.find(x => x.id === parseInt(productId));
    if ((p.stock || 0) < quantity) return alert('Not enough stock! Current: ' + (p.stock || 0));
  }
  await apiFetch('/api/products/' + productId + '/stock', {
    method: 'PUT', body: JSON.stringify({ quantity, type, notes })
  });
  await loadProducts();
  renderStockList();
  loadStockLog();
  closeModal('stockModal');
}

async function loadStockLog() {
  const productId = document.getElementById('stockLogFilter').value;
  let params = 'brand=' + currentBrand;
  if (productId) params += '&product_id=' + productId;
  const logs = await apiFetch('/api/stock-log?' + params).then(r => r.json());
  document.getElementById('stockLogList').innerHTML = logs.map(l => `
    <tr>
      <td>${l.created_at}</td>
      <td>${esc(l.product_name)}</td>
      <td>${esc(l.packaging)}</td>
      <td><span style="color:${l.type === 'in' ? '#2e7d32' : l.type === 'sale' ? '#1a237e' : '#e53935'};font-weight:bold;">${l.type === 'in' ? '📥 IN' : l.type === 'sale' ? '💵 SALE' : '📤 OUT'}</span></td>
      <td style="font-weight:bold;color:${l.type === 'in' ? '#2e7d32' : '#e53935'};">${l.type === 'in' ? '+' : '-'}${l.quantity}</td>
      <td>${esc(l.notes)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;">No stock history</td></tr>';
}

// ── Analytics ──
let bestSellingChartInstance = null;
let productTrendChartInstance = null;

function initAnalytics() {
  const sel = document.getElementById('analyticsYear');
  if (!sel.options.length) {
    const curYear = new Date().getFullYear();
    for (let y = curYear; y >= curYear - 5; y--) {
      sel.innerHTML += `<option value="${y}">${y}</option>`;
    }
  }
  const prodSel = document.getElementById('analyticsProduct');
  if (prodSel.options.length <= 1) {
    const unique = [];
    products.forEach(p => {
      const key = p.name + '|' + p.packaging;
      if (!unique.find(u => u.key === key)) unique.push({ key, id: p.id, name: p.name, packaging: p.packaging });
    });
    prodSel.innerHTML = '<option value="">-- Select Product --</option>' +
      unique.map(u => `<option value="${u.id}">${esc(u.name)} (${esc(u.packaging)})</option>`).join('');
  }
  loadAnalytics();
}

async function loadAnalytics() {
  const year = document.getElementById('analyticsYear').value;
  const view = document.getElementById('analyticsView').value;
  const data = await apiFetch(`/api/reports/product-sales?year=${year}&view=${view}&brand=${currentBrand}`).then(r => r.json());

  // Aggregate by product
  const prodMap = {};
  data.forEach(r => {
    const key = r.name + ' (' + r.packaging + ')';
    if (!prodMap[key]) prodMap[key] = { qty: 0, revenue: 0 };
    prodMap[key].qty += r.quantity;
    prodMap[key].revenue += r.amount;
  });
  const sorted = Object.entries(prodMap).sort((a, b) => b[1].qty - a[1].qty);
  const top10 = sorted.slice(0, 10);

  // Top products table
  document.getElementById('topProductsList').innerHTML = sorted.map((s, i) =>
    `<tr><td>${i + 1}</td><td>${esc(s[0].split(' (')[0])}</td><td>${esc(s[0].match(/\((.+)\)/)?.[1] || '')}</td><td>${s[1].qty}</td><td>₹${s[1].revenue.toFixed(2)}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;">No data</td></tr>';

  // Best selling chart
  if (bestSellingChartInstance) bestSellingChartInstance.destroy();
  const ctx = document.getElementById('bestSellingChart').getContext('2d');
  bestSellingChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top10.map(s => s[0]),
      datasets: [{
        label: 'Quantity Sold',
        data: top10.map(s => s[1].qty),
        backgroundColor: '#3f51b5'
      }, {
        label: 'Revenue (₹)',
        data: top10.map(s => s[1].revenue),
        backgroundColor: '#ff9800',
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Quantity' } },
        y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Revenue (₹)' }, grid: { drawOnChartArea: false } }
      }
    }
  });

  // Aggregate by period for trend
  loadProductTrend();
}

async function loadProductTrend() {
  const productId = document.getElementById('analyticsProduct').value;
  const section = document.getElementById('productTrendSection');
  if (!productId) { section.style.display = 'none'; return; }
  section.style.display = 'block';

  const year = document.getElementById('analyticsYear').value;
  const view = document.getElementById('analyticsView').value;
  const data = await apiFetch(`/api/reports/product-sales?year=${year}&view=${view}&brand=${currentBrand}`).then(r => r.json());
  const filtered = data.filter(r => r.id === parseInt(productId));

  // Aggregate by period
  const periodMap = {};
  filtered.forEach(r => {
    const month = parseInt(r.invoice_date.split('-')[1]);
    let periodKey;
    if (view === 'monthly') periodKey = r.invoice_date.substring(0, 7);
    else if (view === 'quarterly') periodKey = 'Q' + Math.ceil(month / 3);
    else periodKey = year;
    if (!periodMap[periodKey]) periodMap[periodKey] = { qty: 0, revenue: 0 };
    periodMap[periodKey].qty += r.quantity;
    periodMap[periodKey].revenue += r.amount;
  });

  // Fill missing periods
  let labels = [];
  if (view === 'monthly') {
    for (let m = 1; m <= 12; m++) {
      const key = year + '-' + String(m).padStart(2, '0');
      labels.push(key);
      if (!periodMap[key]) periodMap[key] = { qty: 0, revenue: 0 };
    }
  } else if (view === 'quarterly') {
    labels = ['Q1', 'Q2', 'Q3', 'Q4'];
    labels.forEach(q => { if (!periodMap[q]) periodMap[q] = { qty: 0, revenue: 0 }; });
  } else {
    labels = [year];
    if (!periodMap[year]) periodMap[year] = { qty: 0, revenue: 0 };
  }

  const totalQty = Object.values(periodMap).reduce((s, p) => s + p.qty, 0);
  const totalRev = Object.values(periodMap).reduce((s, p) => s + p.revenue, 0);
  document.getElementById('prodStatQty').textContent = totalQty;
  document.getElementById('prodStatRevenue').textContent = '₹' + totalRev.toFixed(2);

  if (productTrendChartInstance) productTrendChartInstance.destroy();
  const ctx = document.getElementById('productTrendChart').getContext('2d');
  productTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Quantity Sold',
        data: labels.map(l => periodMap[l].qty),
        borderColor: '#3f51b5',
        backgroundColor: 'rgba(63,81,181,0.1)',
        fill: true, tension: 0.3
      }, {
        label: 'Revenue (₹)',
        data: labels.map(l => periodMap[l].revenue),
        borderColor: '#ff9800',
        backgroundColor: 'rgba(255,152,0,0.1)',
        fill: true, tension: 0.3,
        yAxisID: 'y1'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'Quantity' } },
        y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'Revenue (₹)' }, grid: { drawOnChartArea: false } }
      }
    }
  });
}

// ── Customer Balances ──
let lastReportData = [];

function initReport() {
  if (!document.getElementById('reportMonth').value) {
    const now = new Date();
    document.getElementById('reportMonth').value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
}

async function loadReport() {
  const month = document.getElementById('reportMonth').value;
  const billType = document.getElementById('reportBillType').value;
  if (!month) return alert('Select a month');
  const params = new URLSearchParams({ month, bill_type: billType, brand: currentBrand });
  const data = await apiFetch('/api/reports/monthly?' + params).then(r => r.json());
  lastReportData = data;

  // Stats
  const count = data.length;
  const totalSales = data.reduce((s, r) => s + r.grand_total, 0);
  const totalGst = data.reduce((s, r) => s + (r.cgst_total || 0) + (r.sgst_total || 0), 0);
  const totalDiscount = data.reduce((s, r) => s + (r.discount_total || 0), 0);
  const avg = count > 0 ? totalSales / count : 0;
  document.getElementById('statCount').textContent = count;
  document.getElementById('statSales').textContent = '₹' + totalSales.toFixed(2);
  document.getElementById('statGst').textContent = '₹' + totalGst.toFixed(2);
  document.getElementById('statDiscount').textContent = '₹' + totalDiscount.toFixed(2);
  document.getElementById('statAvg').textContent = '₹' + avg.toFixed(2);
  document.getElementById('reportStats').style.display = 'block';

  // Table
  document.getElementById('reportList').innerHTML = data.map(r => `
    <tr>
      <td>${r.invoice_no}</td>
      <td>${r.invoice_date}</td>
      <td>${esc(r.customer_name)}</td>
      <td>${r.bill_type === 'non-gst' ? 'Non-GST' : 'GST'}</td>
      <td>${r.subtotal.toFixed(2)}</td>
      <td>${(r.cgst_total || 0).toFixed(2)}</td>
      <td>${(r.sgst_total || 0).toFixed(2)}</td>
      <td>${(r.discount_total || 0).toFixed(2)}</td>
      <td>${r.grand_total.toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="9" style="text-align:center;padding:20px;">No invoices found</td></tr>';

  document.getElementById('reportFooter').innerHTML = data.length ? `
    <tr style="font-weight:bold;background:#e8eaf6;">
      <td colspan="4">TOTAL</td>
      <td>${data.reduce((s, r) => s + r.subtotal, 0).toFixed(2)}</td>
      <td>${data.reduce((s, r) => s + (r.cgst_total || 0), 0).toFixed(2)}</td>
      <td>${data.reduce((s, r) => s + (r.sgst_total || 0), 0).toFixed(2)}</td>
      <td>${totalDiscount.toFixed(2)}</td>
      <td>${totalSales.toFixed(2)}</td>
    </tr>
  ` : '';

  document.getElementById('reportTable').style.display = data.length ? 'table' : 'none';
  document.getElementById('reportActions').style.display = data.length ? 'flex' : 'none';
}

function downloadReportCSV() {
  if (!lastReportData.length) return;
  const month = document.getElementById('reportMonth').value;
  const billType = document.getElementById('reportBillType').value;
  const headers = ['Invoice No', 'Date', 'Customer', 'Bill Type', 'Subtotal', 'CGST', 'SGST', 'Discount', 'Grand Total'];
  const rows = lastReportData.map(r => [
    r.invoice_no, r.invoice_date, '"' + (r.customer_name || '').replace(/"/g, '""') + '"',
    r.bill_type === 'non-gst' ? 'Non-GST' : 'GST',
    r.subtotal.toFixed(2), (r.cgst_total || 0).toFixed(2), (r.sgst_total || 0).toFixed(2),
    (r.discount_total || 0).toFixed(2), r.grand_total.toFixed(2)
  ]);
  // Add totals row
  rows.push([
    '', '', 'TOTAL', '',
    lastReportData.reduce((s, r) => s + r.subtotal, 0).toFixed(2),
    lastReportData.reduce((s, r) => s + (r.cgst_total || 0), 0).toFixed(2),
    lastReportData.reduce((s, r) => s + (r.sgst_total || 0), 0).toFixed(2),
    lastReportData.reduce((s, r) => s + (r.discount_total || 0), 0).toFixed(2),
    lastReportData.reduce((s, r) => s + r.grand_total, 0).toFixed(2)
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-report-${month}-${billType}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadProductStockReport() {
  const month = document.getElementById('reportMonth').value;
  if (!month) return alert('Select a month');
  const data = await apiFetch('/api/reports/product-stock-report?month=' + month + '&brand=' + currentBrand).then(r => r.json());
  if (!data.length) return alert('No products found');
  const headers = ['Product', 'HSN Code', 'Packaging', 'Qty Sold', 'Current Stock'];
  const rows = data.map(r => [
    '"' + (r.name || '').replace(/"/g, '""') + '"',
    r.hsn_code, r.packaging,
    r.qty_sold, r.current_stock
  ]);
  rows.push([
    'TOTAL', '', '',
    data.reduce((s, r) => s + r.qty_sold, 0),
    data.reduce((s, r) => s + r.current_stock, 0)
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `product-stock-report-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Unpaid Report ──
async function loadUnpaidReport() {
  const from = document.getElementById('unpaidFromDate').value;
  const to = document.getElementById('unpaidToDate').value;
  let url = '/api/reports/unpaid?brand=' + currentBrand;
  if (from) url += '&from_date=' + from;
  if (to) url += '&to_date=' + to;
  const data = await apiFetch(url).then(r => r.json());
  const totalAmount = data.reduce((sum, r) => sum + r.grand_total, 0);
  document.getElementById('unpaidStats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Unpaid Invoices</div><div class="stat-value">${data.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Unpaid Amount</div><div class="stat-value">₹${totalAmount.toFixed(2)}</div></div>
  `;
  document.getElementById('unpaidList').innerHTML = data.map(r => `
    <tr>
      <td>${r.invoice_date}</td>
      <td>${r.invoice_no}</td>
      <td>${esc(r.customer_name)}</td>
      <td>₹${r.grand_total.toFixed(2)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;">No unpaid invoices found</td></tr>';
}

function downloadUnpaidPDF() {
  const stats = document.getElementById('unpaidStats').innerHTML;
  const rows = document.getElementById('unpaidList').innerHTML;
  const from = document.getElementById('unpaidFromDate').value || 'All';
  const to = document.getElementById('unpaidToDate').value || 'All';
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Unpaid Report</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #000; color: #fff; padding: 6px 8px; font-size: 12px; text-align: left; }
      td { padding: 5px 8px; border-bottom: 1px solid #ccc; font-size: 12px; }
      .total { text-align: right; font-weight: bold; font-size: 13px; margin-top: 10px; }
      @media print { body { margin: 0; } }
    </style></head><body>
      <table>
        <thead><tr><th>Date</th><th>Invoice #</th><th>Customer Name</th><th>Amount (₹)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

async function loadBalances() {
  const balances = await apiFetch('/api/customer-balances?brand=' + currentBrand).then(r => r.json());
  document.getElementById('balancesList').innerHTML = balances.map(b => `
    <tr>
      <td>${esc(b.name)}</td>
      <td>${esc(b.mob_no)}</td>
      <td style="color:#e65100;font-weight:bold;">₹${b.total_credit.toFixed(2)}</td>
      <td>₹${b.total_sales.toFixed(2)}</td>
      <td><button class="btn-sm" onclick="viewCreditDetails(${b.id}, '${esc(b.name).replace(/'/g, "\\'")}')">View Details</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;">No credit balances</td></tr>';
}

async function viewCreditDetails(customerId, name) {
  const invoices = await apiFetch('/api/customer-balances/' + customerId + '?brand=' + currentBrand).then(r => r.json());
  document.getElementById('creditDetailsTitle').textContent = 'Credit Details - ' + name;
  let total = 0;
  document.getElementById('creditDetailsList').innerHTML = invoices.map(inv => {
    total += inv.credit_remaining;
    return `<tr><td>${inv.invoice_no}</td><td>${inv.invoice_date}</td><td>₹${inv.grand_total.toFixed(2)}</td><td>₹${inv.amount_paid.toFixed(2)}</td><td style="color:#e65100;font-weight:bold;">₹${inv.credit_remaining.toFixed(2)}</td><td><span class="bill-badge-sm">${inv.bill_type === 'non-gst' ? 'Non-GST' : 'GST'}</span></td><td><button class="btn-sm btn-success" onclick="markAsPaid(${inv.id}, ${customerId}, '${name.replace(/'/g, "\\'")}')">✅ Paid</button> <button class="btn-sm" onclick="partialPay(${inv.id}, ${inv.credit_remaining}, ${customerId}, '${name.replace(/'/g, "\\\'")}')" style="font-size:.75em;">💳 Partial</button></td></tr>`;
  }).join('');
  document.getElementById('creditDetailsTotal').textContent = 'Total Credit: ₹' + total.toFixed(2);
  document.getElementById('creditDetailsModal').style.display = 'flex';
}

async function markAsPaid(invoiceId, customerId, customerName) {
  if (!confirm('Mark remaining balance as fully paid?')) return;
  await apiFetch('/api/invoices/' + invoiceId + '/mark-paid', { method: 'PUT', body: JSON.stringify({}) });
  await viewCreditDetails(customerId, customerName);
  await loadBalances();
}

async function partialPay(invoiceId, remaining, customerId, customerName) {
  const amount = prompt('Remaining: ₹' + remaining.toFixed(2) + '\nEnter amount to pay:');
  if (!amount) return;
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0) return alert('Enter a valid amount');
  if (num > remaining) return alert('Amount cannot exceed remaining balance of ₹' + remaining.toFixed(2));
  await apiFetch('/api/invoices/' + invoiceId + '/mark-paid', { method: 'PUT', body: JSON.stringify({ amount: num }) });
  await viewCreditDetails(customerId, customerName);
  await loadBalances();
}

// Number to words (Indian system)
function numberToWords(num) {
  if (num === 0) return 'Zero';
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function twoDigits(n) {
    if (n < 20) return ones[n];
    return tens[Math.floor(n/10)] + (n%10 ? ' ' + ones[n%10] : '');
  }
  function threeDigits(n) {
    if (n >= 100) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' and ' + twoDigits(n%100) : '');
    return twoDigits(n);
  }
  const n = Math.round(Math.abs(num));
  const paise = Math.round((Math.abs(num) - n) * 100);
  let result = '';
  if (n >= 10000000) { result += threeDigits(Math.floor(n/10000000)) + ' Crore '; }
  if (n >= 100000) { result += twoDigits(Math.floor((n%10000000)/100000)) + ' Lakh '; }
  if (n >= 1000) { result += twoDigits(Math.floor((n%100000)/1000)) + ' Thousand '; }
  if (n >= 100 || (n > 0 && result === '')) { result += threeDigits(n%1000); }
  result = result.trim() + ' Rupees';
  if (paise > 0) result += ' and ' + twoDigits(paise) + ' Paise';
  return result + ' Only';
}
