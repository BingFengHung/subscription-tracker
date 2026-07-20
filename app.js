// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  });
}

// Initial Default Subscriptions if localStorage is empty
const INITIAL_SUBSCRIPTIONS = [
  {
    id: "sub_1",
    name: "Netflix",
    price: 390,
    cycle: "monthly",
    nextDate: getFutureDateStr(5),
    category: "娛樂",
    icon: "🎬",
    payment: "玉山信用卡",
    notes: "家庭方案"
  },
  {
    id: "sub_2",
    name: "Spotify",
    price: 149,
    cycle: "monthly",
    nextDate: getFutureDateStr(12),
    category: "娛樂",
    icon: "🎵",
    payment: "Apple Pay",
    notes: "個人方案"
  },
  {
    id: "sub_3",
    name: "ChatGPT Plus",
    price: 650,
    cycle: "monthly",
    nextDate: getFutureDateStr(2),
    category: "AI/工具",
    icon: "🤖",
    payment: "國泰信用卡",
    notes: "工作與開發用"
  }
];

function getFutureDateStr(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

// State
let subscriptions = JSON.parse(localStorage.getItem('sub_tracker_items')) || INITIAL_SUBSCRIPTIONS;
let globalCurrency = localStorage.getItem('sub_tracker_currency') || 'NT$';

// DOM Elements
const monthlyTotalEl = document.getElementById('monthly-total');
const yearlyTotalEl = document.getElementById('yearly-total');
const activeCountEl = document.getElementById('active-count');
const currencySelect = document.getElementById('global-currency');
const subListContainer = document.getElementById('sub-list-container');

// Modal Elements
const subModal = document.getElementById('sub-modal');
const subForm = document.getElementById('sub-form');
const modalHeading = document.getElementById('modal-heading');
const btnOpenAdd = document.getElementById('btn-open-add');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnDeleteSub = document.getElementById('btn-delete-sub');

// Form Fields
const subIdInput = document.getElementById('sub-id');
const subNameInput = document.getElementById('sub-name');
const subPriceInput = document.getElementById('sub-price');
const subCycleInput = document.getElementById('sub-cycle');
const subNextDateInput = document.getElementById('sub-next-date');
const subCategoryInput = document.getElementById('sub-category');
const subIconInput = document.getElementById('sub-icon');
const subPaymentInput = document.getElementById('sub-payment');
const subNotesInput = document.getElementById('sub-notes');

// Data Tools
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const importFileInput = document.getElementById('import-file-input');

// PWA Elements
const installBtn = document.getElementById('install-btn');
const pwaModal = document.getElementById('pwa-modal');
const modalClose = document.getElementById('modal-close');

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'block';
});

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
if (isIOS) {
  installBtn.style.display = 'block';
}

installBtn.addEventListener('click', () => {
  if (isIOS) {
    pwaModal.style.display = 'flex';
  } else if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => deferredPrompt = null);
  } else {
    alert('您的瀏覽器已安裝或不支援自動安裝，請從 Safari 選單選擇「加入主畫面」。');
  }
});

modalClose.addEventListener('click', () => pwaModal.style.display = 'none');

// Save State to LocalStorage
function saveState() {
  localStorage.setItem('sub_tracker_items', JSON.stringify(subscriptions));
  localStorage.setItem('sub_tracker_currency', globalCurrency);
  render();
}

