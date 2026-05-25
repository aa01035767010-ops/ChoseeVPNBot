// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;

// Configure Telegram UI integration
if (tg) {
  tg.ready();
  tg.expand();
  
  // Set theme colors to match our dark flat design
  try {
    if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#0F0F11');
    if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#0F0F11');
  } catch (e) {
    console.warn('Could not set Telegram header/background colors:', e);
  }
}

// Authorization and environment configuration
const initData = tg?.initData || 'mock_mode_active';
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Telegram ${initData}`
};

// Global App State
let appState = {
  user: null,
  devices: [],
  selectedTopupAmount: 250,
  activeTransactionId: null
};

// --- DOM ELEMENTS ---
const avatarEl = document.getElementById('user-avatar');
const userNameEl = document.getElementById('user-name');
const userHandleEl = document.getElementById('user-handle');
const statusBadgeEl = document.getElementById('subscription-status');
const balanceValEl = document.getElementById('balance-val');
const devicesListContainer = document.getElementById('devices-list-container');
const toastContainer = document.getElementById('toast-container');

// Native Dialogs
const addDeviceDialog = document.getElementById('add-device-dialog');
const topupDialog = document.getElementById('topup-dialog');
const checkoutDialog = document.getElementById('checkout-dialog');

// Modals Open/Close Trigger Buttons
const openAddDeviceBtn = document.getElementById('open-add-device-btn');
const closeAddDialogBtn = document.getElementById('close-add-dialog-btn');
const openTopupBtn = document.getElementById('open-topup-btn');
const closeTopupDialogBtn = document.getElementById('close-topup-dialog-btn');
const cancelPaymentBtn = document.getElementById('cancel-payment-btn');

// Form/Submit inputs
const addDeviceForm = document.getElementById('add-device-form');
const deviceNameInput = document.getElementById('device-name-input');
const customAmountInput = document.getElementById('custom-amount-input');
const quickAmountBtns = document.querySelectorAll('.amount-card');
const checkoutBtn = document.getElementById('checkout-btn');
const confirmPaymentBtn = document.getElementById('confirm-payment-btn');
const checkoutSumValEl = document.getElementById('checkout-sum-val');

// Navigation Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// --- HAPTIC FEEDBACK FALLBACK ---
function triggerHaptic(type = 'impact') {
  if (!tg?.HapticFeedback) return;
  try {
    if (type === 'success') {
      tg.HapticFeedback.notificationOccurred('success');
    } else if (type === 'warning') {
      tg.HapticFeedback.notificationOccurred('warning');
    } else {
      tg.HapticFeedback.impactOccurred('medium');
    }
  } catch (e) {
    console.log('Haptic error ignored:', e);
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icon = type === 'success' ? '✓' : '⚠️';
  toast.innerHTML = `<span class="toast-success-icon">${icon}</span> <span>${message}</span>`;
  
  toastContainer.appendChild(toast);
  
  // Auto-remove toast
  setTimeout(() => {
    toast.style.animation = 'none'; // reset animation
    toast.offsetHeight; // trigger reflow
    toast.style.animation = 'slideUp 0.3s reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2700);
}

// --- CLIPBOARD HELPER ---
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('Clipboard API failed, using fallback:', e);
  }

  // Fallback classic copying
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed'; // Avoid scrolling to bottom
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
}

// --- API ACTIONS ---

// 1. Fetch user data and devices
async function fetchDashboardData() {
  try {
    const response = await fetch('/api/user/profile', { headers });
    if (!response.ok) throw new Error('Failed to load profile');
    
    const data = await response.json();
    appState.user = data.user;
    appState.devices = data.devices;
    
    updateUI();
  } catch (error) {
    console.error('Fetch dashboard error:', error);
    showToast('Ошибка при загрузке данных', 'error');
  }
}

// 2. Add device
async function handleAddDeviceSubmit(e) {
  e.preventDefault();
  const name = deviceNameInput.value.trim();
  if (!name) return;

  // Disable button
  const submitBtn = document.getElementById('submit-device-btn');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Создание...';

  try {
    const response = await fetch('/api/devices', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to add device');
    }

    const newDevice = await response.json();
    
    // Close modal
    addDeviceDialog.close();
    deviceNameInput.value = '';
    
    // Refresh
    await fetchDashboardData();
    
    triggerHaptic('success');
    showToast(`Ключ для «${newDevice.name}» успешно создан!`);
    
    // Copy key instantly to make onboarding even smoother!
    const copied = await copyToClipboard(newDevice.vless_link);
    if (copied) {
      showToast('VLESS-ключ автоматически скопирован в буфер обмена!');
    }
  } catch (error) {
    console.error('Add device error:', error);
    showToast(error.message || 'Ошибка при создании устройства', 'error');
    triggerHaptic('warning');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = 'Создать ключ';
  }
}

// 3. Delete device
async function handleDeleteDevice(deviceId, deviceName) {
  const performDelete = async () => {
    try {
      const response = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers
      });

      if (!response.ok) throw new Error('Failed to delete device');

      await fetchDashboardData();
      triggerHaptic('success');
      showToast(`Устройство «${deviceName}» удалено`);
    } catch (error) {
      console.error('Delete device error:', error);
      showToast('Не удалось удалить устройство', 'error');
      triggerHaptic('warning');
    }
  };

  // Telegram native confirmation popup
  if (tg?.showConfirm) {
    tg.showConfirm(
      `Вы действительно хотите удалить устройство «${deviceName}»? Доступ к VPN на этом устройстве будет сразу заблокирован.`,
      (confirmed) => {
        if (confirmed) performDelete();
      }
    );
  } else {
    // Browser fallback
    if (confirm(`Вы действительно хотите удалить устройство «${deviceName}»?`)) {
      performDelete();
    }
  }
}

// 4. Create transaction and open checkout modal
async function handleCheckout() {
  const amount = parseFloat(customAmountInput.value);
  if (isNaN(amount) || amount < 10) {
    showToast('Минимальная сумма пополнения — 10 ₽', 'error');
    return;
  }

  checkoutBtn.disabled = true;
  checkoutBtn.innerText = 'Секунду...';

  try {
    const response = await fetch('/api/payments/create', {
      method: 'POST',
      headers,
      body: JSON.stringify({ amount })
    });

    if (!response.ok) throw new Error('Failed to initiate transaction');

    const tx = await response.json();
    appState.activeTransactionId = tx.transactionId;

    // Open checkout simulation dialog
    checkoutSumValEl.innerText = `${parseFloat(tx.amount).toFixed(2)} ₽`;
    topupDialog.close();
    checkoutDialog.showModal();
    triggerHaptic();
  } catch (error) {
    console.error('Checkout error:', error);
    showToast('Ошибка платежного сервиса', 'error');
    triggerHaptic('warning');
  } finally {
    checkoutBtn.disabled = false;
    checkoutBtn.innerText = 'Оплатить';
  }
}

// 5. Confirm simulated checkout
async function handleConfirmPayment() {
  if (!appState.activeTransactionId) return;

  confirmPaymentBtn.disabled = true;
  confirmPaymentBtn.innerText = 'Проверка платежа...';

  try {
    const response = await fetch('/api/payments/confirm-mock', {
      method: 'POST',
      headers,
      body: JSON.stringify({ transactionId: appState.activeTransactionId })
    });

    if (!response.ok) throw new Error('Payment confirmation failed');

    const data = await response.json();
    checkoutDialog.close();
    appState.activeTransactionId = null;

    // Refresh state
    await fetchDashboardData();
    triggerHaptic('success');
    showToast(`Баланс успешно пополнен на ${customAmountInput.value} ₽!`);
  } catch (error) {
    console.error('Payment confirmation error:', error);
    showToast('Не удалось подтвердить платеж', 'error');
    triggerHaptic('warning');
  } finally {
    confirmPaymentBtn.disabled = false;
    confirmPaymentBtn.innerText = 'Подтвердить платеж (Симуляция)';
  }
}


// --- UI RENDERING ENGINE ---
function updateUI() {
  const { user, devices } = appState;
  if (!user) return;

  // 1. User Header Details
  userNameEl.innerText = tg?.initDataUnsafe?.user?.first_name || user.username;
  userHandleEl.innerText = tg?.initDataUnsafe?.user?.username ? `@${tg.initDataUnsafe.user.username}` : `@id_${user.id}`;
  
  // Set avatar character
  const initial = (tg?.initDataUnsafe?.user?.first_name || user.username || '?').substring(0, 1).toUpperCase();
  avatarEl.innerText = initial;

  // 2. Subscription Status Badge & Trial Check
  const trialDuration = 2 * 24 * 60 * 60 * 1000;
  const trialEndTime = new Date(user.created_at).getTime() + trialDuration;
  const isTrialActive = trialEndTime > Date.now();
  const isActive = user.balance >= 0 || isTrialActive;

  if (isTrialActive) {
    const formattedTrialEnd = new Date(trialEndTime).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
    statusBadgeEl.innerText = `Тест до ${formattedTrialEnd}`;
    statusBadgeEl.className = 'status-badge active';
  } else if (isActive) {
    statusBadgeEl.innerText = 'Активен';
    statusBadgeEl.className = 'status-badge active';
  } else {
    statusBadgeEl.innerText = 'Заблокирован';
    statusBadgeEl.className = 'status-badge inactive';
  }

  // 3. Balance
  balanceValEl.innerText = `${parseFloat(user.balance).toFixed(2)} ₽`;

  // 4. Device list render
  devicesListContainer.innerHTML = '';
  
  if (devices.length === 0) {
    devicesListContainer.innerHTML = `
      <div class="empty-state">
        <h4>У вас пока нет устройств</h4>
        <p>Нажмите кнопку «Добавить», чтобы создать ваше первое устройство и сгенерировать VLESS-Reality ключ доступа к VPN.</p>
      </div>
    `;
    return;
  }

  devices.forEach(device => {
    const card = document.createElement('div');
    card.className = 'device-card';
    
    // Mask VLESS link for clean layout
    const maskedLink = device.vless_link.substring(0, 30) + '...';

    // Format Expiration Date
    const formattedExpiry = new Date(device.expires_at).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });

    card.innerHTML = `
      <div class="device-top">
        <div class="device-title">
          <div class="device-icon-container">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="icon">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-6 18.75h12" />
            </svg>
          </div>
          <div class="device-title-meta" style="display: flex; flex-direction: column; align-items: flex-start;">
            <span>${escapeHtml(device.name)}</span>
            <span style="font-size: 11px; color: var(--text-secondary); opacity: 0.8; font-weight: normal; margin-top: 1px;">
              Доступ до: ${formattedExpiry}
            </span>
          </div>
        </div>
        <button class="btn btn-danger-flat btn-sm delete-btn" data-id="${device.id}" data-name="${escapeHtml(device.name)}">
          Удалить
        </button>
      </div>
      <div class="device-key-container">
        <span class="device-key-masked">${maskedLink}</span>
        <button class="btn btn-primary btn-sm copy-btn" data-link="${device.vless_link}">
          Копировать
        </button>
      </div>
    `;

    devicesListContainer.appendChild(card);
  });

  // Bind inside-list dynamic buttons
  bindDynamicButtons();
}

// Helper to escape HTML tags to prevent XSS
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Bind VLESS Copy and Delete operations in generated device cards
function bindDynamicButtons() {
  // Copy Buttons
  const copyButtons = devicesListContainer.querySelectorAll('.copy-btn');
  copyButtons.forEach(btn => {
    btn.onclick = async () => {
      const vlessLink = btn.getAttribute('data-link');
      const copied = await copyToClipboard(vlessLink);
      
      if (copied) {
        triggerHaptic('success');
        showToast('VLESS-ключ успешно скопирован!');
      } else {
        showToast('Не удалось скопировать ключ', 'error');
        triggerHaptic('warning');
      }
    };
  });

  // Delete Buttons
  const deleteButtons = devicesListContainer.querySelectorAll('.delete-btn');
  deleteButtons.forEach(btn => {
    btn.onclick = () => {
      const deviceId = btn.getAttribute('data-id');
      const deviceName = btn.getAttribute('data-name');
      handleDeleteDevice(deviceId, deviceName);
    };
  });
}


// --- INTERACTIVE EVENT BINDINGS ---

// 1. Navigation Tab Switching
tabButtons.forEach(button => {
  button.onclick = () => {
    triggerHaptic();
    
    // Remove active state
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));
    
    // Set active state
    button.classList.add('active');
    const targetTabId = button.getAttribute('data-tab');
    document.getElementById(targetTabId).classList.add('active');
  };
});

// 2. Add Device Modal Opening/Closing
openAddDeviceBtn.onclick = () => {
  triggerHaptic();
  addDeviceDialog.showModal();
};

closeAddDialogBtn.onclick = () => {
  triggerHaptic();
  addDeviceDialog.close();
  deviceNameInput.value = '';
};

// 3. Top Up Modal Opening/Closing
openTopupBtn.onclick = () => {
  triggerHaptic();
  topupDialog.showModal();
};

closeTopupDialogBtn.onclick = () => {
  triggerHaptic();
  topupDialog.close();
};

// 4. Quick Amount Choices
quickAmountBtns.forEach(btn => {
  btn.onclick = () => {
    triggerHaptic();
    quickAmountBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const val = btn.getAttribute('data-val');
    customAmountInput.value = val;
    appState.selectedTopupAmount = parseInt(val);
  };
});

customAmountInput.oninput = () => {
  // Clear active quick amount styling if custom number is entered
  const val = parseInt(customAmountInput.value);
  quickAmountBtns.forEach(btn => {
    const btnVal = parseInt(btn.getAttribute('data-val'));
    if (btnVal === val) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
};

// 5. Forms and Payment Submits
addDeviceForm.onsubmit = handleAddDeviceSubmit;
checkoutBtn.onclick = handleCheckout;
confirmPaymentBtn.onclick = handleConfirmPayment;

cancelPaymentBtn.onclick = () => {
  triggerHaptic();
  checkoutDialog.close();
  appState.activeTransactionId = null;
  // Go back to topup screen
  topupDialog.showModal();
};


// --- INITIAL STARTUP ---
fetchDashboardData();
