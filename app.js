import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const TAB_IDS = ["add", "transactions", "analytics", "budgets", "settings", "savings"];
const CURRENCIES = ["UAH", "USD", "EUR", "PLN", "GEL"];

const DEFAULT_SETTINGS = {
  baseCurrency: "UAH",
  defaultCurrency: "UAH"
};

const DEFAULT_CATEGORY_NAMES = {
  expense: ["Еда", "Аренда", "Транспорт", "Связь", "Здоровье", "Одежда", "Развлечения", "Подписки", "Дом", "Другое"],
  income: ["Зарплата", "Фриланс", "Подарки", "Другое"]
};

const firebaseConfig = {
  apiKey: "AIzaSyCgflrvW39mKvAv5hp9rKeNWK0A3GF5U5s",
  authDomain: "trackerval-f372c.firebaseapp.com",
  projectId: "trackerval-f372c",
  storageBucket: "trackerval-f372c.firebasestorage.app",
  messagingSenderId: "1016179762221",
  appId: "1:1016179762221:web:6cf16e5fdf7fb5ebd204a4"
};

const state = {
  activeTab: "add",
  transactions: [],
  categories: [],
  budgets: [],
  recurring: [],
  savings: [],
  settings: { ...DEFAULT_SETTINGS },
  ui: {
    addType: "expense",
    txFilter: "all",
    txSearch: "",
    txCategoryFilter: "all",
    txMonthFilter: "",
    reportCurrency: "UAH",
    savingsCurrencyFilter: "all",
    savingsKindFilter: "all",
    analyticsMonth: monthKeyOf(new Date()),
    budgetsMonth: monthKeyOf(new Date()),
    ioStatus: "",
    ioText: ""
  }
};

const viewRoot = document.getElementById("view-root");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const modalRoot = document.getElementById("modal-root");
const toastEl = document.getElementById("toast");
const subtitleEl = document.getElementById("header-subtitle");
const authRoot = document.getElementById("auth-root");
const appRoot = document.getElementById("app-root");

let toastTimer = null;
let monthlyChart = null;
let categoryChart = null;
let activeToastAction = null;
let currentUser = null;

const pwaState = {
  swRegistration: null,
  reloading: false
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
let db = null;

try {
  db = initializeFirestore(firebaseApp, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (_err) {
  db = getFirestore(firebaseApp);
}

init();

function init() {
  bindEvents();
  bindAuthEvents();
  hideAppShell();
  showAuthScreen();
  observeAuth();
  setupPwa();
}

function observeAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      hideAuthScreen();
      showAppShell();
      await loadAll();
      render();
      return;
    }

    currentUser = null;
    hideAppShell();
    showAuthScreen();
  });
}

function bindEvents() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.tab;
      if (!TAB_IDS.includes(tab) || tab === state.activeTab) {
        return;
      }
      state.activeTab = tab;
      render();
    });
  });

  viewRoot.addEventListener("click", onViewClick);
  viewRoot.addEventListener("input", onViewInput);
  viewRoot.addEventListener("change", onViewChange);
  viewRoot.addEventListener("submit", onViewSubmit);

  modalRoot.addEventListener("click", onModalClick);
  modalRoot.addEventListener("submit", onModalSubmit);
  toastEl.addEventListener("click", onToastClick);
}

function bindAuthEvents() {
  authRoot.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form.matches("[data-form='sign-in']")) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const statusEl = authRoot.querySelector("#auth-status");

    if (!email || !password) {
      if (statusEl) {
        statusEl.textContent = "Введите email и пароль";
      }
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Вход...";
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (statusEl) {
        statusEl.textContent = "";
      }
    } catch (error) {
      if (statusEl) {
        statusEl.textContent = mapAuthError(error);
      }
    }
  });
}

function mapAuthError(error) {
  const code = String(error && error.code || "");
  if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password") || code.includes("auth/user-not-found")) {
    return "Неверный email или пароль";
  }
  if (code.includes("auth/invalid-email")) {
    return "Некорректный email";
  }
  if (code.includes("auth/too-many-requests")) {
    return "Слишком много попыток. Попробуйте позже";
  }
  return "Не удалось войти. Проверьте интернет и данные";
}

function showAuthScreen() {
  authRoot.innerHTML = `
    <section class="auth-root-inner">
      <article class="glass auth-card">
        <div class="section-title">
          <h2>Вход</h2>
        </div>
        <p class="card-note">Один аккаунт для доступа к данным</p>
        <form class="form-grid" data-form="sign-in">
          <div class="field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
          </div>
          <div class="field">
            <label for="auth-password">Пароль</label>
            <input id="auth-password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required />
          </div>
          <button class="btn-brand" type="submit">Sign in</button>
          <p id="auth-status" class="io-status"></p>
        </form>
      </article>
    </section>
  `;
  authRoot.classList.remove("hidden");
}

function hideAuthScreen() {
  authRoot.classList.add("hidden");
}

function showAppShell() {
  appRoot.classList.remove("hidden");
}

function hideAppShell() {
  appRoot.classList.add("hidden");
}

function onToastClick(event) {
  const target = event.target;
  if (!target.matches("[data-toast-action]")) {
    return;
  }
  if (typeof activeToastAction === "function") {
    activeToastAction();
  }
}

function onViewClick(event) {
  const target = event.target;

  if (target.matches("[data-action='set-add-type']")) {
    state.ui.addType = target.dataset.value === "income" ? "income" : "expense";
    render();
    return;
  }

  if (target.matches("[data-action='quick-add']")) {
    handleQuickAdd();
    return;
  }

  if (target.matches("[data-action='save-transaction']")) {
    handleFormSave();
    return;
  }

  if (target.matches("[data-action='set-filter']")) {
    state.ui.txFilter = target.dataset.value || "all";
    render();
    return;
  }

  if (target.matches("[data-action='delete-transaction']")) {
    const id = Number(target.dataset.id);
    if (Number.isFinite(id)) {
      deleteTransaction(id);
    }
    return;
  }

  if (target.matches("[data-action='edit-transaction']")) {
    const id = Number(target.dataset.id);
    if (Number.isFinite(id)) {
      openTransactionEditModal(id);
    }
    return;
  }

  if (target.matches("[data-action='analytics-refresh']")) {
    if (state.activeTab === "analytics") {
      initAnalyticsCharts();
    }
    showToast("Аналитика обновлена");
    return;
  }

  if (target.matches("[data-action='open-categories']")) {
    openManageCategoriesModal();
    return;
  }

  if (target.matches("[data-action='open-recurring-modal']")) {
    openRecurringModal();
    return;
  }

  if (target.matches("[data-action='delete-recurring']")) {
    const id = target.dataset.id;
    if (id) {
      deleteRecurringRule(id);
    }
    return;
  }

  if (target.matches("[data-action='export-json']")) {
    exportJsonToTextarea();
    return;
  }

  if (target.matches("[data-action='import-json']")) {
    importJsonFromTextarea();
    return;
  }

  if (target.matches("[data-action='reset-all']")) {
    resetAllData();
    return;
  }

  if (target.matches("[data-action='sign-out']")) {
    signOut(auth).catch(() => {
      showToast("Не удалось выйти");
    });
    return;
  }

  if (target.matches("[data-action='budget-clear']")) {
    const categoryId = target.dataset.categoryId;
    const month = target.dataset.month;
    const currency = target.dataset.currency;
    setBudget(month, categoryId, currency, 0);
    render();
    showToast("Бюджет очищен");
    return;
  }

  if (target.matches("[data-action='open-budget-category-modal']")) {
    openBudgetCategoryModal();
    return;
  }

  if (target.matches("[data-action='open-new-category']")) {
    const type = sanitizeType(target.dataset.type || state.ui.addType);
    openManageCategoriesModal(type, "");
    return;
  }

  if (target.matches("[data-action='set-savings-kind-filter']")) {
    state.ui.savingsKindFilter = sanitizeSavingsKindFilter(target.dataset.value);
    render();
    return;
  }

  if (target.matches("[data-action='open-savings-create']")) {
    openSavingsModal("create");
    return;
  }

  if (target.matches("[data-action='edit-savings']")) {
    const id = String(target.dataset.id || "");
    if (id) {
      openSavingsModal("edit", id);
    }
    return;
  }

  if (target.matches("[data-action='edit-savings-rates']")) {
    const id = String(target.dataset.id || "");
    if (id) {
      openSavingsModal("edit", id, "rates");
    }
    return;
  }

  if (target.matches("[data-action='delete-savings']")) {
    const id = String(target.dataset.id || "");
    if (id) {
      deleteSavingsItem(id);
    }
    return;
  }

  if (target.matches("[data-action='savings-add']")) {
    const id = String(target.dataset.id || "");
    if (id) {
      openSavingsFundsModal(id, "add");
    }
    return;
  }

  if (target.matches("[data-action='savings-withdraw']")) {
    const id = String(target.dataset.id || "");
    if (id) {
      openSavingsFundsModal(id, "withdraw");
    }
  }
}

function onViewChange(event) {
  const target = event.target;

  if (target.matches("#analytics-currency") || target.matches("#budgets-currency")) {
    state.ui.reportCurrency = sanitizeCurrency(target.value, state.ui.reportCurrency);
    render();
    return;
  }

  if (target.matches("#analytics-month")) {
    state.ui.analyticsMonth = sanitizeMonthKey(target.value, monthKeyOf(new Date()));
    render();
    return;
  }

  if (target.matches("#budgets-month")) {
    state.ui.budgetsMonth = sanitizeMonthKey(target.value, monthKeyOf(new Date()));
    render();
    return;
  }

  if (target.matches("#tx-category-filter")) {
    state.ui.txCategoryFilter = String(target.value || "all");
    render();
    return;
  }

  if (target.matches("#tx-month-filter")) {
    state.ui.txMonthFilter = String(target.value || "");
    render();
    return;
  }

  if (target.matches("#savings-currency-filter")) {
    state.ui.savingsCurrencyFilter = sanitizeSavingsCurrencyFilter(target.value);
    render();
    return;
  }

  if (target.matches("[data-action='budget-amount']")) {
    const categoryId = target.dataset.categoryId;
    const monthKey = target.dataset.month;
    const currency = target.dataset.currency;
    const amount = parseNumber(target.value);
    setBudget(monthKey, categoryId, currency, amount);
    render();
    return;
  }

  if (target.matches("#settings-base-currency")) {
    state.settings.baseCurrency = sanitizeCurrency(target.value, state.settings.baseCurrency);
    saveSettings();
    render();
    showToast("Базовая валюта сохранена");
    return;
  }

  if (target.matches("#settings-default-currency")) {
    state.settings.defaultCurrency = sanitizeCurrency(target.value, state.settings.defaultCurrency);
    saveSettings();
    render();
    showToast("Валюта по умолчанию сохранена");
    return;
  }

  if (target.matches("#io-json")) {
    state.ui.ioText = target.value;
  }
}

function onViewInput(event) {
  const target = event.target;
  if (target.matches("#tx-search")) {
    state.ui.txSearch = String(target.value || "");
    render();
  }
}

function onViewSubmit(event) {
  event.preventDefault();
}

function onModalClick(event) {
  const target = event.target;

  if (target === modalRoot || target.matches("[data-action='close-modal']")) {
    closeModal();
    return;
  }

  if (target.matches("[data-action='category-delete']")) {
    const id = target.dataset.id;
    if (id) {
      deleteCategory(id);
    }
    return;
  }

  if (target.matches("[data-action='category-up']")) {
    const id = target.dataset.id;
    if (id) {
      moveCategory(id, -1);
    }
    return;
  }

  if (target.matches("[data-action='category-rename']")) {
    const id = target.dataset.id;
    if (id) {
      renameCategory(id);
    }
    return;
  }

  if (target.matches("[data-action='category-down']")) {
    const id = target.dataset.id;
    if (id) {
      moveCategory(id, 1);
    }
  }
}

function onModalSubmit(event) {
  event.preventDefault();
  const form = event.target;

  if (form.matches("[data-form='category-add']")) {
    const formData = new FormData(form);
    const type = sanitizeType(formData.get("type"));
    const name = String(formData.get("name") || "").trim();
    addCategory(type, name);
    return;
  }

  if (form.matches("[data-form='transaction-edit']")) {
    const formData = new FormData(form);
    saveTransactionEdit(formData);
    return;
  }

  if (form.matches("[data-form='recurring-add']")) {
    const formData = new FormData(form);
    addRecurringRule(formData);
    return;
  }

  if (form.matches("[data-form='budget-add']")) {
    const formData = new FormData(form);
    addBudgetFromModal(formData);
    return;
  }

  if (form.matches("[data-form='savings-edit']")) {
    const formData = new FormData(form);
    submitSavingsModal(formData);
    return;
  }

  if (form.matches("[data-form='savings-funds']")) {
    const formData = new FormData(form);
    submitSavingsFunds(formData);
  }
}

