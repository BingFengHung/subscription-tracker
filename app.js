// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('Service Worker registered', reg))
      .catch(err => console.error('Service Worker registration failed', reg));
  });
}

// Default Subscriptions & Utility Bills
const INITIAL_SUBSCRIPTIONS = [
  {
    id: "sub_1",
    name: "中華電信 5G 電話費",
    price: 599,
    cycle: "monthly",
    nextDate: getFutureDateStr(3),
    category: "電信與通訊",
    icon: "📱",
    payment: "自動轉帳扣繳",
    notes: "含行動上網吃到飽"
  },
  {
    id: "sub_2",
    name: "台灣電力公司 (電費)",
    price: 1450,
    cycle: "bimonthly",
    nextDate: getFutureDateStr(14),
    category: "生活帳單",
    icon: "⚡",
    payment: "超商條碼繳費",
    notes: "雙月繳帳單"
  },
  {
    id: "sub_3",
    name: "月租停車位",
    price: 2500,
    cycle: "monthly",
    nextDate: getFutureDateStr(8),
    category: "交通與停車",
    icon: "🚗",
    payment: "轉帳至房東帳戶",
    notes: "地下室 B2-52 號車位"
  },
  {
    id: "sub_4",
    name: "Netflix",
    price: 390,
    cycle: "monthly",
    nextDate: getFutureDateStr(5),
    category: "娛樂",
    icon: "🎬",
    payment: "玉山信用卡",
    notes: "月繳家庭方案"
  },
  {
    id: "sub_5",
    name: "Disney+ 年繳",
    price: 3280,
    cycle: "yearly",
    nextDate: getFutureDateStr(45),
    category: "娛樂",
    icon: "🏰",
    payment: "國泰信用卡",
    notes: "年繳優惠方案"
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
let currentFilter = 'all'; // 'all', 'bills', 'monthly', 'yearly'

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
      alert('已成功開啟 iPhone 扣款與繳費提醒通知！');
    } else {
      alert('無法開啟通知：權限已被拒絕。在 iPhone 上，需先新增至主畫面，且於設定中允許 Safari/PWA 通知。');
    }
  }
});

function triggerUpcomingNotifications(forceTest = false) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const urgentItems = subscriptions.filter(sub => {
    const days = getDaysRemaining(sub.nextDate);
    return days >= 0 && days <= 3;
  });

  if (urgentItems.length > 0) {
    urgentItems.forEach(sub => {
      const days = getDaysRemaining(sub.nextDate);
      const dayText = days === 0 ? '今日截止' : `${days} 天後到期`;
      
      const title = `🔔 繳費/扣款提醒：${sub.name}`;
      const options = {
        body: `${sub.name} 將於 ${dayText} (${sub.nextDate}) 扣繳 ${globalCurrency} ${sub.price}！`,
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
    const title = '🔔 SubTracker 繳費通知功能正常';
    const options = {
      body: '目前沒有即將到期的帳單或訂閱。當有帳單將於 3 天內到期時，系統會自動跳出通知提醒您！',
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
    } else if (sub.cycle === 'bimonthly') {
      monthlyTotal += price / 2; // Bi-monthly (every 2 months)
      yearlyTotal += price * 6;
    } else if (sub.cycle === 'yearly') {
      monthlyTotal += price / 12;
      yearlyTotal += price;
    } else if (sub.cycle === 'weekly') {
      monthlyTotal += price * 4.33;
      yearlyTotal += price * 52;
    } else if (sub.cycle === 'one-time') {
      // One time bills due this month count to monthly total
      const days = getDaysRemaining(sub.nextDate);
      if (days >= 0 && days <= 30) {
        monthlyTotal += price;
      }
      yearlyTotal += price;
    }
  });
  
  monthlyTotalEl.textContent = `${globalCurrency} ${Math.round(monthlyTotal).toLocaleString()}`;
  yearlyTotalEl.textContent = `${globalCurrency} ${Math.round(yearlyTotal).toLocaleString()}`;
  activeCountEl.textContent = `${subscriptions.length} 項`;
  
  const filteredSubs = subscriptions.filter(sub => {
    if (currentFilter === 'bills') {
      return ['生活帳單', '電信與通訊', '交通與停車', '稅金與規費'].includes(sub.category) || sub.cycle === 'bimonthly' || sub.cycle === 'one-time';
    }
    if (currentFilter === 'monthly') return sub.cycle === 'monthly';
    if (currentFilter === 'yearly') return sub.cycle === 'yearly';
    return true;
  });
  
  subListContainer.innerHTML = '';
  
  if (filteredSubs.length === 0) {
    subListContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💳</div>
        <p>此分類下無任何帳單或訂閱項目</p>
        <p style="font-size: 0.8rem;">點擊右上角「+ 新增項目」來記錄開銷。</p>
      </div>
    `;
    return;
  }
  
  filteredSubs.forEach(sub => {
    const days = getDaysRemaining(sub.nextDate);
    let badgeHtml = '';
    
    if (days < 0) {
      badgeHtml = `<span class="due-badge urgent">已到期/逾期 (${Math.abs(days)}天前)</span>`;
    } else if (days === 0) {
      badgeHtml = `<span class="due-badge urgent">🚨 今日截止</span>`;
    } else if (days <= 3) {
      badgeHtml = `<span class="due-badge urgent">⚠️ ${days}天後截止</span>`;
    } else if (days <= 7) {
      badgeHtml = `<span class="due-badge soon">下週到期 (${days}天)</span>`;
    } else {
      badgeHtml = `<span class="due-badge normal">${days}天後到期</span>`;
    }
    
    let cycleTagHtml = '';
    let equivMonthlyHtml = '';
    
    if (sub.cycle === 'yearly') {
      cycleTagHtml = `<span class="cycle-tag yearly">🌟 年繳</span>`;
      const monthlyEquiv = Math.round((parseFloat(sub.price) || 0) / 12);
      equivMonthlyHtml = `<span class="sub-equiv-monthly">(約 ${globalCurrency} ${monthlyEquiv}/月)</span>`;
    } else if (sub.cycle === 'bimonthly') {
      cycleTagHtml = `<span class="cycle-tag yearly" style="background:rgba(0,242,254,0.2); color:#00f2fe; border-color:rgba(0,242,254,0.4);">⚡ 雙月繳</span>`;
      const monthlyEquiv = Math.round((parseFloat(sub.price) || 0) / 2);
      equivMonthlyHtml = `<span class="sub-equiv-monthly">(約 ${globalCurrency} ${monthlyEquiv}/月)</span>`;
    } else if (sub.cycle === 'one-time') {
      cycleTagHtml = `<span class="cycle-tag yearly" style="background:rgba(255,159,67,0.2); color:#ff9f43; border-color:rgba(255,159,67,0.4);">📌 單次帳單</span>`;
    }
    
    let cycleText = '/月';
    if (sub.cycle === 'yearly') cycleText = '/年';
    else if (sub.cycle === 'bimonthly') cycleText = '/兩月';
    else if (sub.cycle === 'weekly') cycleText = '/週';
    else if (sub.cycle === 'one-time') cycleText = ' (單次)';
    
    const item = document.createElement('div');
    item.className = `sub-item ${sub.cycle === 'yearly' ? 'yearly-card' : ''}`;
    item.innerHTML = `
      <div class="sub-logo">${sub.icon || '📄'}</div>
      <div class="sub-details">
        <div class="sub-name-row">
          <span class="sub-name">${sub.name}</span>
          ${cycleTagHtml}
          ${badgeHtml}
        </div>
        <div class="sub-meta">
          繳費日：${sub.nextDate} ${sub.payment ? '• ' + sub.payment : ''}
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
    const cycle = chip.dataset.cycle || 'monthly';
    let defaultDays = 30;
    if (cycle === 'yearly') defaultDays = 365;
    if (cycle === 'bimonthly') defaultDays = 60;
    if (cycle === 'one-time') defaultDays = 14;

    openAddModal({
      name: chip.dataset.name,
      price: chip.dataset.price,
      cycle: cycle,
      icon: chip.dataset.icon,
      category: chip.dataset.category,
      nextDate: getFutureDateStr(defaultDays)
    });
  });
});

