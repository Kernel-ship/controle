
const API = "/api";

const state = {
    settings: null,
    dashboard: null,
    history: []
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
});

function formatMoney(cents) {
    return moneyFormatter.format((Number(cents) || 0) / 100);
}

function parseMoneyToCents(value) {
    if (typeof value !== "string") return NaN;

    let normalized = value.trim().replace(/[R$\s]/g, "");

    if (!normalized) return NaN;

    if (normalized.includes(",")) {
        normalized = normalized.replace(/\./g, "").replace(",", ".");
    }

    const number = Number(normalized);

    if (!Number.isFinite(number) || number < 0) {
        return NaN;
    }

    return Math.round(number * 100);
}

function formatDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Data indisponível";
    }

    return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error("O servidor retornou uma resposta inválida.");
    }

    if (!response.ok) {
        throw new Error(result.error || "Não foi possível concluir a operação.");
    }

    return result;
}

function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");

    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function setButtonLoading(button, loading, loadingText = "Processando...") {
    if (!button) return;

    if (loading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
        button.style.opacity = "0.65";
    } else {
        button.textContent = button.dataset.originalText || "Salvar";
        button.disabled = false;
        button.style.opacity = "1";
    }
}

/* NAVEGAÇÃO */

function openPage(pageName) {
    const page = document.getElementById(`page-${pageName}`);

    if (!page) return;

    document.querySelectorAll(".page").forEach(item => {
        item.classList.remove("active");
    });

    page.classList.add("active");

    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.toggle("active", item.dataset.page === pageName);
    });

    const titles = {
        dashboard: "Dashboard",
        operations: "Operações",
        history: "Histórico",
        settings: "Configurações"
    };

    document.getElementById("pageTitle").textContent = titles[pageName];
    document.getElementById("breadcrumbPage").textContent = pageName.toUpperCase();

    document.getElementById("sidebar").classList.remove("open");

    if (pageName === "history") {
        loadHistory();
    }

    if (pageName === "settings") {
        loadSettings();
    }
}

document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        openPage(button.dataset.page);
    });
});

document.querySelectorAll("[data-goto]").forEach(button => {
    button.addEventListener("click", () => {
        openPage(button.dataset.goto);
    });
});

document.getElementById("mobileMenu").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

/* DADOS */

async function loadDashboard() {
    try {
        const [dashboardResult, settingsResult] = await Promise.all([
            apiRequest("/dashboard"),
            apiRequest("/settings")
        ]);

        state.dashboard = dashboardResult;
        state.settings = settingsResult.settings;

        renderDashboard();
        updateOperationPreviews();
    } catch (error) {
        showToast(error.message, "error");
    }
}

function renderDashboard() {
    if (!state.dashboard || !state.settings) return;

    const data = state.dashboard;
    const settings = state.settings;

    document.getElementById("stockBoxes").textContent =
        `${Number(data.stockBoxes).toLocaleString("pt-BR")} caixas`;

    document.getElementById("stockUnits").textContent =
        `${Number(data.stockUnits).toLocaleString("pt-BR")} unidades no total`;

    document.getElementById("totalPurchased").textContent =
        formatMoney(data.totalPurchasedCents);

    document.getElementById("totalPaid").textContent =
        formatMoney(data.totalPaidCents);

    document.getElementById("openBalance").textContent =
        formatMoney(data.openBalanceCents);

    document.getElementById("productNameDisplay").textContent =
        settings.productName;

    document.getElementById("unitsPerBoxDisplay").textContent =
        `${settings.unitsPerBox} unidades`;

    document.getElementById("defaultPriceDisplay").textContent =
        formatMoney(settings.defaultPriceCents);

    renderRecent(data.recentTransactions || []);
}

