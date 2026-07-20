// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', err));
  });
}

// Initial Default Subscriptions (Includes both Monthly and Yearly subscriptions!)
const INITIAL_SUBSCRIPTIONS = [
  {
    id: "sub_1",
    name: "Netflix",
    price: 390,
    cycle: "monthly",
    nextDate: getFutureDateStr(2),
    category: "娛樂",
    icon: "🎬",
    payment: "玉山信用卡",
    notes: "月繳家庭方案"
  },
  {
    id: "sub_2",
    name: "Disney+ 年繳",
    price: 3280,
    cycle: "yearly",
    nextDate: getFutureDateStr(24),
    category: "娛樂",
    icon: "🏰",
    payment: "國泰信用卡",
    notes: "年繳優惠方案"
  },
  {
    id: "sub_3",
    name: "Nintendo Switch Online",
    price: 1080,
    cycle: "yearly",
    nextDate: getFutureDateStr(60),
    category: "娛樂",
    icon: "🎮",
    payment: "PayPal",
    notes: "個人年繳"
  },
  {
    id: "sub_4",
    name: "ChatGPT Plus",
    price: 650,
    cycle: "monthly",
    nextDate: getFutureDateStr(1),
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
let currentFilter = 'all';

// DOM Elements
const monthlyTotalEl = document.getElementById('monthly-total');
const yearlyTotalEl = document.getElementById('yearly-total');
const activeCountEl = document.getElementById('active-count');
const currencySelect = document.getElementById('global-currency');
const subListContainer = document.getElementById('sub-list-container');
const filterBtns = document.querySelectorAll('.filter-btn');
const btnNotification = document.getElementById('btn-notification');

// Modal Elements
const subModal = document.getElementById('sub-modal');
const subForm = document.getElementById('sub-form');
const modalHeading = document.getElementById('modal-heading');
const btnOpenAdd = document.getElementById('btn-open-add');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnRenewSub = document.getElementById('btn-renew-sub');
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

// Web Notification API (iOS 16.4+ PWA Supported)
function checkNotificationPermission() {
  if (!('Notification' in window)) {
    btnNotification.style.display = 'none';
    return;
  }
  if (Notification.permission === 'granted') {
    btnNotification.textContent = '🔔 通知已啟用';
    btnNotification.classList.add('active');
  } else {
    btnNotification.textContent = '🔔 啟用扣款通知';
    btnNotification.classList.remove('active');
  }
}

btnNotification.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    alert('您的瀏覽器或設備暫不支援網頁通知。若在 iPhone 上，請先將此 App「加入主畫面」後開啟。');
    return;
  }
  
  if (Notification.permission === 'granted') {
    triggerUpcomingNotifications(true);
  } else {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      checkNotificationPermission();
      triggerUpcomingNotifications(true);
      alert('已成功開啟 iPhone 扣款提醒通知！當有扣款在 3 天內到期時，會自動彈出通知。');
    } else {
      alert('無法開啟通知：權限已被拒絕。在 iPhone 上，需先新增至主畫面，且於設定中允許 Safar/PWA 通知。');
    }
  }
});

function triggerUpcomingNotifications(forceTest = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  // Find subscriptions due within 3 days
  const urgentItems = subscriptions.filter(sub => {
    const days = getDaysRemaining(sub.nextDate);
    return days >= 0 && days <= 3;
  });

  if (urgentItems.length > 0) {
    urgentItems.forEach(sub => {
      const days = getDaysRemaining(sub.nextDate);
      const dayText = days === 0 ? '今日' : `${days} 天後`;
      
      const title = `🔔 扣款提醒：${sub.name}`;
      const options = {
        body: `${sub.name} 將於 ${dayText} (${sub.nextDate}) 扣款 ${globalCurrency} ${sub.price}！`,
        icon: './icon.svg',
        badge: './icon.svg',
        tag: `sub-due-${sub.id}-${sub.nextDate}`
      };
      
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
          reg.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    });
  } else if (forceTest) {
    const title = '🔔 SubTracker 扣款通知功能正常';
    const options = {
      body: '目前沒有即將到期的扣款項目。當有訂閱將於 3 天內到期時，系統會自動跳出通知提醒您！',
      icon: './icon.svg'
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, options));
    } else {
      new Notification(title, options);
    }
  }
}

// Save State
function saveState() {
  localStorage.setItem('sub_tracker_items', JSON.stringify(subscriptions));
  localStorage.setItem('sub_tracker_currency', globalCurrency);
  render();
  triggerUpcomingNotifications(false);
}

