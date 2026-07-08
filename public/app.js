const API = '';
let products = [];
let customers = [];
let currentViewInvoiceId = null;
let billType = 'gst'; // 'gst' or 'non-gst'

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
    document.getElementById('billTypeScreen').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
  } catch (e) {
    errEl.textContent = 'Connection error'; errEl.style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('token');
  document.getElementById('mainApp').style.display = 'none';
  document.getElementById('appContent').style.display = 'none';
  document.getElementById('billTypeScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPass').value = '';
}

function selectBillType(type) {
  billType = type;
  document.getElementById('billTypeScreen').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';
  document.getElementById('billTypeBadge').textContent = type === 'gst' ? 'GST' : 'Non-GST';
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
      .then(r => { if (r.ok) { document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block'; document.getElementById('billTypeScreen').style.display = 'flex'; } else { doLogout(); } })
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
  if (name === 'reports') initReport();
  if (name === 'analytics') initAnalytics();
}

// ── Products ──
async function loadProducts() {
  products = await apiFetch('/api/products').then(r => r.json());
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
  else await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(data) });
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
  sel.innerHTML = '<option value="">-- Select Customer --</option>' +
    customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
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
  const { next_no } = await apiFetch('/api/invoices/next-number').then(r => r.json());
  document.getElementById('invoiceNo').value = next_no;
  document.getElementById('invoiceDate').value = new Date().toISOString().split('T')[0];
}

function addItemRow() {
  const tbody = document.getElementById('itemsBody');
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${idx}</td>
    <td>
      <select onchange="onProductSelect(this)">
        <option value="">-- Select --</option>
        ${products.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.packaging)})</option>`).join('')}
      </select>
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

function onProductSelect(sel) {
  const tr = sel.closest('tr');
  const p = products.find(x => x.id === parseInt(sel.value));
  if (p) {
    tr.querySelector('.hsn').textContent = p.hsn_code;
    tr.querySelector('.pkg').textContent = p.packaging;
    tr.querySelector('.rate').value = p.price.toFixed(2);
    calcRow(tr.querySelector('.rate'));
  }
}

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
    const productId = parseInt(tr.querySelector('select').value);
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
  return {
    invoice_no: parseInt(document.getElementById('invoiceNo').value),
    invoice_date: document.getElementById('invoiceDate').value,
    customer_id: parseInt(document.getElementById('customerSelect').value),
    bill_type: billType,
    payment_mode: document.getElementById('paymentMode').value,
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
  document.getElementById('customerDetails').style.display = 'none';
  document.getElementById('paymentMode').value = 'cash';
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

async function viewInvoice(id) {
  currentViewInvoiceId = id;
  const inv = await apiFetch('/api/invoices/' + id).then(r => r.json());
  document.getElementById('invoicePrintArea').innerHTML = `
    <div class="print-invoice">
      <div class="pi-header">
        <div>
          <h2>Siddhi Enterprises</h2>
          <p style="font-size:.85em;color:#555;">Juna Mondha, Beed - 431122</p>
          <p style="font-size:.8em;color:#666;">GSTIN: 27CKWPS3584D1ZF | FSSAI: 11515047000269</p>
          <p style="font-size:.8em;color:#666;">Mob: 8275223287 / 9422911445</p>
        </div>
        <div style="text-align:right;">
          <h3 style="color:#1a237e;">TAX INVOICE</h3>
          <p>Invoice #: <strong>${inv.invoice_no}</strong></p>
          <p>Date: <strong>${inv.invoice_date}</strong></p>
          <p>Payment: <strong>${inv.payment_mode === 'credit' ? '📝 Credit' : '💵 Cash'}</strong></p>
        </div>
      </div>
      <div class="pi-customer">
        <strong>Bill To:</strong> ${esc(inv.customer_name)}<br>
        ${inv.customer_address ? 'Address: ' + esc(inv.customer_address) + '<br>' : ''}
        ${inv.customer_mob ? 'Mobile: ' + esc(inv.customer_mob) + '<br>' : ''}
        ${inv.customer_gst ? 'GSTIN: ' + esc(inv.customer_gst) : ''}
      </div>
      <table>
        <thead><tr><th>#</th><th>Product</th><th>HSN</th><th>Pkg</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${inv.items.map((it, i) => `
            <tr><td>${i + 1}</td><td>${esc(it.product_name)}</td><td>${it.hsn_code}</td><td>${it.packaging}</td>
            <td>${it.quantity}</td><td>₹${it.price.toFixed(2)}</td><td>₹${it.amount.toFixed(2)}</td></tr>
          `).join('')}
        </tbody>
      </table>
      <div class="pi-totals">
        <div><span>Original Amount:</span><span>₹${inv.subtotal.toFixed(2)}</span></div>
        ${inv.bill_type !== 'non-gst' ? `
        ${(inv.discount_total || 0) > 0 ? `<div style="color:#e65100;"><span>Special Discount:</span><span>-₹${inv.discount_total.toFixed(2)}</span></div>` : ''}
        <div><span>Taxable Amount:</span><span>₹${(inv.subtotal - (inv.discount_total || 0)).toFixed(2)}</span></div>
        <div><span>CGST (${(inv.cgst_rate || 2.5)}%):</span><span>₹${inv.cgst_total.toFixed(2)}</span></div>
        <div><span>SGST (${(inv.sgst_rate || 2.5)}%):</span><span>₹${inv.sgst_total.toFixed(2)}</span></div>
        ` : ''}
        <div class="pi-grand"><span>Final Payable:</span><span>₹${inv.grand_total.toFixed(2)}</span></div>
      </div>
      <div style="clear:both;width:100%;font-size:.85em;font-style:italic;margin-top:8px;text-align:left;"><strong>In Words:</strong> ${numberToWords(inv.grand_total)}</div>
    </div>
  `;
  document.getElementById('viewInvoiceModal').style.display = 'flex';
}