function render() {
  syncNav();
  renderSubtitle();
  renderView();
}

function syncNav() {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function renderSubtitle() {
  const mk = monthKeyOf(new Date());
  const monthTx = state.transactions.filter((tx) => tx.dateISO.startsWith(mk) && tx.currency === state.settings.defaultCurrency);
  const net = monthTx.reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0);
  subtitleEl.textContent = `Этот месяц (${state.settings.defaultCurrency}): ${formatSigned(net)}`;
}

function renderView() {
  const builders = {
    add: buildAddTab,
    transactions: buildTransactionsTab,
    analytics: buildAnalyticsTab,
    budgets: buildBudgetsTab,
    settings: buildSettingsTab,
    savings: buildSavingsTab
  };

  const build = builders[state.activeTab] || builders.add;
  viewRoot.innerHTML = build();

  if (state.activeTab === "analytics") {
    initAnalyticsCharts();
  }
}

function buildAddTab() {
  return `
    <section class="tab-view" data-view="add">
      <article class="glass glass-card">
        <div class="section-title">
          <h2>Быстрое добавление</h2>
          <p class="card-note">Пример: +30000 зарплата USD</p>
        </div>
        <div class="quick-add">
          <input id="quick-input" type="text" placeholder="Сумма категория [валюта]" />
          <button class="btn-brand" data-action="quick-add" type="button">Добавить</button>
        </div>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Форма операции</h2>
        </div>

        <form class="form-grid" action="#">
          <div class="field">
            <label>Тип</label>
            <div class="type-toggle" role="group" aria-label="Тип операции">
              <button type="button" data-action="set-add-type" data-value="expense" class="${state.ui.addType === "expense" ? "active" : ""}">Расход</button>
              <button type="button" data-action="set-add-type" data-value="income" class="${state.ui.addType === "income" ? "active" : ""}">Доход</button>
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="add-amount">Сумма</label>
              <input id="add-amount" type="text" inputmode="decimal" placeholder="0,00" />
            </div>
            <div class="field">
              <label for="add-currency">Валюта</label>
              <select id="add-currency">${currencyOptions(state.settings.defaultCurrency)}</select>
            </div>
          </div>

          <div class="field">
            <label for="add-category">Категория</label>
            <select id="add-category">${categoryOptions(state.ui.addType, "")}</select>
            <div class="toolbar-row">
              <button
                class="btn-secondary btn-small"
                type="button"
                data-action="open-new-category"
                data-type="${state.ui.addType}"
              >+ Новая</button>
            </div>
          </div>

          <div class="grid-2">
            <div class="field">
              <label for="add-date">Дата</label>
              <input id="add-date" type="date" value="${dateISO(new Date())}" />
            </div>
            <div class="field">
              <label for="add-note">Заметка</label>
              <input id="add-note" type="text" placeholder="Необязательно" />
            </div>
          </div>

          <button class="btn-secondary" data-action="save-transaction" type="button">Сохранить операцию</button>
        </form>
      </article>
    </section>
  `;
}

function buildTransactionsTab() {
  const tx = filteredTransactions();
  const groups = groupTransactionsByDate(tx);
  const listHtml = tx.length
    ? groups.map((group) => `
      <section class="tx-group">
        <p class="tx-group-label">${group.label}</p>
        ${group.items.map(renderTransactionRow).join("")}
      </section>
    `).join("")
    : `<article class="glass glass-card placeholder"><div><h2>Пока нет операций</h2><p class="card-note">Добавьте первую операцию на вкладке «Добавить»</p></div></article>`;

  return `
    <section class="tab-view" data-view="transactions">
      <article class="glass glass-card">
        <div class="section-title">
          <h2>История операций</h2>
          <p class="card-note">${tx.length} шт.</p>
        </div>

        <div class="chips" role="group" aria-label="Фильтр операций">
          <button class="${state.ui.txFilter === "all" ? "active" : ""}" type="button" data-action="set-filter" data-value="all">Все</button>
          <button class="${state.ui.txFilter === "expense" ? "active" : ""}" type="button" data-action="set-filter" data-value="expense">Расходы</button>
          <button class="${state.ui.txFilter === "income" ? "active" : ""}" type="button" data-action="set-filter" data-value="income">Доходы</button>
        </div>

        <div class="filters-grid">
          <div class="field">
            <label for="tx-search">Поиск</label>
            <input id="tx-search" type="text" placeholder="Поиск операций..." value="${escapeHtml(state.ui.txSearch)}" />
          </div>
          <div class="field">
            <label for="tx-category-filter">Категория</label>
            <select id="tx-category-filter">
              <option value="all" ${state.ui.txCategoryFilter === "all" ? "selected" : ""}>Все категории</option>
              ${allCategoriesOptions(state.ui.txCategoryFilter)}
            </select>
          </div>
          <div class="field">
            <label for="tx-month-filter">Месяц</label>
            <input id="tx-month-filter" type="month" value="${state.ui.txMonthFilter}" />
          </div>
        </div>
      </article>

      <div class="transaction-list">${listHtml}</div>
    </section>
  `;
}

function buildAnalyticsTab() {
  return `
    <section class="tab-view" data-view="analytics">
      <article class="glass glass-card">
        <div class="section-title">
          <h2>Аналитика расходов</h2>
          <button class="btn-secondary" data-action="analytics-refresh" type="button">Обновить</button>
        </div>
        <div class="toolbar">
          <div class="toolbar-row">
            <div class="field">
              <label for="analytics-currency">Валюта</label>
              <select id="analytics-currency">${currencyOptions(state.ui.reportCurrency)}</select>
            </div>
            <div class="field">
              <label for="analytics-month">Месяц</label>
              <input id="analytics-month" type="month" value="${state.ui.analyticsMonth}" />
            </div>
          </div>
        </div>
      </article>

      <div class="analytics-grid">
        <article class="glass glass-card">
          <h3>Расходы за 6 месяцев (${state.ui.reportCurrency})</h3>
          <div class="chart-wrap"><canvas id="monthly-expenses-chart"></canvas></div>
        </article>

        <article class="glass glass-card">
          <h3>Категории (${state.ui.analyticsMonth}, ${state.ui.reportCurrency})</h3>
          <div class="chart-wrap"><canvas id="category-expenses-chart"></canvas></div>
        </article>
      </div>
    </section>
  `;
}

function buildBudgetsTab() {
  const month = state.ui.budgetsMonth;
  const currency = state.ui.reportCurrency;
  const expenseCats = getCategoriesByType("expense");

  const rows = expenseCats.map((cat) => {
    const spent = spentByCategory(month, currency, cat.id);
    const budget = getBudget(month, currency, cat.id);
    const ratio = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const over = budget > 0 && spent > budget;

    return `
      <div class="budget-row ${over ? "over" : ""}">
        <div class="budget-head">
          <strong>${escapeHtml(cat.name)}</strong>
          <span class="card-note">${formatAmount(spent)} / ${formatAmount(budget)} ${currency}</span>
        </div>
        <div class="budget-controls">
          <input
            type="text"
            inputmode="decimal"
            placeholder="Бюджет"
            value="${budget > 0 ? formatAmount(budget) : ""}"
            data-action="budget-amount"
            data-category-id="${cat.id}"
            data-month="${month}"
            data-currency="${currency}"
          />
          <button class="btn-secondary btn-small" type="button" data-action="budget-clear" data-category-id="${cat.id}" data-month="${month}" data-currency="${currency}">Очистить</button>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${ratio}%;"></div>
        </div>
      </div>
    `;
  }).join("");

  return `
    <section class="tab-view" data-view="budgets">
      <article class="glass glass-card">
        <div class="section-title">
          <h2>Бюджеты по категориям</h2>
          <button class="btn-secondary btn-small" type="button" data-action="open-new-category" data-type="expense">Создать категорию</button>
        </div>

        <div class="budget-filters">
          <div class="field">
            <label for="budgets-month">Месяц</label>
            <input id="budgets-month" type="month" value="${month}" />
          </div>
          <div class="field">
            <label for="budgets-currency">Валюта</label>
            <select id="budgets-currency">${currencyOptions(currency)}</select>
          </div>
        </div>
      </article>

      <article class="glass glass-card">
        <div class="budget-list">${rows}</div>
      </article>
    </section>
  `;
}

function buildSettingsTab() {
  const recurringItems = state.recurring.length
    ? state.recurring.map((rule) => renderRecurringRow(rule)).join("")
    : "<p class='card-note'>Пока нет повторяющихся платежей</p>";

  return `
    <section class="tab-view" data-view="settings">
      <article class="glass glass-card">
        <div class="section-title">
          <h2>Валюты</h2>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="settings-base-currency">Базовая валюта</label>
            <select id="settings-base-currency">${currencyOptions(state.settings.baseCurrency)}</select>
          </div>
          <div class="field">
            <label for="settings-default-currency">Валюта по умолчанию</label>
            <select id="settings-default-currency">${currencyOptions(state.settings.defaultCurrency)}</select>
          </div>
        </div>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Категории</h2>
        </div>
        <button class="btn-secondary" type="button" data-action="open-categories">Управление категориями</button>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Повторяющиеся платежи</h2>
          <button class="btn-secondary btn-small" type="button" data-action="open-recurring-modal">Добавить</button>
        </div>
        <div class="recurring-list">${recurringItems}</div>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Экспорт / Импорт JSON</h2>
        </div>
        <textarea id="io-json" placeholder="Нажмите «Экспорт JSON» или вставьте JSON для импорта">${escapeHtml(state.ui.ioText)}</textarea>
        <div class="io-actions">
          <button class="btn-secondary" type="button" data-action="export-json">Экспорт JSON</button>
          <button class="btn-secondary" type="button" data-action="import-json">Импорт JSON</button>
        </div>
        <p class="io-status ${state.ui.ioStatus.includes("Ошибка") ? "error" : "success"}">${state.ui.ioStatus || "Готово"}</p>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Сброс</h2>
        </div>
        <button class="btn-danger" type="button" data-action="reset-all">Сбросить все данные</button>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h2>Аккаунт</h2>
        </div>
        <button class="btn-secondary" type="button" data-action="sign-out">Sign out</button>
      </article>
    </section>
  `;
}

function buildSavingsTab() {
  const currencyFilter = state.ui.savingsCurrencyFilter;
  const kindFilter = state.ui.savingsKindFilter;

  const filtered = state.savings
    .filter((item) => kindFilter === "all" || item.kind === kindFilter)
    .filter((item) => {
      if (currencyFilter === "all") {
        return true;
      }
      if (item.kind === "account") {
        return item.currency === currencyFilter;
      }
      const balances = normalizeGoalBalancesMap(item.balances);
      return Object.prototype.hasOwnProperty.call(balances, currencyFilter) || item.targetCurrency === currencyFilter;
    });

  const totals = computeSavingsTotals(filtered, currencyFilter);
  const totalsHtml = currencyFilter === "all"
    ? (totals.byCurrency.length
      ? totals.byCurrency.map((entry) => {
        return `<span class="savings-total-chip">${entry.currency}: ${formatAmount(entry.total)}</span>`;
      }).join("")
      : "<p class='card-note'>Пока нет накоплений</p>")
    : `<span class="savings-total-chip">${currencyFilter}: ${formatAmount(totals.total)}</span>`;

  const cardsHtml = filtered.length
    ? filtered.map(renderSavingsCard).join("")
    : `<article class="glass glass-card placeholder"><div><h2>Пока нет накоплений</h2><p class="card-note">Создайте первый счёт или цель</p></div></article>`;

  return `
    <section class="tab-view" data-view="savings">
      <article class="glass glass-card">
        <div class="section-title">
          <div>
            <h2>Накопления</h2>
            <p class="card-note">Отдельно от операций</p>
          </div>
          <button class="btn-brand btn-small" type="button" data-action="open-savings-create">Создать накопление</button>
        </div>

        <div class="savings-filters">
          <div class="field">
            <label for="savings-currency-filter">Валюта</label>
            <select id="savings-currency-filter">
              <option value="all" ${currencyFilter === "all" ? "selected" : ""}>Все валюты</option>
              ${savingsCurrencyFilterOptions(currencyFilter)}
            </select>
          </div>
          <div class="chips" role="group" aria-label="Фильтр накоплений">
            <button type="button" data-action="set-savings-kind-filter" data-value="all" class="${kindFilter === "all" ? "active" : ""}">Все</button>
            <button type="button" data-action="set-savings-kind-filter" data-value="account" class="${kindFilter === "account" ? "active" : ""}">Счета</button>
            <button type="button" data-action="set-savings-kind-filter" data-value="goal" class="${kindFilter === "goal" ? "active" : ""}">Цели</button>
          </div>
          <div class="savings-summary">
            <label>Итого</label>
            <div class="savings-total-list">${totalsHtml}</div>
          </div>
        </div>
      </article>

      <article class="glass glass-card">
        <div class="section-title">
          <h3>Список накоплений</h3>
          <p class="card-note">${filtered.length} шт.</p>
        </div>
        <div class="savings-list">${cardsHtml}</div>
      </article>
    </section>
  `;
}

