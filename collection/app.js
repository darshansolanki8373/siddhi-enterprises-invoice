const API = window.location.origin;
let TOKEN = localStorage.getItem('col_token') || '';
let customers = [];
let balances = [];
let currentCustomerId = null;
let currentBrand = 'pushp';

// ── Helpers ──
function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }; }

async function api(path, opts = {}) {
  const res = await fetch(API + path, { ...opts, headers: headers() });
  if (res.status === 401) { logout(); throw new Error('Unauthorized'); }
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}

function $(id) { return document.getElementById(id); }
function formatCurrency(n) { return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}

// ── Auth ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('loginUser').value.trim(), password: $('loginPass').value })
    });
    TOKEN = data.token;
    localStorage.setItem('col_token', TOKEN);
    showScreen('appScreen');
    loadData();
  } catch (err) {
    showToast('Login failed: ' + err.message);
  }
});

function logout() {
  TOKEN = '';
  localStorage.removeItem('col_token');
  showScreen('loginScreen');
}
$('btnLogout').addEventListener('click', logout);

// ── Brand Tabs ──
document.querySelectorAll('.brand-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.brand-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentBrand = tab.dataset.brand;
    loadBalances();
  });
});

// ── Data Loading ──
async function loadData() {
  try {
    customers = await api('/api/customers');
    populateCustomerFilter();
    await loadBalances();
  } catch (err) {
    showToast('Error loading data');
  }
}