// Calculate days remaining
function getDaysRemaining(nextDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(nextDateStr);
  target.setHours(0, 0, 0, 0);
  const diffTime = target - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Filter Tabs Event
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

// Render Dashboard & List
function render() {
  currencySelect.value = globalCurrency;
  
  // Sort by next billing date
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
  
  const filteredSubs = subscriptions.filter(sub => {
    if (currentFilter === 'monthly') return sub.cycle === 'monthly';
    if (currentFilter === 'yearly') return sub.cycle === 'yearly';
    return true;
  });
  
  subListContainer.innerHTML = '';
  
  if (filteredSubs.length === 0) {
    subListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>此分類下無任何訂閱項目</p>
        <p style="font-size: 0.8rem;">點擊右上角「+ 新增訂閱」來新增開銷。</p>
      </div>
    `;
    return;
  }
  
  filteredSubs.forEach(sub => {
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
    
    let cycleTagHtml = '';
    let equivMonthlyHtml = '';
    
    if (sub.cycle === 'yearly') {
      cycleTagHtml = `<span class="cycle-tag yearly">🌟 年繳</span>`;
      const monthlyEquiv = Math.round((parseFloat(sub.price) || 0) / 12);
      equivMonthlyHtml = `<span class="sub-equiv-monthly">(約 ${globalCurrency} ${monthlyEquiv}/月)</span>`;
    }
    
    const cycleText = sub.cycle === 'monthly' ? '/月' : sub.cycle === 'yearly' ? '/年' : '/週';
    
    const item = document.createElement('div');
    item.className = `sub-item ${sub.cycle === 'yearly' ? 'yearly-card' : ''}`;
    item.innerHTML = `
      <div class="sub-logo">${sub.icon || '💳'}</div>
      <div class="sub-details">
        <div class="sub-name-row">
          <span class="sub-name">${sub.name}</span>
          ${cycleTagHtml}
          ${badgeHtml}
        </div>
        <div class="sub-meta">
          下期扣款日：${sub.nextDate} ${sub.payment ? '• ' + sub.payment : ''}
        </div>
      </div>
      <div class="sub-price-col">
        <span class="sub-price">${globalCurrency} ${sub.price}</span>
        <span class="sub-cycle">${cycleText}</span>
        ${equivMonthlyHtml}
      </div>
    `;
    
    item.addEventListener('click', () => openEditModal(sub));
    subListContainer.appendChild(item);
  });
}

currencySelect.addEventListener('change', (e) => {
  globalCurrency = e.target.value;
  saveState();
});

document.querySelectorAll('.preset-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    openAddModal({
      name: chip.dataset.name,
      price: chip.dataset.price,
      cycle: chip.dataset.cycle || 'monthly',
      icon: chip.dataset.icon,
      category: chip.dataset.category,
      nextDate: getFutureDateStr(chip.dataset.cycle === 'yearly' ? 365 : 30)
    });
  });
});

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
  
  btnRenewSub.style.display = 'none';
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
  
  btnRenewSub.textContent = sub.cycle === 'yearly' ? '🔄 完成扣款 (續訂一年)' : '🔄 完成扣款 (續訂一月)';
  btnRenewSub.style.display = 'block';
  btnDeleteSub.style.display = 'block';
  subModal.style.display = 'flex';
}

function closeModal() {
  subModal.style.display = 'none';
}

btnOpenAdd.addEventListener('click', () => openAddModal());
btnCloseModal.addEventListener('click', closeModal);

btnRenewSub.addEventListener('click', () => {
  const id = subIdInput.value;
  if (!id) return;
  const idx = subscriptions.findIndex(s => s.id === id);
  if (idx !== -1) {
    const currentSub = subscriptions[idx];
    const currentDate = new Date(currentSub.nextDate || new Date());
    
    if (currentSub.cycle === 'yearly') {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    } else if (currentSub.cycle === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    currentSub.nextDate = currentDate.toISOString().split('T')[0];
    saveState();
    closeModal();
    alert(`已順延「${currentSub.name}」扣款日期至：${currentSub.nextDate}`);
  }
});

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
    const idx = subscriptions.findIndex(s => s.id === id);
    if (idx !== -1) subscriptions[idx] = newItem;
  } else {
    subscriptions.push(newItem);
  }
  
  saveState();
  closeModal();
});

btnDeleteSub.addEventListener('click', () => {
  const id = subIdInput.value;
  if (!id) return;
  if (confirm('確定要刪除這個訂閱項目嗎？')) {
    subscriptions = subscriptions.filter(s => s.id !== id);
    saveState();
    closeModal();
  }
});

btnExport.addEventListener('click', () => {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(subscriptions, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `sub-tracker-backup-${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
});

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
window.addEventListener('load', () => {
  render();
  checkNotificationPermission();
  triggerUpcomingNotifications(false);
});