function renderSavingsCard(item) {
  if (item.kind === "account") {
    return `
      <div class="savings-card">
        <div class="savings-head">
          <div>
            <p class="savings-name">${escapeHtml(item.name)}</p>
            <div class="savings-meta">
              <span class="savings-tag">Счёт</span>
              <span class="savings-tag">${item.currency}</span>
            </div>
          </div>
          <div class="savings-balance">${formatAmount(item.balance)} ${item.currency}</div>
        </div>
        <p class="card-note">Баланс: ${formatAmount(item.balance)} ${item.currency}</p>
        <div class="savings-actions">
          <button class="btn-secondary btn-small" type="button" data-action="savings-add" data-id="${item.id}">Пополнить</button>
          <button class="btn-secondary btn-small" type="button" data-action="savings-withdraw" data-id="${item.id}">Снять</button>
          <button class="btn-secondary btn-small" type="button" data-action="edit-savings" data-id="${item.id}">Изменить</button>
          <button class="btn-danger btn-small" type="button" data-action="delete-savings" data-id="${item.id}">Удалить</button>
        </div>
      </div>
    `;
  }

  const balancesMap = normalizeGoalBalancesMap(item.balances);
  const progressInfo = computeGoalProgress(item);
  const balancesEntries = Object.entries(balancesMap)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const balancesHtml = balancesEntries.length
    ? balancesEntries.map(([currency, amount]) => `<span class="savings-tag">${currency}: ${formatAmount(amount)}</span>`).join("")
    : `<span class="savings-tag">${item.baseCurrency || item.targetCurrency}: 0</span>`;
  const progress = progressInfo.canCompute ? progressInfo.percent : 0;
  const deadlineLine = item.deadline ? `<p class="card-note">До: ${formatDate(item.deadline)}</p>` : "";
  const progressLine = progressInfo.canCompute
    ? `<p class="card-note">${formatAmount(progress)}%</p>`
    : `<p class="card-note">Прогресс: —</p>`;
  const missingRatesLine = progressInfo.missingRateCurrencies.length
    ? `<p class="card-note">Не учтено без курса: ${progressInfo.missingRateCurrencies.join(", ")}</p>`
    : "";
  const targetBaseLine = progressInfo.targetInBase !== null
    ? `<p class="card-note">Цель в ${progressInfo.baseCurrency}: ${formatAmount(progressInfo.targetInBase)} ${progressInfo.baseCurrency}</p>`
    : `<p class="card-note">Нет курса для валюты цели</p>`;

  return `
    <div class="savings-card">
      <div class="savings-head">
        <div>
          <p class="savings-name">${escapeHtml(item.name)}</p>
          <div class="savings-meta">
            <span class="savings-tag">Цель</span>
            <span class="savings-tag">Целевая: ${item.targetCurrency}</span>
          </div>
        </div>
        <div class="savings-balance">${formatAmount(progressInfo.totalInBase)} ${progressInfo.baseCurrency}</div>
      </div>
      <div class="savings-goal-lines">
        <p class="card-note">Балансы:</p>
        <div class="savings-meta">${balancesHtml}</div>
        <p class="card-note">Целевая: ${formatAmount(item.target)} ${item.targetCurrency}</p>
        <p class="card-note">Валюта прогресса: ${progressInfo.baseCurrency}</p>
        <p class="card-note">Посчитано: ${formatAmount(progressInfo.totalInBase)} ${progressInfo.baseCurrency}</p>
        ${targetBaseLine}
        ${missingRatesLine}
        <div class="progress-track"><div class="progress-fill" style="width:${progress}%;"></div></div>
        ${progressLine}
        ${deadlineLine}
      </div>
      <div class="savings-actions">
        <button class="btn-secondary btn-small" type="button" data-action="savings-add" data-id="${item.id}">Добавить</button>
        <button class="btn-secondary btn-small" type="button" data-action="savings-withdraw" data-id="${item.id}">Снять</button>
        <button class="btn-secondary btn-small" type="button" data-action="edit-savings-rates" data-id="${item.id}">Курсы</button>
        <button class="btn-secondary btn-small" type="button" data-action="edit-savings" data-id="${item.id}">Изменить цель</button>
        <button class="btn-danger btn-small" type="button" data-action="delete-savings" data-id="${item.id}">Удалить</button>
      </div>
    </div>
  `;
}

function renderTransactionRow(tx) {
  const cat = findCategoryById(tx.categoryId);
  const sign = tx.type === "income" ? "+" : "−";
  return `
    <article class="tx-row">
      <div>
        <div class="tx-title">${escapeHtml(cat ? cat.name : "Без категории")}</div>
        <div class="tx-meta">${formatDate(tx.dateISO)}${tx.note ? ` · ${escapeHtml(tx.note)}` : ""}</div>
      </div>
      <div>
        <div class="tx-amount ${tx.type}">${sign}${formatAmount(tx.amount)} ${tx.currency}</div>
        <div class="tx-actions">
          <button class="btn-secondary btn-small" data-action="edit-transaction" data-id="${tx.id}" type="button">Изменить</button>
          <button class="btn-danger btn-small" data-action="delete-transaction" data-id="${tx.id}" type="button">Удалить</button>
        </div>
      </div>
    </article>
  `;
}

function renderRecurringRow(rule) {
  const cat = findCategoryById(rule.categoryId);
  const scheduleText = rule.schedule === "weekly"
    ? `Еженедельно (${weekdayLabel(rule.dayOfWeek)})`
    : `Ежемесячно (${rule.dayOfMonth || 1} число)`;
  return `
    <div class="recurring-row">
      <div class="recurring-head">
        <strong>${formatAmount(rule.amount)} ${rule.currency}</strong>
        <button class="btn-danger btn-small" type="button" data-action="delete-recurring" data-id="${rule.id}">Удалить</button>
      </div>
      <p class="card-note">${escapeHtml(cat ? cat.name : "Без категории")} · ${scheduleText}</p>
      ${rule.note ? `<p class="card-note">${escapeHtml(rule.note)}</p>` : ""}
    </div>
  `;
}

function filteredTransactions() {
  const q = normalize(state.ui.txSearch);
  return [...state.transactions]
    .filter((tx) => state.ui.txFilter === "all" || tx.type === state.ui.txFilter)
    .filter((tx) => state.ui.txCategoryFilter === "all" || tx.categoryId === state.ui.txCategoryFilter)
    .filter((tx) => !state.ui.txMonthFilter || tx.dateISO.startsWith(state.ui.txMonthFilter))
    .filter((tx) => {
      if (!q) {
        return true;
      }
      const cat = findCategoryById(tx.categoryId);
      const hay = [
        cat ? cat.name : "",
        tx.note || "",
        String(tx.amount),
        formatAmount(tx.amount),
        tx.currency
      ].map(normalize).join(" ");
      return hay.includes(q);
    })
    .sort((a, b) => {
      if (a.dateISO !== b.dateISO) {
        return b.dateISO.localeCompare(a.dateISO);
      }
      return b.id - a.id;
    });
}

function handleQuickAdd() {
  const input = viewRoot.querySelector("#quick-input");
  if (!input) {
    return;
  }

  const text = input.value.trim();
  if (!text) {
    showToast("Введите строку: 250 еда USD");
    return;
  }

  const parsed = parseQuickInput(text);
  if (!parsed.ok) {
    showToast(parsed.message);
    return;
  }

  const category = findCategoryByName(parsed.type, parsed.categoryName);
  if (!category) {
    showToast(`Категория «${parsed.categoryName}» не найдена`);
    openManageCategoriesModal(parsed.type, parsed.categoryName);
    return;
  }

  const tx = {
    id: nextId(),
    type: parsed.type,
    amount: parsed.amount,
    currency: parsed.currency || state.settings.defaultCurrency,
    categoryId: category.id,
    dateISO: dateISO(new Date()),
    note: ""
  };

  state.transactions.push(tx);
  saveTransactions();
  input.value = "";
  render();
  showToast("Операция добавлена");
}

function handleFormSave() {
  const amountEl = viewRoot.querySelector("#add-amount");
  const currencyEl = viewRoot.querySelector("#add-currency");
  const categoryEl = viewRoot.querySelector("#add-category");
  const dateEl = viewRoot.querySelector("#add-date");
  const noteEl = viewRoot.querySelector("#add-note");

  if (!amountEl || !currencyEl || !categoryEl || !dateEl || !noteEl) {
    return;
  }

  const amount = parseNumber(amountEl.value);
  if (!(amount > 0)) {
    showToast("Сумма должна быть больше 0");
    return;
  }

  const categoryId = String(categoryEl.value || "").trim();
  if (!categoryId || !findCategoryById(categoryId)) {
    showToast("Выберите категорию");
    return;
  }

  const tx = {
    id: nextId(),
    type: state.ui.addType,
    amount,
    currency: sanitizeCurrency(currencyEl.value, state.settings.defaultCurrency),
    categoryId,
    dateISO: sanitizeDateISO(dateEl.value),
    note: String(noteEl.value || "").trim()
  };

  state.transactions.push(tx);
  saveTransactions();

  amountEl.value = "";
  noteEl.value = "";
  dateEl.value = dateISO(new Date());

  render();
  showToast("Операция сохранена");
}

function deleteTransaction(id) {
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) {
    return;
  }
  const ok = window.confirm("Удалить операцию?");
  if (!ok) {
    return;
  }

  state.transactions = state.transactions.filter((item) => item.id !== id);
  saveTransactions();
  render();
  showToast("Операция удалена");
}