function openAddModal(defaultValues = {}) {
  modalHeading.textContent = '新增帳單 / 訂閱';
  subIdInput.value = '';
  subNameInput.value = defaultValues.name || '';
  subPriceInput.value = defaultValues.price || '';
  subCycleInput.value = defaultValues.cycle || 'monthly';
  subNextDateInput.value = defaultValues.nextDate || getFutureDateStr(30);
  subCategoryInput.value = defaultValues.category || '生活帳單';
  subIconInput.value = defaultValues.icon || '📄';
  subPaymentInput.value = defaultValues.payment || '';
  subNotesInput.value = defaultValues.notes || '';
  
  btnRenewSub.style.display = 'none';
  btnDeleteSub.style.display = 'none';
  subModal.style.display = 'flex';
}

function openEditModal(sub) {
  modalHeading.textContent = '編輯帳單 / 訂閱';
  subIdInput.value = sub.id;
  subNameInput.value = sub.name;
  subPriceInput.value = sub.price;
  subCycleInput.value = sub.cycle;
  subNextDateInput.value = sub.nextDate;
  subCategoryInput.value = sub.category || '生活帳單';
  subIconInput.value = sub.icon || '📄';
  subPaymentInput.value = sub.payment || '';
  subNotesInput.value = sub.notes || '';
  
  if (sub.cycle === 'yearly') {
    btnRenewSub.textContent = '🔄 完成繳費 (順延一年)';
  } else if (sub.cycle === 'bimonthly') {
    btnRenewSub.textContent = '🔄 完成繳費 (順延兩個月)';
  } else if (sub.cycle === 'one-time') {
    btnRenewSub.textContent = '✅ 標記已完成繳納 (從清單移除)';
  } else {
    btnRenewSub.textContent = '🔄 完成繳費 (順延一個月)';
  }
  
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
    
    if (currentSub.cycle === 'one-time') {
      subscriptions.splice(idx, 1);
      saveState();
      closeModal();
      alert(`已將單次帳單「${currentSub.name}」標記為已繳納！`);
      return;
    }

    const currentDate = new Date(currentSub.nextDate || new Date());
    
    if (currentSub.cycle === 'yearly') {
      currentDate.setFullYear(currentDate.getFullYear() + 1);
    } else if (currentSub.cycle === 'bimonthly') {
      currentDate.setMonth(currentDate.getMonth() + 2);
    } else if (currentSub.cycle === 'weekly') {
      currentDate.setDate(currentDate.getDate() + 7);
    } else {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    currentSub.nextDate = currentDate.toISOString().split('T')[0];
    saveState();
    closeModal();
    alert(`已完成繳費！「${currentSub.name}」下期繳費日期已順延至：${currentSub.nextDate}`);
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
    icon: subIconInput.value.trim() || '📄',
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
  if (confirm('確定要刪除這個帳單/訂閱項目嗎？')) {
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
        alert('匯入成功！已還原您的帳單與訂閱清單。');
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