// Calculate days remaining until next billing
function getDaysRemaining(nextDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(nextDateStr);
  target.setHours(0, 0, 0, 0);
  const diffTime = target - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Render Dashboard & List
function render() {
  currencySelect.value = globalCurrency;
  
  // Sort subscriptions by next billing date (nearest first)
  subscriptions.sort((a, b) => new Date(a.nextDate) - new Date(b.nextDate));
  
  let monthlyTotal = 0;
  let yearlyTotal = 0;
  
  subscriptions.forEach(sub => {
    const price = parseFloat(sub.price) || 0;
    if (sub.cycle === 'monthly') {
      monthlyTotal += price;
      yearlyTotal += price * 12;
    } else if (sub.cycle === 'yearly') {
      monthlyTotal += price / 12;
      yearlyTotal += price;
    } else if (sub.cycle === 'weekly') {
      monthlyTotal += price * 4.33;
      yearlyTotal += price * 52;
    }
  });
  
  monthlyTotalEl.textContent = `${globalCurrency} ${Math.round(monthlyTotal).toLocaleString()}`;
  yearlyTotalEl.textContent = `${globalCurrency} ${Math.round(yearlyTotal).toLocaleString()}`;
  activeCountEl.textContent = `${subscriptions.length} 項`;
  
  // Render List
  subListContainer.innerHTML = '';
  
  if (subscriptions.length === 0) {
    subListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>目前尚無任何訂閱項目</p>
        <p style="font-size: 0.8rem;">點擊右上角「+ 新增訂閱」或下方快捷卡片來新增第一筆開銷。</p>
      </div>
    `;
    return;
  }
  
  subscriptions.forEach(sub => {
    const days = getDaysRemaining(sub.nextDate);
    let badgeHtml = '';
    
    if (days < 0) {
      badgeHtml = `<span class="due-badge urgent">已過期 (${Math.abs(days)}天前)</span>`;
    } else if (days === 0) {
      badgeHtml = `<span class="due-badge urgent">🚨 今日扣款</span>`;
    } else if (days <= 3) {
      badgeHtml = `<span class="due-badge urgent">⚠️ ${days}天後扣款</span>`;
    } else if (days <= 7) {
      badgeHtml = `<span class="due-badge soon">下週扣款 (${days}天)</span>`;
    } else {
      badgeHtml = `<span class="due-badge normal">${days}天後扣款</span>`;
    }
    
    const cycleText = sub.cycle === 'monthly' ? '/月' : sub.cycle === 'yearly' ? '/年' : '/週';
    
    const item = document.createElement('div');
    item.className = 'sub-item';
    item.innerHTML = `
      <div class="sub-logo">${sub.icon || '💳'}</div>
      <div class="sub-details">
        <div class="sub-name-row">
          <span class="sub-name">${sub.name}</span>
          ${badgeHtml}
        </div>
        <div class="sub-meta">
          扣款日：${sub.nextDate} ${sub.payment ? '• ' + sub.payment : ''}
        </div>
      </div>
      <div class="sub-price-col">
        <span class="sub-price">${globalCurrency} ${sub.price}</span>
        <span class="sub-cycle">${cycleText}</span>
      </div>
    `;
    
    item.addEventListener('click', () => openEditModal(sub));
    subListContainer.appendChild(item);
  });
}

// Currency Selector Event
currencySelect.addEventListener('change', (e) => {
  globalCurrency = e.target.value;
  saveState();
});

// Preset Quick Chips Click
document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    openAddModal({
      name: chip.dataset.name,
      price: chip.dataset.price,
      icon: chip.dataset.icon,
      category: chip.dataset.category,
      cycle: 'monthly',
      nextDate: getFutureDateStr(30)
    });
  });
});

// Modal Open/Close Logic
function openAddModal(defaultValues = {}) {
  modalHeading.textContent = '新增訂閱服務';
  subIdInput.value = '';
  subNameInput.value = defaultValues.name || '';
  subPriceInput.value = defaultValues.price || '';
  subCycleInput.value = defaultValues.cycle || 'monthly';
  subNextDateInput.value = defaultValues.nextDate || getFutureDateStr(30);
  subCategoryInput.value = defaultValues.category || '娛樂';
  subIconInput.value = defaultValues.icon || '💳';
  subPaymentInput.value = defaultValues.payment || '';
  subNotesInput.value = defaultValues.notes || '';
  
  btnDeleteSub.style.display = 'none';
  subModal.style.display = 'flex';
}

function openEditModal(sub) {
  modalHeading.textContent = '編輯訂閱服務';
  subIdInput.value = sub.id;
  subNameInput.value = sub.name;
  subPriceInput.value = sub.price;
  subCycleInput.value = sub.cycle;
  subNextDateInput.value = sub.nextDate;
  subCategoryInput.value = sub.category || '娛樂';
  subIconInput.value = sub.icon || '💳';
  subPaymentInput.value = sub.payment || '';
  subNotesInput.value = sub.notes || '';
  
  btnDeleteSub.style.display = 'block';
  subModal.style.display = 'flex';
}

function closeModal() {
  subModal.style.display = 'none';
}

btnOpenAdd.addEventListener('click', () => openAddModal());
btnCloseModal.addEventListener('click', closeModal);

// Form Submit
subForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = subIdInput.value;
  
  const newItem = {
    id: id || 'sub_' + Date.now(),
    name: subNameInput.value.trim(),
    price: parseFloat(subPriceInput.value) || 0,
    cycle: subCycleInput.value,
    nextDate: subNextDateInput.value,
    category: subCategoryInput.value,
    icon: subIconInput.value.trim() || '💳',
    payment: subPaymentInput.value.trim(),
    notes: subNotesInput.value.trim()
  };
  
  if (id) {
    // Update existing
    const idx = subscriptions.findIndex(s => s.id === id);
    if (idx !== -1) subscriptions[idx] = newItem;
  } else {
    // Add new
    subscriptions.push(newItem);
  }
  
  saveState();
  closeModal();
});

// Delete Sub
btnDeleteSub.addEventListener('click', () => {
  const id = subIdInput.value;
  if (!id) return;
  if (confirm('確定要刪除這個訂閱項目嗎？')) {
    subscriptions = subscriptions.filter(s => s.id !== id);
    saveState();
    closeModal();
  }
});

// Export JSON Backup
btnExport.addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(subscriptions, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `sub-tracker-backup-${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

// Import JSON Backup
btnImport.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      if (Array.isArray(importedData)) {
        subscriptions = importedData;
        saveState();
        alert('匯入成功！已還原您的訂閱清單。');
      } else {
        alert('匯入失敗：格式不正確。');
      }
    } catch (err) {
      alert('解析 JSON 檔案時發生錯誤。');
    }
  };
  reader.readAsText(file);
});

// Initial Render
window.addEventListener('load', render);