function openTransactionEditModal(id) {
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) {
    return;
  }

  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="Редактировать операцию">
      <div class="modal-head">
        <h2>Редактировать операцию</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Закрыть</button>
      </div>

      <form class="form-grid" data-form="transaction-edit">
        <input type="hidden" name="id" value="${tx.id}" />

        <div class="field">
          <label for="edit-type">Тип</label>
          <select id="edit-type" name="type">
            <option value="expense" ${tx.type === "expense" ? "selected" : ""}>Расход</option>
            <option value="income" ${tx.type === "income" ? "selected" : ""}>Доход</option>
          </select>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="edit-amount">Сумма</label>
            <input id="edit-amount" name="amount" type="text" value="${formatAmount(tx.amount)}" />
          </div>
          <div class="field">
            <label for="edit-currency">Валюта</label>
            <select id="edit-currency" name="currency">${currencyOptions(tx.currency)}</select>
          </div>
        </div>

        <div class="field">
          <label for="edit-category">Категория</label>
          <select id="edit-category" name="categoryId">${categoryOptions(tx.type, tx.categoryId)}</select>
        </div>

        <div class="grid-2">
          <div class="field">
            <label for="edit-date">Дата</label>
            <input id="edit-date" name="dateISO" type="date" value="${tx.dateISO}" />
          </div>
          <div class="field">
            <label for="edit-note">Заметка</label>
            <input id="edit-note" name="note" type="text" value="${escapeHtml(tx.note || "")}" />
          </div>
        </div>

        <button class="btn-brand" type="submit">Сохранить изменения</button>
      </form>
    </div>
  `;

  const typeSelect = modalRoot.querySelector("#edit-type");
  const categorySelect = modalRoot.querySelector("#edit-category");
  typeSelect.addEventListener("change", () => {
    categorySelect.innerHTML = categoryOptions(typeSelect.value, "");
  });

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
}

function saveTransactionEdit(formData) {
  const id = Number(formData.get("id"));
  const tx = state.transactions.find((item) => item.id === id);
  if (!tx) {
    showToast("Операция не найдена");
    return;
  }

  const type = sanitizeType(formData.get("type"));
  const amount = parseNumber(String(formData.get("amount") || ""));
  const currency = sanitizeCurrency(formData.get("currency"), tx.currency);
  const categoryId = String(formData.get("categoryId") || "");
  const date = sanitizeDateISO(String(formData.get("dateISO") || ""));
  const note = String(formData.get("note") || "").trim();

  if (!(amount > 0)) {
    showToast("Сумма должна быть больше 0");
    return;
  }

  const category = findCategoryById(categoryId);
  if (!category || category.type !== type) {
    showToast("Выберите корректную категорию");
    return;
  }

  tx.type = type;
  tx.amount = amount;
  tx.currency = currency;
  tx.categoryId = categoryId;
  tx.dateISO = date;
  tx.note = note;

  saveTransactions();
  closeModal();
  render();
  showToast("Операция обновлена");
}

function setBudget(monthKey, categoryId, currency, amount) {
  const mk = sanitizeMonthKey(monthKey, monthKeyOf(new Date()));
  const cat = findCategoryById(categoryId);
  if (!cat || cat.type !== "expense") {
    return;
  }

  const cur = sanitizeCurrency(currency, state.ui.reportCurrency);
  const idx = state.budgets.findIndex(
    (b) => b.monthKey === mk && b.categoryId === categoryId && b.currency === cur
  );

  if (!(amount > 0)) {
    if (idx >= 0) {
      state.budgets.splice(idx, 1);
      saveBudgets();
    }
    return;
  }

  const budget = {
    monthKey: mk,
    categoryId,
    amount,
    currency: cur
  };

  if (idx >= 0) {
    state.budgets[idx] = budget;
  } else {
    state.budgets.push(budget);
  }

  saveBudgets();
}

function getBudget(monthKey, currency, categoryId) {
  const found = state.budgets.find(
    (b) => b.monthKey === monthKey && b.currency === currency && b.categoryId === categoryId
  );
  return found ? found.amount : 0;
}

function spentByCategory(monthKey, currency, categoryId) {
  return state.transactions
    .filter(
      (tx) =>
        tx.type === "expense" &&
        tx.currency === currency &&
        tx.categoryId === categoryId &&
        tx.dateISO.startsWith(monthKey)
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function openBudgetCategoryModal() {
  const month = state.ui.budgetsMonth;
  const currency = state.ui.reportCurrency;
  const expenseCategories = getCategoriesByType("expense");
  const usedCategoryIds = new Set(
    state.budgets
      .filter((b) => b.monthKey === month && b.currency === currency)
      .map((b) => b.categoryId)
  );
  const available = expenseCategories.filter((cat) => !usedCategoryIds.has(cat.id));

  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="Добавить категорию в бюджеты">
      <div class="modal-head">
        <h2>Добавить категорию в бюджеты</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Закрыть</button>
      </div>
      <p class="card-note">Месяц: ${month} · Валюта: ${currency}</p>
      <form class="form-grid" data-form="budget-add">
        <input type="hidden" name="monthKey" value="${month}" />
        <input type="hidden" name="currency" value="${currency}" />
        <div class="field">
          <label for="budget-add-category">Категория</label>
          <select id="budget-add-category" name="categoryId" ${available.length ? "" : "disabled"}>
            ${
              available.length
                ? available.map((cat) => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join("")
                : "<option value=''>Нет доступных категорий</option>"
            }
          </select>
        </div>
        <div class="field">
          <label for="budget-add-amount">Бюджет</label>
          <input id="budget-add-amount" name="amount" type="text" inputmode="decimal" placeholder="0,00" ${available.length ? "" : "disabled"} />
        </div>
        <button class="btn-brand" type="submit" ${available.length ? "" : "disabled"}>Сохранить</button>
      </form>
    </div>
  `;

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
}

function addBudgetFromModal(formData) {
  const monthKey = sanitizeMonthKey(formData.get("monthKey"), state.ui.budgetsMonth);
  const currency = sanitizeCurrency(formData.get("currency"), state.ui.reportCurrency);
  const categoryId = String(formData.get("categoryId") || "");
  const amountRaw = String(formData.get("amount") || "").trim();
  const amount = parseNumber(amountRaw);

  const category = findCategoryById(categoryId);
  if (!category || category.type !== "expense") {
    showToast("Выберите категорию расходов");
    return;
  }

  if (!amountRaw || !Number.isFinite(amount) || amount < 0) {
    showToast("Введите корректную сумму");
    return;
  }

  if (amount === 0) {
    setBudget(monthKey, categoryId, currency, 0);
  } else {
    setBudget(monthKey, categoryId, currency, amount);
  }

  closeModal();
  render();
  showToast("Бюджет сохранен");
}

function openSavingsModal(mode = "create", id = "", focusSection = "") {
  const isEdit = mode === "edit";
  const existing = isEdit ? state.savings.find((item) => item.id === id) : null;
  if (isEdit && !existing) {
    showToast("Накопление не найдено");
    return;
  }

  const initial = existing || {
    id: "",
    kind: "account",
    name: "",
    currency: state.settings.defaultCurrency,
    balance: 0,
    target: 0,
    targetCurrency: state.settings.defaultCurrency,
    baseCurrency: state.settings.defaultCurrency,
    deadline: "",
    balances: {},
    ratesToBase: {},
    createdAt: dateISO(new Date())
  };
  const isGoal = initial.kind === "goal";
  const goalBalances = isGoal ? normalizeGoalBalancesMap(initial.balances) : {};
  const goalBaseCurrency = sanitizeCurrency(
    initial.baseCurrency,
    sanitizeCurrency(initial.targetCurrency, state.settings.defaultCurrency)
  );
  const goalRates = isGoal ? normalizeGoalRatesMap(initial.ratesToBase) : {};
  const rateCurrencies = isGoal
    ? Array.from(new Set([
      ...Object.keys(goalBalances),
      ...Object.keys(goalRates),
      sanitizeCurrency(initial.targetCurrency, state.settings.defaultCurrency)
    ].filter(Boolean)))
    : [...CURRENCIES];
  const goalRatesRows = rateCurrencies
    .map((currency) => {
      const isBase = currency === goalBaseCurrency;
      const rateValue = Number(goalRates[currency]);
      const hasRate = Number.isFinite(rateValue) && rateValue > 0;
      return `
        <div class="grid-2 savings-rate-row">
          <div class="field">
            <label>${currency}</label>
            <input type="text" value="${currency}" disabled />
          </div>
          <div class="field">
            <label class="savings-rate-label" data-currency="${currency}">Курс: 1 ${currency} = ___ ${goalBaseCurrency}</label>
            <input
              data-rate-input="${currency}"
              name="rate_${currency}"
              type="text"
              inputmode="decimal"
              placeholder="${isBase ? "Не требуется" : `1 ${currency} = ? ${goalBaseCurrency}`}"
              value="${isBase ? "" : (hasRate ? formatAmount(rateValue) : "")}"
              ${isBase ? "disabled" : ""}
            />
          </div>
        </div>
      `;
    })
    .join("");
  const accountBlockClass = isGoal ? "hidden" : "";
  const goalBlockClass = isGoal ? "" : "hidden";
  const kindControl = isEdit
    ? `<input type="hidden" name="kind" value="${initial.kind}" /><p class="card-note">Тип: ${initial.kind === "goal" ? "Цель" : "Счёт"}</p>`
    : `
      <div class="field">
        <label for="savings-kind">Тип</label>
        <select id="savings-kind" name="kind">
          <option value="account" ${initial.kind === "account" ? "selected" : ""}>Счёт</option>
          <option value="goal" ${initial.kind === "goal" ? "selected" : ""}>Цель</option>
        </select>
      </div>
    `;
  const modalTitle = isEdit
    ? (isGoal ? "Изменить цель" : "Изменить счёт")
    : "Создать накопление";

  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="${modalTitle}">
      <div class="modal-head">
        <h2>${modalTitle}</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Отмена</button>
      </div>
      <form class="form-grid" data-form="savings-edit">
        <input type="hidden" name="mode" value="${isEdit ? "edit" : "create"}" />
        <input type="hidden" name="id" value="${escapeHtml(initial.id)}" />
        ${kindControl}

        <div class="field">
          <label for="savings-name">Название</label>
          <input id="savings-name" name="name" type="text" placeholder="Например: Резерв" value="${escapeHtml(initial.name)}" />
        </div>

        <div id="savings-account-fields" class="${accountBlockClass}">
          <div class="grid-2">
            <div class="field">
              <label for="savings-currency">Валюта</label>
              <select id="savings-currency" name="currency">${currencyOptions(initial.currency)}</select>
            </div>
            <div class="field">
              <label for="savings-balance">Баланс</label>
              <input id="savings-balance" name="balance" type="text" inputmode="decimal" value="${formatAmount(initial.balance)}" />
            </div>
          </div>
        </div>

        <div id="savings-goal-fields" class="savings-modal-goal ${goalBlockClass}">
          <div class="field">
            <label for="savings-target">Цель</label>
            <input id="savings-target" name="target" type="text" inputmode="decimal" value="${initial.target ? formatAmount(initial.target) : ""}" />
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="savings-target-currency">Целевая валюта</label>
              <select id="savings-target-currency" name="targetCurrency">${currencyOptions(initial.targetCurrency || state.settings.defaultCurrency)}</select>
            </div>
            <div class="field">
              <label for="savings-base-currency">Валюта прогресса</label>
              <select id="savings-base-currency" name="baseCurrency">${currencyOptions(goalBaseCurrency)}</select>
            </div>
          </div>
          <div class="grid-2">
            <div class="field">
              <label for="savings-deadline">Срок (необязательно)</label>
              <input id="savings-deadline" name="deadline" type="date" value="${initial.deadline || ""}" />
            </div>
          </div>
          <div class="savings-rates-block" id="savings-rates-block">
            <p class="card-note">Ручные курсы к валюте прогресса</p>
            ${goalRatesRows || "<p class='card-note'>Добавьте баланс в валюте или выберите валюту цели</p>"}
          </div>
          ${isGoal ? `<p class="card-note">Балансы: ${Object.entries(goalBalances).map(([cur, val]) => `${cur} ${formatAmount(val)}`).join(" · ") || "—"}</p>` : ""}
        </div>

        <button class="btn-brand" type="submit">Сохранить</button>
      </form>
    </div>
  `;

  const kindSelect = modalRoot.querySelector("#savings-kind");
  if (kindSelect) {
    const goalFields = modalRoot.querySelector("#savings-goal-fields");
    const accountFields = modalRoot.querySelector("#savings-account-fields");
    kindSelect.addEventListener("change", () => {
      const isGoalSelected = kindSelect.value === "goal";
      goalFields.classList.toggle("hidden", !isGoalSelected);
      accountFields.classList.toggle("hidden", isGoalSelected);
    });
  }

  const baseCurrencySelect = modalRoot.querySelector("#savings-base-currency");
  if (baseCurrencySelect) {
    const updateRateLabels = () => {
      const base = sanitizeCurrency(baseCurrencySelect.value, state.settings.defaultCurrency);
      modalRoot.querySelectorAll(".savings-rate-label").forEach((label) => {
        const cur = label.getAttribute("data-currency") || "";
        label.textContent = `Курс: 1 ${cur} = ___ ${base}`;
      });
      modalRoot.querySelectorAll("[data-rate-input]").forEach((input) => {
        const cur = input.getAttribute("data-rate-input") || "";
        const isBase = cur === base;
        input.disabled = isBase;
        input.placeholder = isBase ? "Не требуется" : `1 ${cur} = ? ${base}`;
        if (isBase) {
          input.value = "";
        }
      });
    };
    baseCurrencySelect.addEventListener("change", updateRateLabels);
    updateRateLabels();
  }

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");

  if (focusSection === "rates") {
    const firstRateInput = modalRoot.querySelector("[data-rate-input]:not([disabled])");
    if (firstRateInput) {
      firstRateInput.focus();
      firstRateInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }
}

function submitSavingsModal(formData) {
  const mode = String(formData.get("mode") || "create");
  const id = String(formData.get("id") || "");
  const kind = sanitizeSavingsKind(formData.get("kind"));
  const name = String(formData.get("name") || "").trim();
  const currency = sanitizeCurrency(formData.get("currency"), state.settings.defaultCurrency);
  const balance = parseNumber(formData.get("balance"));
  const targetRaw = parseNumber(formData.get("target"));
  const targetCurrency = sanitizeCurrency(formData.get("targetCurrency"), state.settings.defaultCurrency);
  const baseCurrency = sanitizeCurrency(formData.get("baseCurrency"), targetCurrency || state.settings.defaultCurrency);
  const deadline = sanitizeOptionalDateISO(formData.get("deadline"));
  const ratesToBase = parseGoalRatesFromForm(formData, baseCurrency);

  if (!name) {
    showToast("Введите название");
    return;
  }
  if (kind === "account") {
    if (!Number.isFinite(balance) || balance < 0) {
      showToast("Баланс должен быть 0 или больше");
      return;
    }
  } else {
    if (!Number.isFinite(targetRaw) || targetRaw <= 0) {
      showToast("Для цели укажите сумму больше 0");
      return;
    }
    if (!ratesToBase.ok) {
      showToast(ratesToBase.message);
      return;
    }
  }

  const payload = {
    kind,
    name,
    currency,
    balance: Number.isFinite(balance) ? balance : 0,
    target: kind === "goal" ? targetRaw : null,
    targetCurrency: kind === "goal" ? targetCurrency : null,
    baseCurrency: kind === "goal" ? baseCurrency : null,
    deadline: kind === "goal" ? deadline : "",
    balances: {},
    ratesToBase: kind === "goal" ? ratesToBase.value : {}
  };

  if (mode === "edit") {
    updateSavingsItem(id, payload);
    showToast("Накопление обновлено");
  } else {
    createSavingsItem(payload);
    showToast("Накопление создано");
  }

  closeModal();
  render();
}

function createSavingsItem(data) {
  const kind = sanitizeSavingsKind(data.kind);
  const safeTargetCurrency = sanitizeCurrency(data.targetCurrency, state.settings.defaultCurrency);
  const safeBaseCurrency = sanitizeCurrency(data.baseCurrency, safeTargetCurrency || state.settings.defaultCurrency);
  const item = {
    id: uid("sav"),
    kind,
    name: String(data.name || "").trim(),
    currency: sanitizeCurrency(data.currency, state.settings.defaultCurrency),
    balance: Number.isFinite(data.balance) ? Math.max(0, data.balance) : 0,
    target: kind === "goal" && Number.isFinite(data.target) && data.target > 0 ? data.target : null,
    targetCurrency: kind === "goal" ? safeTargetCurrency : null,
    baseCurrency: kind === "goal" ? safeBaseCurrency : null,
    deadline: sanitizeOptionalDateISO(data.deadline),
    balances: kind === "goal" ? normalizeGoalBalancesMap(data.balances) : undefined,
    ratesToBase: kind === "goal" ? normalizeGoalRatesMap(data.ratesToBase) : undefined,
    createdAt: dateISO(new Date())
  };
  if (kind !== "goal") {
    item.target = null;
    item.targetCurrency = null;
    item.baseCurrency = null;
    item.deadline = "";
    delete item.balances;
    delete item.ratesToBase;
  } else if (!item.balances || Object.keys(item.balances).length === 0) {
    item.balances = {};
  }
  state.savings.push(item);
  saveSavings();
}

function updateSavingsItem(id, data) {
  const item = state.savings.find((entry) => entry.id === id);
  if (!item) {
    showToast("Накопление не найдено");
    return;
  }
  const kind = sanitizeSavingsKind(data.kind || item.kind);
  item.kind = kind;
  item.name = String(data.name || "").trim();
  if (kind === "account") {
    item.currency = sanitizeCurrency(data.currency, item.currency || state.settings.defaultCurrency);
    item.balance = Number.isFinite(data.balance) ? Math.max(0, data.balance) : 0;
    item.target = null;
    item.targetCurrency = null;
    item.baseCurrency = null;
    item.deadline = "";
    delete item.balances;
    delete item.ratesToBase;
  } else {
    item.target = Number.isFinite(data.target) && data.target > 0 ? data.target : Math.max(1, Number(item.target) || 1);
    item.targetCurrency = sanitizeCurrency(data.targetCurrency, item.targetCurrency || state.settings.defaultCurrency);
    item.baseCurrency = sanitizeCurrency(
      data.baseCurrency,
      item.baseCurrency || item.targetCurrency || state.settings.defaultCurrency
    );
    item.deadline = sanitizeOptionalDateISO(data.deadline);
    item.balances = normalizeGoalBalancesMap(item.balances);
    item.ratesToBase = normalizeGoalRatesMap(data.ratesToBase || item.ratesToBase);
    delete item.currency;
    delete item.balance;
  }
  saveSavings();
}

function openSavingsFundsModal(id, operation) {
  const item = state.savings.find((entry) => entry.id === id);
  if (!item) {
    showToast("Накопление не найдено");
    return;
  }
  const op = operation === "withdraw" ? "withdraw" : "add";
  const opLabel = op === "withdraw" ? "Снять" : "Добавить";
  const title = `${opLabel}: ${item.name}`;

  let currencyControl = "";
  if (item.kind === "account") {
    currencyControl = `
      <div class="field">
        <label>Валюта</label>
        <input type="text" value="${item.currency}" disabled />
        <input type="hidden" name="currency" value="${item.currency}" />
      </div>
    `;
  } else {
    const balances = normalizeGoalBalancesMap(item.balances);
    const existing = Object.keys(balances).filter((cur) => CURRENCIES.includes(cur));
    const ordered = [...existing, ...CURRENCIES.filter((cur) => !existing.includes(cur))];
    const defaultCurrency = item.targetCurrency && CURRENCIES.includes(item.targetCurrency) ? item.targetCurrency : CURRENCIES[0];
    currencyControl = `
      <div class="field">
        <label for="savings-funds-currency">Валюта</label>
        <select id="savings-funds-currency" name="currency">
          ${ordered.map((cur) => `<option value="${cur}" ${cur === defaultCurrency ? "selected" : ""}>${cur}</option>`).join("")}
        </select>
      </div>
    `;
  }

  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Отмена</button>
      </div>
      <form class="form-grid" data-form="savings-funds">
        <input type="hidden" name="id" value="${item.id}" />
        <input type="hidden" name="operation" value="${op}" />
        <div class="field">
          <label for="savings-funds-amount">Сумма</label>
          <input id="savings-funds-amount" name="amount" type="text" inputmode="decimal" placeholder="0,00" />
        </div>
        ${currencyControl}
        <button class="btn-brand" type="submit">${opLabel}</button>
      </form>
    </div>
  `;

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
}