function populateCustomerFilter() {
  const sel = $('filterCustomer');
  sel.innerHTML = '<option value="">All Customers</option>';
  customers.forEach(c => {
    sel.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
}

async function loadBalances() {
  const custId = $('filterCustomer').value;
  const fromDate = $('filterFrom').value;
  const toDate = $('filterTo').value;

  // Get all customer balances
  let allBalances = await api('/api/customer-balances?brand=' + currentBrand);

  // Apply filters
  if (custId) {
    allBalances = allBalances.filter(b => b.id === Number(custId));
  }

  // For date filtering, we need to get invoices and recalculate
  if (fromDate || toDate) {
    let params = new URLSearchParams();
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    params.set('brand', currentBrand);

    // Get all invoices within the date range
    const invoices = await api('/api/invoices?' + params.toString());

    // Group by customer and recalculate pending
    const custMap = {};
    invoices.forEach(inv => {
      const pending = inv.grand_total - inv.amount_paid;
      if (pending <= 0) return;
      if (!custMap[inv.customer_id]) {
        custMap[inv.customer_id] = {
          id: inv.customer_id,
          name: inv.customer_name,
          mob_no: inv.customer_mob,
          total_credit: 0,
          invoice_count: 0
        };
      }
      custMap[inv.customer_id].total_credit += pending;
      custMap[inv.customer_id].invoice_count++;
    });

    allBalances = Object.values(custMap);
    if (custId) {
      allBalances = allBalances.filter(b => b.id === Number(custId));
    }
  }

  balances = allBalances;
  renderBalances();
}

function renderBalances() {
  const totalPending = balances.reduce((s, b) => s + b.total_credit, 0);
  $('summaryTotal').textContent = formatCurrency(totalPending);
  $('summaryCount').textContent = balances.length;

  const list = $('customerList');
  if (balances.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No pending amounts!</p></div>';
    return;
  }

  list.innerHTML = balances.map(b => `
    <div class="customer-item" data-id="${b.id}">
      <div>
        <div class="cust-name">${b.name}</div>
        <div class="cust-mob">${b.mob_no || ''}</div>
      </div>
      <div>
        <div class="cust-balance">${formatCurrency(b.total_credit)}</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.customer-item').forEach(el => {
    el.addEventListener('click', () => openCustomerDetail(Number(el.dataset.id)));
  });
}

// ── Customer Detail ──
async function openCustomerDetail(custId) {
  currentCustomerId = custId;
  const cust = customers.find(c => c.id === custId);
  const pendingInvoices = await api(`/api/customer-balances/${custId}?brand=${currentBrand}`);

  $('customerList').classList.add('hidden');
  $('filterCustomer').closest('.filters-bar').classList.add('hidden');
  $('summaryTotal').closest('.summary-cards').classList.add('hidden');

  const detail = $('customerDetail');
  detail.classList.remove('hidden');

  const totalPending = pendingInvoices.reduce((s, inv) => s + inv.credit_remaining, 0);

  $('detailHeader').innerHTML = `
    <h3>${cust ? cust.name : 'Customer'}</h3>
    <div style="font-size:13px;color:var(--text-light)">${cust?.mob_no || ''} ${cust?.address ? '· ' + cust.address : ''}</div>
    <div class="balance-big">${formatCurrency(totalPending)} pending</div>
    <div style="font-size:13px;color:var(--text-light)">${pendingInvoices.length} unpaid invoice(s)</div>
  `;

  $('invoiceList').innerHTML = pendingInvoices.map(inv => `
    <div class="invoice-item" data-id="${inv.id}">
      <div class="inv-top">
        <span class="inv-no">Invoice #${inv.invoice_no}</span>
        <span class="inv-date">${formatDate(inv.invoice_date)}</span>
      </div>
      <div class="inv-amounts">
        <div><div class="label">Bill Total</div><div class="value">${formatCurrency(inv.grand_total)}</div></div>
        <div><div class="label">Paid</div><div class="value" style="color:var(--success)">${formatCurrency(inv.amount_paid)}</div></div>
        <div class="pending"><div class="label">Pending</div><div class="value">${formatCurrency(inv.credit_remaining)}</div></div>
      </div>
      <div class="inv-actions">
        <button class="btn-view" onclick="viewInvoice(${inv.id})"><i class="fas fa-eye"></i> View</button>
        <button class="btn-pay-partial" onclick="openPaymentModal(${inv.id}, ${inv.invoice_no}, ${inv.grand_total}, ${inv.amount_paid}, ${inv.credit_remaining})">Partial</button>
        <button class="btn-pay-full" onclick="markFullPaid(${inv.id}, ${inv.credit_remaining})">Paid</button>
      </div>
    </div>
  `).join('');
}

function goBack() {
  $('customerDetail').classList.add('hidden');
  $('customerList').classList.remove('hidden');
  $('filterCustomer').closest('.filters-bar').classList.remove('hidden');
  $('summaryTotal').closest('.summary-cards').classList.remove('hidden');
  loadBalances();
}
$('btnBack').addEventListener('click', goBack);

// ── Payments ──
let modalInvoiceId = null;
let modalRemaining = 0;

function openPaymentModal(invoiceId, invoiceNo, grandTotal, amountPaid, remaining) {
  modalInvoiceId = invoiceId;
  modalRemaining = remaining;

  $('paymentInfo').innerHTML = `
    <div class="pi-row"><span>Invoice #${invoiceNo}</span></div>
    <div class="pi-row"><span>Bill Total</span><span>${formatCurrency(grandTotal)}</span></div>
    <div class="pi-row"><span>Already Paid</span><span>${formatCurrency(amountPaid)}</span></div>
    <div class="pi-row highlight"><span>Pending</span><span>${formatCurrency(remaining)}</span></div>
  `;
  $('partialAmount').value = '';
  $('partialAmount').max = remaining;
  $('paymentDate').value = new Date().toISOString().slice(0, 10);
  $('paymentModal').classList.remove('hidden');
}

$('btnCloseModal').addEventListener('click', () => $('paymentModal').classList.add('hidden'));
$('paymentModal').addEventListener('click', (e) => { if (e.target === $('paymentModal')) $('paymentModal').classList.add('hidden'); });

$('btnMarkFull').addEventListener('click', async () => {
  await recordPayment(modalInvoiceId, modalRemaining);
  $('paymentModal').classList.add('hidden');
});

$('btnPayPartial').addEventListener('click', async () => {
  const amount = parseFloat($('partialAmount').value);
  if (!amount || amount <= 0) return showToast('Enter a valid amount');
  if (amount > modalRemaining) return showToast('Amount exceeds pending balance');
  await recordPayment(modalInvoiceId, amount);
  $('paymentModal').classList.add('hidden');
});

async function markFullPaid(invoiceId, remaining) {
  if (!confirm(`Mark ₹${remaining.toLocaleString('en-IN')} as paid?`)) return;
  await recordPayment(invoiceId, remaining);
}

async function recordPayment(invoiceId, amount) {
  try {
    const payment_date = $('paymentDate')?.value || new Date().toISOString().slice(0, 10);
    await api(`/api/invoices/${invoiceId}/mark-paid`, {
      method: 'PUT',
      body: JSON.stringify({ amount, payment_date })
    });
    showToast('Payment recorded ✓');
    openCustomerDetail(currentCustomerId);
  } catch (err) {
    showToast('Error: ' + err.message);
  }
}

// ── View Invoice ──
async function viewInvoice(invoiceId) {
  try {
    const [inv, payments] = await Promise.all([
      api(`/api/invoices/${invoiceId}`),
      api(`/api/invoices/${invoiceId}/payments`)
    ]);
    const pending = inv.grand_total - inv.amount_paid;
    const paymentHistoryHtml = payments.length ? `
      <div class="inv-detail-section">
        <h4>Payment History</h4>
        ${payments.map(p => `
          <div class="inv-detail-row">
            <span>${formatDate(p.payment_date)}</span>
            <span style="color:var(--success);font-weight:600">${formatCurrency(p.amount)}</span>
          </div>
        `).join('')}
      </div>
    ` : '';
    $('invoiceDetail').innerHTML = `
      <div class="inv-detail-section">
        <div class="inv-detail-row"><span>Invoice #</span><span>${inv.invoice_no}</span></div>
        <div class="inv-detail-row"><span>Date</span><span>${formatDate(inv.invoice_date)}</span></div>
        <div class="inv-detail-row"><span>Customer</span><span>${inv.customer_name}</span></div>
        <div class="inv-detail-row"><span>Type</span><span>${inv.bill_type?.toUpperCase()}</span></div>
        <div class="inv-detail-row"><span>Payment</span><span>${inv.payment_mode}</span></div>
      </div>
      <div class="inv-detail-section">
        <h4>Items</h4>
        <table class="inv-items-table">
          <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
          <tbody>${inv.items.map(it => `<tr><td>${it.product_name} (${it.packaging})</td><td>${it.quantity}</td><td>${formatCurrency(it.price)}</td><td>${formatCurrency(it.amount)}</td></tr>`).join('')}</tbody>
        </table>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-row"><span>Subtotal</span><span>${formatCurrency(inv.subtotal)}</span></div>
        ${inv.cgst_total ? `<div class="inv-detail-row"><span>CGST (${inv.cgst_rate}%)</span><span>${formatCurrency(inv.cgst_total)}</span></div>` : ''}
        ${inv.sgst_total ? `<div class="inv-detail-row"><span>SGST (${inv.sgst_rate}%)</span><span>${formatCurrency(inv.sgst_total)}</span></div>` : ''}
        ${inv.discount_total ? `<div class="inv-detail-row"><span>Discount (${inv.discount_rate}%)</span><span>-${formatCurrency(inv.discount_total)}</span></div>` : ''}
        <div class="inv-detail-row total"><span>Grand Total</span><span>${formatCurrency(inv.grand_total)}</span></div>
        <div class="inv-detail-row"><span>Paid</span><span style="color:var(--success)">${formatCurrency(inv.amount_paid)}</span></div>
        <div class="inv-detail-row"><span>Pending</span><span style="color:var(--danger);font-weight:700">${formatCurrency(pending)}</span></div>
      </div>
      ${paymentHistoryHtml}
    `;
    $('invoiceModal').classList.remove('hidden');
  } catch (err) {
    showToast('Error loading invoice');
  }
}
$('btnCloseInvoice').addEventListener('click', () => $('invoiceModal').classList.add('hidden'));
$('invoiceModal').addEventListener('click', (e) => { if (e.target === $('invoiceModal')) $('invoiceModal').classList.add('hidden'); });

// ── Filter ──
$('btnApplyFilter').addEventListener('click', loadBalances);

// ── Init ──
if (TOKEN) {
  showScreen('appScreen');
  loadData();
} else {
  showScreen('loginScreen');
}