function downloadCurrentInvoice() {
  const printArea = document.getElementById('invoicePrintArea');
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Invoice</title>
    <style>
      body { font-family: 'Segoe UI', sans-serif; padding: 20px; }
      .print-invoice .pi-header { display: flex; justify-content: space-between; border-bottom: 3px solid #1a237e; padding-bottom: 10px; margin-bottom: 15px; }
      .print-invoice .pi-header h2 { color: #1a237e; }
      .print-invoice .pi-customer { background: #f5f5f5; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: .9em; }
      .print-invoice table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      .print-invoice th { background: #1a237e; color: #fff; padding: 6px 8px; font-size: .8em; text-align: left; }
      .print-invoice td { padding: 5px 8px; border-bottom: 1px solid #ddd; font-size: .85em; }
      .print-invoice .pi-totals { margin-left: auto; width: 250px; }
      .print-invoice .pi-totals div { display: flex; justify-content: space-between; padding: 3px 0; }
      .print-invoice .pi-totals .pi-grand { font-weight: bold; border-top: 2px solid #1a237e; padding-top: 6px; }
      @media print { body { margin: 0; } }
    </style></head><body>${printArea.innerHTML}</body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); }, 300);
}

function printInvoice() {
  const printArea = document.getElementById('invoicePrintArea');
  const invoiceHTML = printArea.innerHTML;
  const copyHTML = (label) => `
    <div class="copy-section">
      <div class="copy-label">${label}</div>
      ${invoiceHTML}
      <div class="invoice-footer">
        <div class="signature-block">
          <div class="signature-line"></div>
          <div>Authorized Signature</div>
        </div>
        <div class="thank-you">Thank you for your business!</div>
      </div>
    </div>
  `;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Print Invoice</title>
    <style>
      @page { size: A4; margin: 8mm 10mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Segoe UI', sans-serif; }
      .copy-section { height: 48vh; overflow: hidden; position: relative; padding: 6px 10px 30px 10px; }
      .copy-label { text-align: right; font-size: 10px; font-weight: bold; color: #888; text-transform: uppercase; margin-bottom: 2px; }
      .cut-line { border: none; border-top: 2px dashed #888; margin: 0; }
      .cut-line-label { text-align: center; font-size: 9px; color: #999; margin: 1px 0; }
      .print-invoice .pi-header { display: flex; justify-content: space-between; border-bottom: 2px solid #1a237e; padding-bottom: 6px; margin-bottom: 8px; }
      .print-invoice .pi-header h2 { color: #1a237e; font-size: 14px; }
      .print-invoice .pi-header h3 { font-size: 12px; }
      .print-invoice .pi-header p { font-size: 9px; color: #555; margin: 1px 0; }
      .print-invoice .pi-customer { background: #f5f5f5; padding: 5px 8px; border-radius: 3px; margin-bottom: 6px; font-size: 10px; }
      .print-invoice table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      .print-invoice th { background: #1a237e; color: #fff; padding: 3px 5px; font-size: 9px; text-align: left; }
      .print-invoice td { padding: 2px 5px; border-bottom: 1px solid #ddd; font-size: 9px; }
      .print-invoice .pi-totals { margin-left: auto; width: 200px; }
      .print-invoice .pi-totals div { display: flex; justify-content: space-between; padding: 1px 0; font-size: 9px; }
      .print-invoice .pi-totals .pi-grand { font-weight: bold; border-top: 2px solid #1a237e; padding-top: 3px; }
      .invoice-footer { position: absolute; bottom: 5px; left: 10px; right: 10px; }
      .signature-block { float: right; text-align: center; font-size: 10px; margin-top: 5px; }
      .signature-line { width: 150px; border-bottom: 1px solid #333; margin-bottom: 3px; height: 25px; }
      .thank-you { clear: both; text-align: center; font-size: 9px; color: #666; font-style: italic; padding-top: 3px; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
      ${copyHTML('Customer Copy')}
      <div class="cut-line-label">✂ - - - - - - - - - - - - - - - - - - - - - - Cut Here - - - - - - - - - - - - - - - - - - - - - - ✂</div>
      <hr class="cut-line">
      ${copyHTML('Seller Copy')}
    </body></html>
  `);
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
  const params = productId ? '?product_id=' + productId : '';
  const logs = await apiFetch('/api/stock-log' + params).then(r => r.json());
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
  const data = await apiFetch(`/api/reports/product-sales?year=${year}&view=${view}`).then(r => r.json());

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
  const data = await apiFetch(`/api/reports/product-sales?year=${year}&view=${view}`).then(r => r.json());
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
  const params = new URLSearchParams({ month, bill_type: billType });
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
  const data = await apiFetch('/api/reports/product-stock-report?month=' + month).then(r => r.json());
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

async function loadBalances() {
  const balances = await apiFetch('/api/customer-balances').then(r => r.json());
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
  const invoices = await apiFetch('/api/customer-balances/' + customerId).then(r => r.json());
  document.getElementById('creditDetailsTitle').textContent = 'Credit Details - ' + name;
  let total = 0;
  document.getElementById('creditDetailsList').innerHTML = invoices.map(inv => {
    total += inv.grand_total;
    return `<tr><td>${inv.invoice_no}</td><td>${inv.invoice_date}</td><td>₹${inv.grand_total.toFixed(2)}</td><td><span class="bill-badge-sm">${inv.bill_type === 'non-gst' ? 'Non-GST' : 'GST'}</span></td><td><button class="btn-sm btn-success" onclick="markAsPaid(${inv.id}, ${customerId}, '${name.replace(/'/g, "\\'")}')" style="font-size:.75em;">✅ Paid</button></td></tr>`;
  }).join('');
  document.getElementById('creditDetailsTotal').textContent = 'Total Credit: ₹' + total.toFixed(2);
  document.getElementById('creditDetailsModal').style.display = 'flex';
}

async function markAsPaid(invoiceId, customerId, customerName) {
  if (!confirm('Mark this invoice as paid?')) return;
  await apiFetch('/api/invoices/' + invoiceId + '/mark-paid', { method: 'PUT' });
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