function submitSavingsFunds(formData) {
  const id = String(formData.get("id") || "");
  const operation = String(formData.get("operation") || "add");
  const amount = parseNumber(formData.get("amount"));
  const currency = sanitizeCurrency(formData.get("currency"), state.settings.defaultCurrency);
  const item = state.savings.find((entry) => entry.id === id);

  if (!item) {
    showToast("Накопление не найдено");
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Введите сумму больше 0");
    return;
  }

  const isWithdraw = operation === "withdraw";
  if (item.kind === "account") {
    const next = isWithdraw ? item.balance - amount : item.balance + amount;
    if (next < 0) {
      showToast("Недостаточно средств");
      return;
    }
    item.balance = next;
  } else {
    item.balances = normalizeGoalBalancesMap(item.balances);
    const current = Number(item.balances[currency] || 0);
    const next = isWithdraw ? current - amount : current + amount;
    if (next < 0) {
      showToast("Недостаточно средств");
      return;
    }
    item.balances[currency] = next;
  }

  saveSavings();
  closeModal();
  render();
  showToast(isWithdraw ? "Средства списаны" : "Средства добавлены");
}

function deleteSavingsItem(id) {
  const item = state.savings.find((entry) => entry.id === id);
  if (!item) {
    return;
  }
  if (!window.confirm(`Удалить «${item.name}»?`)) {
    return;
  }
  state.savings = state.savings.filter((entry) => entry.id !== id);
  saveSavings();
  render();
  showToast("Накопление удалено");
}