function renderRecent(items) {
    const container = document.getElementById("recentTransactions");

    if (!items.length) {
        container.innerHTML = `
            <div class="empty-cell">Nenhuma movimentação registrada ainda.</div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const info = getOperationInfo(item.type);

        let description = "";
        let amount = "";

        if (item.type === "purchase") {
            description = `${item.boxes} caixa(s) adicionada(s)`;
            amount = formatMoney(item.totalCents);
        } else if (item.type === "sale") {
            description = `${item.boxes} caixa(s) retirada(s)`;
            amount = "Saída de estoque";
        } else {
            description = "Pagamento registrado";
            amount = formatMoney(item.amountCents);
        }

        return `
            <div class="recent-item">
                <div class="recent-symbol ${item.type}">${info.symbol}</div>
                <div class="recent-description">
                    <strong>${info.label}</strong>
                    <small>${escapeHTML(description)} · ${formatDate(item.createdAt)}</small>
                </div>
                <div class="recent-amount">${escapeHTML(amount)}</div>
            </div>
        `;
    }).join("");
}

function getOperationInfo(type) {
    const operations = {
        purchase: { label: "Compra de estoque", symbol: "＋" },
        sale: { label: "Saída de estoque", symbol: "↗" },
        payment: { label: "Pagamento", symbol: "✓" }
    };

    return operations[type] || { label: "Operação", symbol: "•" };
}

/* PRÉVIAS DOS FORMULÁRIOS */

function updateOperationPreviews() {
    if (!state.settings || !state.dashboard) return;

    const price = Number(state.settings.defaultPriceCents) || 0;
    const stock = Number(state.dashboard.stockBoxes) || 0;
    const units = Number(state.settings.unitsPerBox) || 15;
    const debt = Number(state.dashboard.openBalanceCents) || 0;

    const purchaseQuantity =
        Math.max(0, Number(document.getElementById("purchaseBoxes").value) || 0);

    const saleQuantity =
        Math.max(0, Number(document.getElementById("saleBoxes").value) || 0);

    const paymentValue = parseMoneyToCents(
        document.getElementById("paymentAmount").value
    );

    document.getElementById("purchaseUnitPrice").textContent =
        formatMoney(price);

    document.getElementById("purchaseTotal").textContent =
        formatMoney(price * purchaseQuantity);

    document.getElementById("availableStock").textContent =
        `${stock} caixas`;

    document.getElementById("saleUnitsPreview").textContent =
        `${saleQuantity * units} unidades`;

    document.getElementById("availableDebt").textContent =
        formatMoney(debt);

    document.getElementById("paymentPreview").textContent =
        Number.isFinite(paymentValue) ? formatMoney(paymentValue) : "R$ 0,00";
}

document.getElementById("purchaseBoxes").addEventListener("input", updateOperationPreviews);
document.getElementById("saleBoxes").addEventListener("input", updateOperationPreviews);
document.getElementById("paymentAmount").addEventListener("input", updateOperationPreviews);

/* COMPRA */

document.getElementById("purchaseForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const boxes = Number(document.getElementById("purchaseBoxes").value);

    if (!Number.isInteger(boxes) || boxes <= 0) {
        showToast("Informe uma quantidade válida de caixas.", "error");
        return;
    }

    if (!state.settings || state.settings.defaultPriceCents <= 0) {
        showToast("Configure primeiro o preço padrão por caixa.", "error");
        openPage("settings");
        return;
    }

    const total = boxes * state.settings.defaultPriceCents;

    const confirmed = window.confirm(
        `Confirmar compra de ${boxes} caixa(s) por ${formatMoney(total)}? O valor será adicionado ao saldo em aberto.`
    );

    if (!confirmed) return;

    setButtonLoading(button, true, "Registrando...");

    try {
        await apiRequest("/transactions", {
            method: "POST",
            body: JSON.stringify({
                type: "purchase",
                boxes
            })
        });

        form.reset();
        await refreshAll();
        showToast("Compra registrada com sucesso.");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
});

/* VENDA / SAÍDA */

document.getElementById("saleForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const boxes = Number(document.getElementById("saleBoxes").value);

    if (!Number.isInteger(boxes) || boxes <= 0) {
        showToast("Informe uma quantidade válida de caixas.", "error");
        return;
    }

    if (boxes > Number(state.dashboard?.stockBoxes || 0)) {
        showToast("Estoque insuficiente para essa saída.", "error");
        return;
    }

    const confirmed = window.confirm(
        `Confirmar a saída de ${boxes} caixa(s) do estoque?`
    );

    if (!confirmed) return;

    setButtonLoading(button, true, "Registrando...");

    try {
        await apiRequest("/transactions", {
            method: "POST",
            body: JSON.stringify({
                type: "sale",
                boxes
            })
        });

        form.reset();
        await refreshAll();
        showToast("Saída de estoque registrada.");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
});

/* PAGAMENTO */

document.getElementById("paymentForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const amountCents = parseMoneyToCents(
        document.getElementById("paymentAmount").value
    );

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
        showToast("Informe um valor de pagamento válido.", "error");
        return;
    }

    const debt = Number(state.dashboard?.openBalanceCents || 0);

    if (amountCents > debt) {
        showToast("O pagamento não pode ser maior que o saldo em aberto.", "error");
        return;
    }

    const confirmed = window.confirm(
        `Confirmar pagamento de ${formatMoney(amountCents)}?`
    );

    if (!confirmed) return;

    setButtonLoading(button, true, "Registrando...");

    try {
        await apiRequest("/payments", {
            method: "POST",
            body: JSON.stringify({ amountCents })
        });

        form.reset();
        await refreshAll();
        showToast("Pagamento registrado com sucesso.");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
});

/* HISTÓRICO */

async function loadHistory() {
    const tbody = document.getElementById("historyTableBody");
    tbody.innerHTML = `
        <tr><td colspan="4" class="empty-cell">Carregando...</td></tr>
    `;

    try {
        const result = await apiRequest("/transactions");
        state.history = result.transactions || [];
        renderHistory();
    } catch (error) {
        tbody.innerHTML = `
            <tr><td colspan="4" class="empty-cell">Não foi possível carregar o histórico.</td></tr>
        `;
        showToast(error.message, "error");
    }
}

function renderHistory() {
    const tbody = document.getElementById("historyTableBody");
    const filter = document.getElementById("historyFilter").value;

    const filtered = state.history.filter(item => {
        return filter === "all" || item.type === filter;
    });

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr><td colspan="4" class="empty-cell">Nenhum registro encontrado.</td></tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        const info = getOperationInfo(item.type);

        let quantity = "—";
        let amount = "—";

        if (item.type === "purchase") {
            quantity = `${item.boxes} caixa(s)`;
            amount = formatMoney(item.totalCents);
        }

        if (item.type === "sale") {
            quantity = `${item.boxes} caixa(s)`;
            amount = "—";
        }

        if (item.type === "payment") {
            quantity = "—";
            amount = formatMoney(item.amountCents);
        }

        return `
            <tr>
                <td><span class="operation-pill ${item.type}">${info.label}</span></td>
                <td>${formatDate(item.createdAt)}</td>
                <td>${quantity}</td>
                <td>${amount}</td>
            </tr>
        `;
    }).join("");
}

document.getElementById("historyFilter").addEventListener("change", renderHistory);

/* CONFIGURAÇÕES */

async function loadSettings() {
    try {
        const result = await apiRequest("/settings");
        state.settings = result.settings;

        document.getElementById("productName").value =
            state.settings.productName;

        document.getElementById("defaultPrice").value =
            (state.settings.defaultPriceCents / 100).toFixed(2).replace(".", ",");
    } catch (error) {
        showToast(error.message, "error");
    }
}

document.getElementById("settingsForm").addEventListener("submit", async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    const productName = document.getElementById("productName").value.trim();
    const defaultPriceCents = parseMoneyToCents(
        document.getElementById("defaultPrice").value
    );

    if (!productName) {
        showToast("Informe o nome do produto.", "error");
        return;
    }

    if (!Number.isInteger(defaultPriceCents) || defaultPriceCents <= 0) {
        showToast("Informe um preço maior que zero.", "error");
        return;
    }

    setButtonLoading(button, true, "Salvando...");

    try {
        const result = await apiRequest("/settings", {
            method: "PUT",
            body: JSON.stringify({
                productName,
                defaultPriceCents
            })
        });

        state.settings = result.settings;

        await refreshAll();
        showToast("Configurações salvas.");
    } catch (error) {
        showToast(error.message, "error");
    } finally {
        setButtonLoading(button, false);
    }
});

/* ATUALIZAÇÃO GERAL */

async function refreshAll() {
    await loadDashboard();

    if (document.getElementById("page-history").classList.contains("active")) {
        await loadHistory();
    }
}

document.getElementById("refreshDashboard").addEventListener("click", async () => {
    await refreshAll();
    showToast("Dashboard atualizado.");
});

/* INICIALIZAÇÃO */

async function initializeApp() {
    try {
        await refreshAll();
    } catch (error) {
        showToast(error.message, "error");
    }
}

initializeApp();