function openManageCategoriesModal(prefillType = "expense", prefillName = "") {
  const expense = getCategoriesByType("expense");
  const income = getCategoriesByType("income");

  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="Управление категориями">
      <div class="modal-head">
        <h2>Управление категориями</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Закрыть</button>
      </div>

      <div class="category-columns">
        <div>
          <h3>Расходы</h3>
          <div class="category-list">${expense.map((cat) => categoryItemTemplate(cat)).join("")}</div>
        </div>
        <div>
          <h3>Доходы</h3>
          <div class="category-list">${income.map((cat) => categoryItemTemplate(cat)).join("")}</div>
        </div>
      </div>

      <form class="form-grid" data-form="category-add">
        <div class="grid-2">
          <div class="field">
            <label for="cat-name">Название</label>
            <input id="cat-name" name="name" type="text" value="${escapeHtml(prefillName)}" placeholder="Новая категория" />
          </div>
          <div class="field">
            <label for="cat-type">Тип</label>
            <select id="cat-type" name="type">
              <option value="expense" ${prefillType === "expense" ? "selected" : ""}>Расход</option>
              <option value="income" ${prefillType === "income" ? "selected" : ""}>Доход</option>
            </select>
          </div>
        </div>
        <button class="btn-brand" type="submit">Добавить категорию</button>
      </form>
    </div>
  `;

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
}

function categoryItemTemplate(cat) {
  return `
    <div class="category-item">
      <div>
        ${escapeHtml(cat.name)} ${cat.isSystem ? "<span class='tag-system'>системная</span>" : ""}
      </div>
      <div class="category-actions">
        <button class="btn-secondary btn-small" data-action="category-rename" data-id="${cat.id}" type="button">Переименовать</button>
        <button class="btn-secondary btn-small" data-action="category-up" data-id="${cat.id}" type="button">↑</button>
        <button class="btn-secondary btn-small" data-action="category-down" data-id="${cat.id}" type="button">↓</button>
        <button class="btn-danger btn-small" data-action="category-delete" data-id="${cat.id}" type="button">Удалить</button>
      </div>
    </div>
  `;
}

function renameCategory(categoryId) {
  const cat = findCategoryById(categoryId);
  if (!cat) {
    return;
  }

  const nextName = window.prompt("Новое имя категории", cat.name);
  if (nextName === null) {
    return;
  }

  const name = String(nextName).trim();
  if (!name) {
    showToast("Название не может быть пустым");
    return;
  }

  const duplicate = state.categories.find((item) => {
    return item.id !== cat.id && item.type === cat.type && normalize(item.name) === normalize(name);
  });
  if (duplicate) {
    showToast("Категория с таким именем уже существует");
    return;
  }

  cat.name = name;
  saveCategories();
  openManageCategoriesModal(cat.type);
  render();
  showToast("Категория переименована");
}

function addCategory(type, name) {
  if (!name) {
    showToast("Введите название категории");
    return;
  }

  const t = sanitizeType(type);
  if (findCategoryByName(t, name)) {
    showToast("Категория уже существует");
    return;
  }

  const maxOrder = getCategoriesByType(t).reduce((max, item) => Math.max(max, item.order), -1);
  state.categories.push({
    id: uid("cat"),
    type: t,
    name,
    isSystem: false,
    order: maxOrder + 1
  });

  saveCategories();
  openManageCategoriesModal(t);
  render();
  showToast("Категория добавлена");
}

function deleteCategory(categoryId) {
  const cat = findCategoryById(categoryId);
  if (!cat) {
    return;
  }

  if (cat.isSystem) {
    showToast("Системную категорию удалить нельзя");
    return;
  }

  const ok = window.confirm(`Удалить категорию «${cat.name}»?`);
  if (!ok) {
    return;
  }

  const otherId = ensureOtherCategory(cat.type);

  state.transactions = state.transactions.map((tx) => {
    if (tx.categoryId === cat.id) {
      return { ...tx, categoryId: otherId };
    }
    return tx;
  });

  state.budgets = state.budgets.map((b) => {
    if (b.categoryId === cat.id) {
      return { ...b, categoryId: otherId };
    }
    return b;
  });

  state.recurring = state.recurring.map((rule) => {
    if (rule.categoryId === cat.id) {
      return { ...rule, categoryId: otherId };
    }
    return rule;
  });

  state.categories = state.categories.filter((c) => c.id !== cat.id);
  normalizeCategoryOrder(cat.type);

  saveAll();
  openManageCategoriesModal(cat.type);
  render();
  showToast("Категория удалена");
}

function moveCategory(categoryId, direction) {
  const cat = findCategoryById(categoryId);
  if (!cat) {
    return;
  }

  const list = getCategoriesByType(cat.type);
  const index = list.findIndex((item) => item.id === cat.id);
  const targetIndex = index + direction;

  if (index < 0 || targetIndex < 0 || targetIndex >= list.length) {
    return;
  }

  const swapped = [...list];
  const tmp = swapped[index];
  swapped[index] = swapped[targetIndex];
  swapped[targetIndex] = tmp;

  swapped.forEach((item, idx) => {
    const original = findCategoryById(item.id);
    if (original) {
      original.order = idx;
    }
  });

  saveCategories();
  openManageCategoriesModal(cat.type);
  render();
}

function openRecurringModal() {
  modalRoot.innerHTML = `
    <div class="modal glass" role="dialog" aria-modal="true" aria-label="Добавить повторяющийся платеж">
      <div class="modal-head">
        <h2>Новый повторяющийся платеж</h2>
        <button class="btn-secondary" data-action="close-modal" type="button">Закрыть</button>
      </div>
      <form class="form-grid" data-form="recurring-add">
        <div class="grid-2">
          <div class="field">
            <label for="rec-type">Тип</label>
            <select id="rec-type" name="type">
              <option value="expense">Расход</option>
              <option value="income">Доход</option>
            </select>
          </div>
          <div class="field">
            <label for="rec-schedule">Расписание</label>
            <select id="rec-schedule" name="schedule">
              <option value="monthly">Ежемесячно</option>
              <option value="weekly">Еженедельно</option>
            </select>
          </div>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="rec-amount">Сумма</label>
            <input id="rec-amount" name="amount" type="text" placeholder="0,00" />
          </div>
          <div class="field">
            <label for="rec-currency">Валюта</label>
            <select id="rec-currency" name="currency">${currencyOptions(state.settings.defaultCurrency)}</select>
          </div>
        </div>
        <div class="field">
          <label for="rec-category">Категория</label>
          <select id="rec-category" name="categoryId">${categoryOptions("expense", "")}</select>
        </div>
        <div class="grid-2">
          <div class="field">
            <label for="rec-day-month">День месяца (1-31)</label>
            <input id="rec-day-month" name="dayOfMonth" type="number" min="1" max="31" value="1" />
          </div>
          <div class="field">
            <label for="rec-day-week">День недели</label>
            <select id="rec-day-week" name="dayOfWeek">
              <option value="1">Понедельник</option>
              <option value="2">Вторник</option>
              <option value="3">Среда</option>
              <option value="4">Четверг</option>
              <option value="5">Пятница</option>
              <option value="6">Суббота</option>
              <option value="0">Воскресенье</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="rec-note">Заметка</label>
          <input id="rec-note" name="note" type="text" placeholder="Необязательно" />
        </div>
        <button class="btn-brand" type="submit">Сохранить</button>
      </form>
    </div>
  `;

  const typeEl = modalRoot.querySelector("#rec-type");
  const catEl = modalRoot.querySelector("#rec-category");
  typeEl.addEventListener("change", () => {
    catEl.innerHTML = categoryOptions(typeEl.value, "");
  });

  modalRoot.classList.remove("hidden");
  modalRoot.setAttribute("aria-hidden", "false");
}

function addRecurringRule(formData) {
  const type = sanitizeType(formData.get("type"));
  const schedule = formData.get("schedule") === "weekly" ? "weekly" : "monthly";
  const amount = parseNumber(formData.get("amount"));
  const currency = sanitizeCurrency(formData.get("currency"), state.settings.defaultCurrency);
  const categoryId = String(formData.get("categoryId") || "");
  const note = String(formData.get("note") || "").trim();
  const dayOfMonthRaw = Number(formData.get("dayOfMonth"));
  const dayOfWeekRaw = Number(formData.get("dayOfWeek"));

  if (!(amount > 0)) {
    showToast("Сумма должна быть больше 0");
    return;
  }

  const cat = findCategoryById(categoryId);
  if (!cat || cat.type !== type) {
    showToast("Выберите корректную категорию");
    return;
  }

  const rule = {
    id: uid("rec"),
    type,
    amount,
    currency,
    categoryId,
    note,
    schedule,
    dayOfMonth: Math.min(31, Math.max(1, Number.isFinite(dayOfMonthRaw) ? Math.floor(dayOfMonthRaw) : 1)),
    dayOfWeek: Math.min(6, Math.max(0, Number.isFinite(dayOfWeekRaw) ? Math.floor(dayOfWeekRaw) : 1)),
    lastGenerated: ""
  };

  state.recurring.push(rule);
  saveRecurring();
  closeModal();
  render();
  showToast("Повторяющийся платеж добавлен");
}

function deleteRecurringRule(id) {
  const rule = state.recurring.find((item) => item.id === id);
  if (!rule) {
    return;
  }
  if (!window.confirm("Удалить повторяющийся платеж?")) {
    return;
  }
  state.recurring = state.recurring.filter((item) => item.id !== id);
  saveRecurring();
  render();
  showToast("Повторяющийся платеж удален");
}

function normalizeRecurring(raw, categoriesMap) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const type = sanitizeType(item.type);
      const amount = parseNumber(item.amount);
      if (!(amount > 0)) {
        return null;
      }
      const categoryId = String(item.categoryId || "");
      const cat = categoriesMap.get(categoryId);
      if (!cat || cat.type !== type) {
        return null;
      }
      return {
        id: String(item.id || uid("rec")),
        type,
        amount,
        currency: sanitizeCurrency(item.currency, DEFAULT_SETTINGS.defaultCurrency),
        categoryId,
        note: String(item.note || "").trim(),
        schedule: item.schedule === "weekly" ? "weekly" : "monthly",
        dayOfMonth: Math.min(31, Math.max(1, Number(item.dayOfMonth) || 1)),
        dayOfWeek: Math.min(6, Math.max(0, Number(item.dayOfWeek) || 1)),
        lastGenerated: /^\d{4}-\d{2}-\d{2}$/.test(String(item.lastGenerated || "")) ? String(item.lastGenerated) : ""
      };
    })
    .filter(Boolean);
}

function normalizeSavings(raw, fallbackCurrency = DEFAULT_SETTINGS.defaultCurrency) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const kind = sanitizeSavingsKind(item.kind);
      const name = String(item.name || "").trim();
      if (!name) {
        return null;
      }

      if (kind === "account") {
        const balance = parseNumber(item.balance);
        const normalizedBalance = Number.isFinite(balance) && balance >= 0 ? balance : 0;
        return {
          id: String(item.id || uid("sav")),
          kind: "account",
          name,
          currency: sanitizeCurrency(item.currency, fallbackCurrency || DEFAULT_SETTINGS.defaultCurrency),
          balance: normalizedBalance,
          createdAt: sanitizeDateISO(item.createdAt)
        };
      }

      const migratedCurrency = sanitizeCurrency(
        item.currency || item.targetCurrency,
        fallbackCurrency || DEFAULT_SETTINGS.defaultCurrency
      );
      const migratedBalance = parseNumber(item.balance);
      const migratedBalanceSafe = Number.isFinite(migratedBalance) && migratedBalance >= 0 ? migratedBalance : 0;
      const balances = normalizeGoalBalancesMap(item.balances);
      if (migratedBalanceSafe > 0 || (item.currency && !Object.prototype.hasOwnProperty.call(balances, migratedCurrency))) {
        balances[migratedCurrency] = Math.max(Number(balances[migratedCurrency] || 0), migratedBalanceSafe);
      }

      const targetRaw = parseNumber(item.target);
      const target = Number.isFinite(targetRaw) && targetRaw > 0 ? targetRaw : 1;
      const targetCurrency = sanitizeCurrency(
        item.targetCurrency || item.currency,
        fallbackCurrency || DEFAULT_SETTINGS.defaultCurrency
      );
      const baseCurrency = sanitizeCurrency(item.baseCurrency, targetCurrency || fallbackCurrency || DEFAULT_SETTINGS.defaultCurrency);
      const ratesToBase = normalizeGoalRatesMap(item.ratesToBase);

      return {
        id: String(item.id || uid("sav")),
        kind: "goal",
        name,
        target,
        targetCurrency,
        baseCurrency,
        deadline: sanitizeOptionalDateISO(item.deadline),
        balances,
        ratesToBase,
        createdAt: sanitizeDateISO(item.createdAt)
      };
    })
    .filter(Boolean);
}

function applyRecurringTransactions() {
  const today = dateISO(new Date());
  let hasChanges = false;

  state.recurring.forEach((rule) => {
    const fromDate = rule.lastGenerated || today;
    const dates = dueDatesBetween(fromDate, today, rule);
    if (!dates.length) {
      if (!rule.lastGenerated) {
        rule.lastGenerated = today;
        hasChanges = true;
      }
      return;
    }

    dates.forEach((d) => {
      state.transactions.push({
        id: nextId(),
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
        categoryId: rule.categoryId,
        dateISO: d,
        note: rule.note || "Повторяющийся платеж"
      });
    });

    rule.lastGenerated = today;
    hasChanges = true;
  });

  if (hasChanges) {
    saveTransactions();
    saveRecurring();
  }
}

function dueDatesBetween(fromISO, toISO, rule) {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return [];
  }

  const dates = [];
  const start = new Date(from);
  start.setDate(start.getDate() + 1);

  for (let d = new Date(start); d <= to; d.setDate(d.getDate() + 1)) {
    if (rule.schedule === "weekly") {
      if (d.getDay() === rule.dayOfWeek) {
        dates.push(dateISO(d));
      }
    } else if (d.getDate() === rule.dayOfMonth) {
      dates.push(dateISO(d));
    }
  }
  return dates;
}

function exportJsonToTextarea() {
  const textarea = viewRoot.querySelector("#io-json");
  if (!textarea) {
    return;
  }

  const payload = {
    settings: state.settings,
    categories: state.categories,
    transactions: state.transactions,
    budgets: state.budgets,
    recurring: state.recurring,
    savings: state.savings
  };

  state.ui.ioText = JSON.stringify(payload, null, 2);
  state.ui.ioStatus = "Экспортировано в поле ниже";
  render();
  showToast("JSON экспортирован");
}

function importJsonFromTextarea() {
  const textarea = viewRoot.querySelector("#io-json");
  if (!textarea) {
    return;
  }

  const raw = textarea.value.trim();
  state.ui.ioText = textarea.value;
  if (!raw) {
    state.ui.ioStatus = "Ошибка: вставьте JSON";
    render();
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    state.ui.ioStatus = "Ошибка: некорректный JSON";
    render();
    return;
  }

  const result = validateImportedPayload(parsed);
  if (!result.ok) {
    state.ui.ioStatus = `Ошибка: ${result.message}`;
    render();
    return;
  }

  state.settings = result.settings;
  state.categories = result.categories;
  state.transactions = result.transactions;
  state.budgets = result.budgets;
  state.recurring = result.recurring;
  state.savings = result.savings;

  ensureDataIntegrity();
  saveAll();

  state.ui.reportCurrency = state.settings.defaultCurrency;
  state.ui.ioStatus = "Импорт выполнен успешно";
  render();
  showToast("Данные импортированы");
}

function validateImportedPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "ожидался объект" };
  }

  const settings = normalizeSettings(payload.settings || DEFAULT_SETTINGS);
  const categories = normalizeCategories(Array.isArray(payload.categories) ? payload.categories : []);
  if (!categories.length) {
    return { ok: false, message: "категории отсутствуют" };
  }

  const categoriesMap = new Map(categories.map((c) => [c.id, c]));
  const transactions = normalizeTransactions(
    Array.isArray(payload.transactions) ? payload.transactions : [],
    categoriesMap
  );
  const budgets = normalizeBudgets(
    Array.isArray(payload.budgets) ? payload.budgets : [],
    categoriesMap
  );
  const recurring = normalizeRecurring(
    Array.isArray(payload.recurring) ? payload.recurring : [],
    categoriesMap
  );
  const savings = normalizeSavings(
    Array.isArray(payload.savings) ? payload.savings : [],
    settings.defaultCurrency
  );

  return { ok: true, settings, categories, transactions, budgets, recurring, savings };
}

function resetAllData() {
  const ok = window.confirm("Сбросить все данные? Это действие необратимо.");
  if (!ok) {
    return;
  }

  state.transactions = [];
  state.budgets = [];
  state.recurring = [];
  state.savings = [];
  state.categories = seedDefaultCategories();
  state.settings = { ...DEFAULT_SETTINGS };
  state.ui.reportCurrency = state.settings.defaultCurrency;
  state.ui.ioText = "";
  state.ui.ioStatus = "Данные сброшены";

  saveAll();
  closeModal();
  render();
  showToast("Все данные сброшены");
}

function setupPwa() {
  setupManifestLink();
  registerServiceWorker();
}

function setupManifestLink() {
  try {
    const manifest = buildManifestObject();
    const manifestBlob = new Blob([JSON.stringify(manifest)], {
      type: "application/manifest+json"
    });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    let link = document.querySelector("link[rel='manifest']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "manifest");
      document.head.appendChild(link);
    }
    link.setAttribute("href", manifestUrl);
  } catch (_err) {
    showToast("PWA манифест не создан");
  }
}

function buildManifestObject() {
  const icon192 = buildIconDataUrl(192);
  const icon512 = buildIconDataUrl(512);
  return {
    name: "Финансовый трекер",
    short_name: "Финансы",
    start_url: "./",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    lang: "ru",
    icons: [
      {
        src: icon192,
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any maskable"
      },
      {
        src: icon512,
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  };
}

function buildIconDataUrl(size) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#000000"/>
          <stop offset="35%" stop-color="#C10801"/>
          <stop offset="72%" stop-color="#F16001"/>
          <stop offset="100%" stop-color="#D9C3AB"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="110" fill="#000000"/>
      <circle cx="256" cy="256" r="188" fill="url(#g)"/>
      <circle cx="256" cy="256" r="176" fill="none" stroke="#E85002" stroke-width="12" opacity="0.9"/>
      <path d="M188 284h136c30 0 47-16 47-40c0-22-15-36-44-36h-58c-22 0-32-8-32-21c0-12 9-20 27-20h111"
            fill="none" stroke="#F9F9F9" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `.trim();
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("./sw.js");

    pwaState.swRegistration = registration;
    monitorServiceWorkerUpdates(registration);

    if (registration.waiting) {
      showUpdateToast(registration);
    }

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (pwaState.reloading) {
        return;
      }
      pwaState.reloading = true;
      window.location.reload();
    });
  } catch (err) {
    console.error("Service Worker registration failed:", err);
  }
}

function monitorServiceWorkerUpdates(registration) {
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) {
      return;
    }

    installing.addEventListener("statechange", () => {
      if (installing.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateToast(registration);
      }
    });
  });
}

function showUpdateToast(registration) {
  showToast("Обновление доступно — перезагрузить", {
    label: "Перезагрузить",
    onClick: () => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    }
  }, 12000);
}

function initAnalyticsCharts() {
  if (typeof Chart === "undefined") {
    return;
  }

  const barCanvas = document.getElementById("monthly-expenses-chart");
  const donutCanvas = document.getElementById("category-expenses-chart");
  if (!barCanvas || !donutCanvas) {
    return;
  }

  if (monthlyChart) {
    monthlyChart.destroy();
  }
  if (categoryChart) {
    categoryChart.destroy();
  }

  const sixMonths = getLastMonths(state.ui.analyticsMonth, 6);
  const currency = state.ui.reportCurrency;

  const monthlyData = sixMonths.map((mk) => {
    return state.transactions
      .filter((tx) => tx.type === "expense" && tx.currency === currency && tx.dateISO.startsWith(mk))
      .reduce((sum, tx) => sum + tx.amount, 0);
  });

  monthlyChart = new Chart(barCanvas, {
    type: "bar",
    data: {
      labels: sixMonths.map(formatMonthLabel),
      datasets: [{
        label: `Расходы (${currency})`,
        data: monthlyData,
        backgroundColor: "#FF6A00",
        hoverBackgroundColor: "#FF8C2E",
        borderColor: "#FF7A18",
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { labels: { color: "#f9f9f9" } }
      },
      scales: {
        x: { ticks: { color: "#a7a7a7" }, grid: { color: "rgba(255,255,255,0.08)" } },
        y: { ticks: { color: "#a7a7a7" }, grid: { color: "rgba(255,255,255,0.08)" } }
      }
    }
  });

  const catTotalsMap = new Map();
  state.transactions
    .filter(
      (tx) => tx.type === "expense" && tx.currency === currency && tx.dateISO.startsWith(state.ui.analyticsMonth)
    )
    .forEach((tx) => {
      const cat = findCategoryById(tx.categoryId);
      const name = cat ? cat.name : "Без категории";
      catTotalsMap.set(name, (catTotalsMap.get(name) || 0) + tx.amount);
    });

  const donutLabels = Array.from(catTotalsMap.keys());
  const donutData = Array.from(catTotalsMap.values());
  const donutColors = donutData.length
    ? donutData.map((_value, index) => getCategoryColor(index, donutData.length))
    : ["#333333"];
  const donutHoverColors = donutData.length
    ? donutData.map((_value, index) => getCategoryHoverColor(index, donutData.length))
    : ["#4a4a4a"];

  categoryChart = new Chart(donutCanvas, {
    type: "doughnut",
    data: {
      labels: donutLabels.length ? donutLabels : ["Нет данных"],
      datasets: [{
        data: donutData.length ? donutData : [1],
        backgroundColor: donutColors,
        hoverBackgroundColor: donutHoverColors,
        borderColor: "rgba(0,0,0,0.42)",
        borderWidth: 1.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          labels: {
            color: "#f9f9f9",
            boxWidth: 12
          }
        }
      }
    }
  });
}

async function loadAll() {
  const [rawSettings, rawCategories, rawBudgets, rawRecurring, rawSavings, rawTransactions] = await Promise.all([
    loadMetaDoc("settings_main", DEFAULT_SETTINGS),
    loadMetaDoc("categories_list", null),
    loadMetaDoc("budgets_list", []),
    loadMetaDoc("recurring_list", []),
    loadMetaDoc("savings_list", []),
    loadTransactionsFromFirestore()
  ]);

  state.settings = normalizeSettings(rawSettings);
  state.categories = Array.isArray(rawCategories) && rawCategories.length
    ? normalizeCategories(rawCategories)
    : seedDefaultCategories();

  const categoriesMap = new Map(state.categories.map((c) => [c.id, c]));
  state.transactions = normalizeTransactions(rawTransactions, categoriesMap);
  state.budgets = normalizeBudgets(rawBudgets, categoriesMap);
  state.recurring = normalizeRecurring(rawRecurring, categoriesMap);
  state.savings = normalizeSavings(rawSavings, state.settings.defaultCurrency);

  ensureDataIntegrity();
  applyRecurringTransactions();
  state.ui.reportCurrency = state.settings.defaultCurrency;

  saveAll();
}

function ensureDataIntegrity() {
  ensureOtherCategory("expense");
  ensureOtherCategory("income");

  const categoriesMap = new Map(state.categories.map((c) => [c.id, c]));

  state.transactions = state.transactions.map((tx) => {
    const cat = categoriesMap.get(tx.categoryId);
    if (!cat || cat.type !== tx.type) {
      return { ...tx, categoryId: ensureOtherCategory(tx.type) };
    }
    return tx;
  });

  state.budgets = state.budgets.filter((b) => {
    const cat = categoriesMap.get(b.categoryId);
    return Boolean(cat && cat.type === "expense");
  });

  state.recurring = state.recurring.map((rule) => {
    const cat = categoriesMap.get(rule.categoryId);
    if (!cat || cat.type !== rule.type) {
      return { ...rule, categoryId: ensureOtherCategory(rule.type) };
    }
    return rule;
  });

  normalizeCategoryOrder("expense");
  normalizeCategoryOrder("income");
}

function saveAll() {
  saveTransactions();
  saveCategories();
  saveBudgets();
  saveSettings();
  saveRecurring();
  saveSavings();
}

function saveTransactions() {
  if (!currentUser) {
    return;
  }
  syncTransactionsToFirestore().catch(() => {
    showToast("Ошибка сохранения операций");
  });
}

function saveCategories() {
  if (!currentUser) {
    return;
  }
  saveMetaDoc("categories_list", state.categories).catch(() => {
    showToast("Ошибка сохранения категорий");
  });
}

function saveBudgets() {
  if (!currentUser) {
    return;
  }
  saveMetaDoc("budgets_list", state.budgets).catch(() => {
    showToast("Ошибка сохранения бюджетов");
  });
}

function saveSettings() {
  if (!currentUser) {
    return;
  }
  saveMetaDoc("settings_main", state.settings).catch(() => {
    showToast("Ошибка сохранения настроек");
  });
}

function saveRecurring() {
  if (!currentUser) {
    return;
  }
  saveMetaDoc("recurring_list", state.recurring).catch(() => {
    showToast("Ошибка сохранения повторяющихся платежей");
  });
}

function saveSavings() {
  if (!currentUser) {
    return;
  }
  saveMetaDoc("savings_list", state.savings).catch(() => {
    showToast("Ошибка сохранения накоплений");
  });
}

function userMetaDocRef(name) {
  if (!currentUser) {
    return null;
  }
  return doc(db, "users", currentUser.uid, "meta", name);
}

function userTxCollectionRef() {
  if (!currentUser) {
    return null;
  }
  return collection(db, "users", currentUser.uid, "transactions");
}

async function loadMetaDoc(name, fallback) {
  const ref = userMetaDocRef(name);
  if (!ref) {
    return fallback;
  }
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return fallback;
  }
  const data = snap.data() || {};
  if (!Object.prototype.hasOwnProperty.call(data, "value")) {
    return fallback;
  }
  return data.value;
}

async function saveMetaDoc(name, value) {
  const ref = userMetaDocRef(name);
  if (!ref) {
    return;
  }
  await setDoc(ref, { value }, { merge: true });
}

async function loadTransactionsFromFirestore() {
  const txCol = userTxCollectionRef();
  if (!txCol) {
    return [];
  }
  const snapshot = await getDocs(txCol);
  return snapshot.docs.map((d) => d.data() || {});
}

async function syncTransactionsToFirestore() {
  const txCol = userTxCollectionRef();
  if (!txCol) {
    return;
  }

  const snapshot = await getDocs(txCol);
  const existingIds = new Set(snapshot.docs.map((d) => d.id));
  const desiredIds = new Set(state.transactions.map((tx) => String(tx.id)));
  const batch = writeBatch(db);

  state.transactions.forEach((tx) => {
    const ref = doc(db, "users", currentUser.uid, "transactions", String(tx.id));
    batch.set(ref, tx);
  });

  snapshot.docs.forEach((d) => {
    if (!desiredIds.has(d.id)) {
      batch.delete(d.ref);
    }
  });

  await batch.commit();
}

function seedDefaultCategories() {
  const out = [];
  ["expense", "income"].forEach((type) => {
    DEFAULT_CATEGORY_NAMES[type].forEach((name, index) => {
      out.push({
        id: uid("cat"),
        type,
        name,
        isSystem: true,
        order: index
      });
    });
  });
  return out;
}

function normalizeCategories(raw) {
  const safe = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const type = sanitizeType(item.type);
    const name = String(item.name || "").trim();
    if (!name) {
      return;
    }
    safe.push({
      id: String(item.id || uid("cat")),
      type,
      name,
      isSystem: Boolean(item.isSystem),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index
    });
  });

  const dedup = [];
  const seen = new Set();
  safe.forEach((cat) => {
    const key = `${cat.type}::${normalize(cat.name)}`;
    if (!seen.has(key)) {
      dedup.push(cat);
      seen.add(key);
    }
  });

  return dedup;
}

function normalizeTransactions(raw, categoriesMap) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const type = sanitizeType(item.type);
      const amount = parseNumber(item.amount);
      if (!(amount > 0)) {
        return null;
      }

      const currency = sanitizeCurrency(item.currency, DEFAULT_SETTINGS.defaultCurrency);
      const categoryId = String(item.categoryId || "");
      const date = sanitizeDateISO(item.dateISO);
      const note = String(item.note || "").trim();
      const rawId = Number(item.id);
      const id = Number.isFinite(rawId) ? rawId : nextId();

      let finalCategoryId = categoryId;
      const cat = categoriesMap.get(categoryId);
      if (!cat || cat.type !== type) {
        finalCategoryId = "";
      }

      return {
        id,
        type,
        amount,
        currency,
        categoryId: finalCategoryId,
        dateISO: date,
        note
      };
    })
    .filter(Boolean);
}

function normalizeBudgets(raw, categoriesMap) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set();
  const out = [];

  raw.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const monthKey = sanitizeMonthKey(item.monthKey, "");
    const categoryId = String(item.categoryId || "");
    const amount = parseNumber(item.amount);
    const currency = sanitizeCurrency(item.currency, DEFAULT_SETTINGS.defaultCurrency);
    const cat = categoriesMap.get(categoryId);

    if (!monthKey || !(amount > 0) || !cat || cat.type !== "expense") {
      return;
    }

    const key = `${monthKey}|${categoryId}|${currency}`;
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    out.push({ monthKey, categoryId, amount, currency });
  });

  return out;
}

function normalizeSettings(raw) {
  const baseCurrency = sanitizeCurrency(raw && raw.baseCurrency, DEFAULT_SETTINGS.baseCurrency);
  const defaultCurrency = sanitizeCurrency(raw && raw.defaultCurrency, DEFAULT_SETTINGS.defaultCurrency);
  return { baseCurrency, defaultCurrency };
}

function ensureOtherCategory(type) {
  const normalizedType = sanitizeType(type);
  const existing = findCategoryByName(normalizedType, "Другое");
  if (existing) {
    return existing.id;
  }

  const maxOrder = getCategoriesByType(normalizedType).reduce((max, c) => Math.max(max, c.order), -1);
  const cat = {
    id: uid("cat"),
    type: normalizedType,
    name: "Другое",
    isSystem: true,
    order: maxOrder + 1
  };
  state.categories.push(cat);
  return cat.id;
}

function normalizeCategoryOrder(type) {
  const list = getCategoriesByType(type);
  list.forEach((cat, idx) => {
    const target = findCategoryById(cat.id);
    if (target) {
      target.order = idx;
    }
  });
}

function getCategoriesByType(type) {
  const t = sanitizeType(type);
  return state.categories
    .filter((c) => c.type === t)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ru"));
}

function findCategoryById(id) {
  return state.categories.find((c) => c.id === id) || null;
}

function findCategoryByName(type, name) {
  const n = normalize(name);
  return state.categories.find((c) => c.type === sanitizeType(type) && normalize(c.name) === n) || null;
}

function parseQuickInput(text) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return { ok: false, message: "Пустой ввод" };
  }

  const amountToken = tokens.shift();
  const amountRaw = amountToken.replace(/,/g, ".");
  const amount = Number.parseFloat(amountRaw);

  if (!Number.isFinite(amount) || amount === 0) {
    return { ok: false, message: "Неверная сумма" };
  }

  const type = amountRaw.startsWith("+") ? "income" : "expense";
  const positiveAmount = Math.abs(amount);

  let currency = "";
  if (tokens.length) {
    const maybeCurrency = String(tokens[tokens.length - 1]).toUpperCase();
    if (CURRENCIES.includes(maybeCurrency)) {
      currency = maybeCurrency;
      tokens.pop();
    }
  }

  const categoryName = tokens.join(" ").trim();
  if (!categoryName) {
    return { ok: false, message: "Укажите категорию" };
  }

  return {
    ok: true,
    type,
    amount: positiveAmount,
    currency,
    categoryName
  };
}

function currencyOptions(selected) {
  return CURRENCIES.map((currency) => {
    return `<option value="${currency}" ${currency === selected ? "selected" : ""}>${currency}</option>`;
  }).join("");
}

function savingsCurrencyFilterOptions(selected) {
  return CURRENCIES.map((currency) => {
    const isSelected = selected !== "all" && currency === selected;
    return `<option value="${currency}" ${isSelected ? "selected" : ""}>${currency}</option>`;
  }).join("");
}

function categoryOptions(type, selectedId) {
  return getCategoriesByType(type)
    .map((cat) => `<option value="${cat.id}" ${cat.id === selectedId ? "selected" : ""}>${escapeHtml(cat.name)}</option>`)
    .join("");
}

function nextId() {
  return Date.now() + Math.floor(Math.random() * 100000);
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeType(value) {
  return value === "income" ? "income" : "expense";
}

function sanitizeSavingsKind(value) {
  return value === "goal" ? "goal" : "account";
}

function sanitizeSavingsKindFilter(value) {
  if (value === "account" || value === "goal") {
    return value;
  }
  return "all";
}

function sanitizeSavingsCurrencyFilter(value) {
  return value === "all" ? "all" : sanitizeCurrency(value, "all");
}

function sanitizeCurrency(value, fallback) {
  const code = String(value || "").toUpperCase();
  return CURRENCIES.includes(code) ? code : fallback;
}

function sanitizeDateISO(value) {
  const str = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : dateISO(new Date());
}

function sanitizeOptionalDateISO(value) {
  const str = String(value || "");
  if (!str) {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : "";
}

function sanitizeMonthKey(value, fallback) {
  const str = String(value || "");
  return /^\d{4}-\d{2}$/.test(str) ? str : fallback;
}

function dateISO(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function monthKeyOf(date) {
  return dateISO(date).slice(0, 7);
}

function parseNumber(value) {
  const n = String(value || "").trim().replace(/\s+/g, "").replace(/,/g, ".");
  return Number.parseFloat(n);
}

function formatAmount(value) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatSigned(value) {
  const num = Number(value) || 0;
  const sign = num > 0 ? "+" : num < 0 ? "−" : "";
  return `${sign}${formatAmount(Math.abs(num))}`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatMonthLabel(monthKey) {
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" });
}

function getLastMonths(endMonthKey, count) {
  const [year, month] = endMonthKey.split("-").map(Number);
  const end = new Date(year, month - 1, 1);
  const result = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    result.push(monthKeyOf(d));
  }

  return result;
}

function getCategoryColor(index, total) {
  const palette = [
    "#FF6A00",
    "#FF8C2E",
    "#FF3B1F",
    "#FFA24C",
    "#C10801",
    "#FFB36B",
    "#FF7A18"
  ];
  if (index < palette.length) {
    return palette[index];
  }
  const base = palette[index % palette.length];
  const cycle = Math.floor(index / palette.length);
  const delta = cycle % 2 === 0 ? -8 - cycle * 2 : 8 + cycle * 2;
  return adjustHexColor(base, delta);
}

function getCategoryHoverColor(index, total) {
  const base = getCategoryColor(index, total);
  return adjustHexColor(base, 12);
}

function normalizeGoalBalancesMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") {
    return out;
  }
  Object.entries(raw).forEach(([currency, value]) => {
    const cur = sanitizeCurrency(currency, "");
    if (!cur) {
      return;
    }
    const amount = parseNumber(value);
    out[cur] = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  });
  return out;
}

function normalizeGoalRatesMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") {
    return out;
  }
  Object.entries(raw).forEach(([currency, value]) => {
    const cur = sanitizeCurrency(currency, "");
    if (!cur) {
      return;
    }
    const rate = parseNumber(value);
    if (Number.isFinite(rate) && rate > 0) {
      out[cur] = rate;
    }
  });
  return out;
}

function parseGoalRatesFromForm(formData, baseCurrency) {
  const rates = {};
  for (const currency of CURRENCIES) {
    if (currency === baseCurrency) {
      continue;
    }
    const raw = String(formData.get(`rate_${currency}`) || "").trim();
    if (!raw) {
      continue;
    }
    const rate = parseNumber(raw);
    if (!Number.isFinite(rate) || rate <= 0) {
      return { ok: false, message: `Некорректный курс для ${currency}` };
    }
    rates[currency] = rate;
  }
  return { ok: true, value: rates };
}

function computeGoalProgress(goal) {
  const targetCurrency = sanitizeCurrency(
    goal && goal.targetCurrency,
    state.settings.defaultCurrency
  );
  const baseCurrency = sanitizeCurrency(
    goal && goal.baseCurrency,
    targetCurrency || state.settings.defaultCurrency
  );
  const balances = normalizeGoalBalancesMap(goal && goal.balances);
  const rates = normalizeGoalRatesMap(goal && goal.ratesToBase);
  const missingRateCurrencies = [];
  let totalInBase = 0;

  Object.entries(balances).forEach(([currency, rawAmount]) => {
    const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
    if (amount <= 0) {
      return;
    }
    if (currency === baseCurrency) {
      totalInBase += amount;
      return;
    }
    const rate = Number(rates[currency]);
    if (Number.isFinite(rate) && rate > 0) {
      totalInBase += amount * rate;
    } else {
      missingRateCurrencies.push(currency);
    }
  });

  const safeTarget = Number.isFinite(Number(goal && goal.target)) && Number(goal.target) > 0
    ? Number(goal.target)
    : 0;
  let targetInBase = null;

  if (safeTarget > 0) {
    if (targetCurrency === baseCurrency) {
      targetInBase = safeTarget;
    } else {
      const targetRate = Number(rates[targetCurrency]);
      if (Number.isFinite(targetRate) && targetRate > 0) {
        targetInBase = safeTarget * targetRate;
      }
    }
  }

  const canCompute = Number.isFinite(targetInBase) && targetInBase > 0;
  const percent = canCompute ? Math.min(100, (totalInBase / targetInBase) * 100) : 0;

  return {
    baseCurrency,
    targetCurrency,
    totalInBase,
    targetInBase: canCompute ? targetInBase : null,
    percent,
    canCompute,
    missingRateCurrencies
  };
}

function adjustHexColor(hex, delta) {
  const safeHex = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) {
    return "#E85002";
  }
  const r = clampColor(parseInt(safeHex.slice(0, 2), 16) + delta);
  const g = clampColor(parseInt(safeHex.slice(2, 4), 16) + delta);
  const b = clampColor(parseInt(safeHex.slice(4, 6), 16) + delta);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampColor(value) {
  return Math.max(0, Math.min(255, value));
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function allCategoriesOptions(selectedId) {
  return [...state.categories]
    .sort((a, b) => a.type.localeCompare(b.type) || a.order - b.order)
    .map((cat) => {
      const prefix = cat.type === "income" ? "Доход" : "Расход";
      return `<option value="${cat.id}" ${cat.id === selectedId ? "selected" : ""}>${prefix}: ${escapeHtml(cat.name)}</option>`;
    })
    .join("");
}

function computeSavingsTotals(list, currencyFilter) {
  if (currencyFilter !== "all") {
    const total = list.reduce((sum, item) => {
      if (item.kind === "account") {
        return sum + (item.currency === currencyFilter ? Number(item.balance || 0) : 0);
      }
      const balances = normalizeGoalBalancesMap(item.balances);
      return sum + Number(balances[currencyFilter] || 0);
    }, 0);
    return { total, byCurrency: [] };
  }

  const map = new Map();
  list.forEach((item) => {
    if (item.kind === "account") {
      map.set(item.currency, (map.get(item.currency) || 0) + Number(item.balance || 0));
      return;
    }
    const balances = normalizeGoalBalancesMap(item.balances);
    Object.entries(balances).forEach(([currency, amount]) => {
      map.set(currency, (map.get(currency) || 0) + amount);
    });
  });
  const byCurrency = Array.from(map.entries())
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  return { total: 0, byCurrency };
}

function groupTransactionsByDate(transactions) {
  const today = dateISO(new Date());
  const yesterday = dateISO(new Date(Date.now() - 86400000));
  const map = new Map();

  transactions.forEach((tx) => {
    let label = formatDate(tx.dateISO);
    if (tx.dateISO === today) {
      label = "Сегодня";
    } else if (tx.dateISO === yesterday) {
      label = "Вчера";
    }
    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label).push(tx);
  });

  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function weekdayLabel(day) {
  const labels = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const idx = Number(day);
  return Number.isInteger(idx) && idx >= 0 && idx <= 6 ? labels[idx] : labels[1];
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, action = null, duration = 2000) {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  activeToastAction = null;
  if (action && typeof action.onClick === "function") {
    activeToastAction = action.onClick;
    toastEl.innerHTML = `
      <div class="toast-content">
        <span>${escapeHtml(message)}</span>
        <button class="toast-action" type="button" data-toast-action="true">${escapeHtml(action.label || "Ок")}</button>
      </div>
    `;
  } else {
    toastEl.textContent = message;
  }

  toastEl.classList.remove("hidden");
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
    activeToastAction = null;
  }, duration);
}

function closeModal() {
  modalRoot.classList.add("hidden");
  modalRoot.setAttribute("aria-hidden", "true");
  modalRoot.innerHTML = "";
}
