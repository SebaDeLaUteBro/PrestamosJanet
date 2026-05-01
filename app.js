const PLANS = {
    '5k-8': { principal: 5000, paymentsCount: 8, paymentAmount: 1000 },
    '10k-8': { principal: 10000, paymentsCount: 8, paymentAmount: 2000 },
    '5k-10': { principal: 5000, paymentsCount: 10, paymentAmount: 900 },
    '10k-10': { principal: 10000, paymentsCount: 10, paymentAmount: 1800 },
    '5k-12': { principal: 5000, paymentsCount: 12, paymentAmount: 833 },
    '10k-12': { principal: 10000, paymentsCount: 12, paymentAmount: 1667 },
};

let loans = [];
let openLoanDetails = new Set();

// DOM Elements
const modalLoan = document.getElementById('modal-new-loan');
const modalConfirm = document.getElementById('modal-confirm');
const btnNewLoan = document.getElementById('btn-new-loan');
const formNewLoan = document.getElementById('form-new-loan');
const loansListEl = document.getElementById('loans-list');
const emptyStateEl = document.getElementById('empty-state');

// Confirm Action Callback
let confirmActionCallback = null;

// Initialize
function init() {
    loadData();
    setupEventListeners();
    updateUI();
    document.getElementById('loan-date').valueAsDate = new Date();
}

function loadData() {
    const data = localStorage.getItem('prestadmin_loans_v2');
    if (data) {
        loans = JSON.parse(data);
    } else {
        // Fallback for older version testing
        const oldData = localStorage.getItem('prestadmin_loans');
        if (oldData) loans = JSON.parse(oldData);
    }
}

function saveData() {
    localStorage.setItem('prestadmin_loans_v2', JSON.stringify(loans));
    updateUI();
}

function setupEventListeners() {
    btnNewLoan.addEventListener('click', () => modalLoan.classList.add('active'));
    document.getElementById('btn-close-modal').addEventListener('click', () => modalLoan.classList.remove('active'));
    document.getElementById('btn-cancel-modal').addEventListener('click', () => modalLoan.classList.remove('active'));
    
    formNewLoan.addEventListener('submit', (e) => {
        e.preventDefault();
        createNewLoan();
    });

    // Confirm Modal Listeners
    document.getElementById('btn-cancel-confirm').addEventListener('click', () => modalConfirm.classList.remove('active'));
    document.getElementById('btn-accept-confirm').addEventListener('click', () => {
        if(confirmActionCallback) confirmActionCallback();
        modalConfirm.classList.remove('active');
    });

    const btnDeleteAll = document.getElementById('btn-delete-all');
    if (btnDeleteAll) {
        btnDeleteAll.addEventListener('click', () => {
            if (loans.length === 0) return;
            openConfirmModal(
                "Borrar Todos los Préstamos",
                "¿Estás completamente seguro de que deseas eliminar <strong>TODOS</strong> los préstamos registrados? Esta acción no se puede deshacer.",
                () => {
                    loans = [];
                    saveData();
                }
            );
        });
    }
}

function openConfirmModal(title, messageHtml, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').innerHTML = messageHtml;
    confirmActionCallback = onConfirm;
    modalConfirm.classList.add('active');
}

function createNewLoan() {
    const name = document.getElementById('borrower-name').value;
    const startDateStr = document.getElementById('loan-date').value;
    const planKey = document.getElementById('loan-plan').value;
    
    if (!name || !startDateStr || !planKey) return;

    const plan = PLANS[planKey];
    const startDate = new Date(startDateStr);
    startDate.setMinutes(startDate.getMinutes() + startDate.getTimezoneOffset());
    
    const payments = [];
    let currentDate = new Date(startDate);
    
    for (let i = 0; i < plan.paymentsCount; i++) {
        currentDate.setDate(currentDate.getDate() + 15);
        payments.push({
            id: generateId(),
            dueDate: currentDate.toISOString(),
            amount: plan.paymentAmount,
            isPaid: false,
            paidDate: null
        });
    }

    const newLoan = {
        id: generateId(),
        borrower: name,
        planKey: planKey,
        principal: plan.principal,
        startDate: startDate.toISOString(),
        payments: payments,
        createdAt: new Date().toISOString()
    };

    loans.unshift(newLoan); // Add to top
    saveData();
    
    formNewLoan.reset();
    document.getElementById('loan-date').valueAsDate = new Date();
    modalLoan.classList.remove('active');
}

function toggleLoanDetails(loanId) {
    const detailsEl = document.getElementById(`loan-details-${loanId}`);
    detailsEl.classList.toggle('open');
    if (detailsEl.classList.contains('open')) {
        openLoanDetails.add(loanId);
    } else {
        openLoanDetails.delete(loanId);
    }
}

function markPaymentAsPaid(loanId, paymentId, event) {
    if(event) event.stopPropagation();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;
    const payment = loan.payments.find(p => p.id === paymentId);
    if (!payment) return;

    payment.isPaid = true;
    payment.paidDate = new Date().toISOString();
    saveData();
}

function deleteLoan(loanId, event) {
    if(event) event.stopPropagation();
    openConfirmModal(
        "Eliminar Préstamo", 
        "¿Estás seguro de que deseas eliminar este préstamo? Esta acción no se puede deshacer.",
        () => {
            loans = loans.filter(l => l.id !== loanId);
            saveData();
        }
    );
}

function liquidateLoan(loanId, event) {
    if(event) event.stopPropagation();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const plan = PLANS[loan.planKey];
    // Calculamos el capital puro (sin intereses) por quincena
    const principalPerPayment = plan.principal / plan.paymentsCount;
    const interestPerPayment = plan.paymentAmount - principalPerPayment;

    let pendingCount = 0;

    loan.payments.forEach(payment => {
        if (!payment.isPaid) {
            pendingCount++;
        }
    });

    const totalPendingOriginal = pendingCount * plan.paymentAmount;
    const totalInterestDiscounted = pendingCount * interestPerPayment;
    const totalPendingPrincipal = pendingCount * principalPerPayment;
    const totalToPayWithFees = totalPendingPrincipal; // Sin multas

    const messageHtml = `
        <div style="margin-bottom: 1rem;">Estás a punto de liquidar <strong>${pendingCount} quincena(s) pendiente(s)</strong>.</div>
        <div style="background: rgba(255,255,255,0.03); padding: 1rem; border-radius: 8px; font-size: 0.9rem; border: 1px solid var(--border-color);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: var(--text-secondary);">
                <span>Total Normal Restante:</span>
                <span>${formatCurrency(totalPendingOriginal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: var(--success-color);">
                <span>Intereses Perdonados:</span>
                <span>- ${formatCurrency(totalInterestDiscounted)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; color: var(--text-primary);">
                <span>Capital Restante a Pagar:</span>
                <span>${formatCurrency(totalPendingPrincipal)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color); font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">
                <span>Total a Recibir:</span>
                <span>${formatCurrency(totalToPayWithFees)}</span>
            </div>
        </div>
        <div style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-secondary); text-align: center;">¿Confirmas que recibiste esta cantidad?</div>
    `;

    openConfirmModal(
        "Desglose de Liquidación",
        messageHtml,
        () => {
            loan.payments.forEach(payment => {
                if (!payment.isPaid) {
                    payment.amount = principalPerPayment; // Guardamos que se pagó menos
                    payment.isPaid = true;
                    payment.paidDate = new Date().toISOString();
                }
            });
            saveData();
        }
    );
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
}

function formatDate(dateStr) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateStr).toLocaleDateString('es-MX', options);
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function updateUI() {
    let activeLoansCount = 0;
    let totalLent = 0;
    let totalCollected = 0;

    loansListEl.innerHTML = '';
    
    if (loans.length === 0) {
        emptyStateEl.style.display = 'block';
    } else {
        emptyStateEl.style.display = 'none';
        
        loans.forEach(loan => {
            let paidAmountForLoan = 0;
            let hasPending = false;
            
            // Find next payment date
            const nextPayment = loan.payments.find(p => !p.isPaid);
            let nextPaymentDateHtml = `<span style="color: var(--success-color);"><i class='bx bx-check-double'></i> Préstamo Finalizado</span>`;
            if (nextPayment) {
                nextPaymentDateHtml = `<span style="color: var(--warning-color); font-weight: 500;"><i class='bx bx-calendar-event'></i> Siguiente pago: ${formatDate(nextPayment.dueDate)}</span>`;
            }

            let paymentsHtml = loan.payments.map((payment, index) => {
                const totalDue = payment.amount;
                
                if (payment.isPaid) {
                    paidAmountForLoan += totalDue;
                    totalCollected += totalDue;
                } else {
                    hasPending = true;
                }

                let statusHtml = '';
                let actionHtml = '';
                
                if (payment.isPaid) {
                    statusHtml = `<span class="status paid"><i class='bx bx-check'></i> Pagado</span>`;
                    actionHtml = `<span style="color: var(--text-muted); font-size: 0.875rem;">Completado</span>`;
                } else {
                    statusHtml = `<span class="status pending"><i class='bx bx-time'></i> Pendiente</span>`;
                    actionHtml = `<button class="btn-outline" onclick="markPaymentAsPaid('${loan.id}', '${payment.id}', event)">Marcar Pagado</button>`;
                }

                return `
                    <tr>
                        <td>Q${index + 1}</td>
                        <td>${formatDate(payment.dueDate)}</td>
                        <td>${formatCurrency(payment.amount)}</td>
                        <td style="font-weight: 600;">${formatCurrency(totalDue)}</td>
                        <td>${statusHtml}</td>
                        <td>${actionHtml}</td>
                    </tr>
                `;
            }).join('');

            const isCompleted = !hasPending;
            
            if (!isCompleted) activeLoansCount++;
            totalLent += loan.principal;

            const plan = PLANS[loan.planKey];
            let planTotalDynamic = 0;
            loan.payments.forEach(p => planTotalDynamic += p.amount);
            const totalExpected = planTotalDynamic; // No más multas

            const loanCardHtml = `
                <div class="loan-card" style="${isCompleted ? 'opacity: 0.6;' : ''}">
                    <div class="loan-header" onclick="toggleLoanDetails('${loan.id}')">
                        <div class="loan-info">
                            <div class="borrower-name">
                                ${loan.borrower}
                                ${isCompleted ? '<span class="completed-badge">Finalizado</span>' : ''}
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 0.3rem;">
                                <div><span class="plan-badge">$${plan.principal/1000}k a ${plan.paymentsCount} quincenas</span></div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.3rem;">
                                    <strong>Inicio:</strong> ${formatDate(loan.startDate)}
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                    ${nextPaymentDateHtml}
                                </div>
                            </div>
                        </div>
                        <div class="loan-progress">
                            <div class="progress-text">Cobrado</div>
                            <div class="progress-amount">${formatCurrency(paidAmountForLoan)} <span style="font-size: 0.875rem; color: var(--text-muted); font-weight: 400;">/ ${formatCurrency(totalExpected)}</span></div>
                        </div>
                    </div>
                    
                    <div id="loan-details-${loan.id}" class="loan-details ${openLoanDetails.has(loan.id) ? 'open' : ''}">
                        ${!isCompleted ? `
                        <div class="loan-actions-bar">
                            <button class="btn-success btn-outline" style="border: none;" onclick="liquidateLoan('${loan.id}', event)">
                                <i class='bx bx-money'></i> Liquidar Restante
                            </button>
                        </div>
                        ` : `
                        <div class="loan-actions-bar">
                            <button class="btn-danger btn-outline" style="border: none;" onclick="deleteLoan('${loan.id}', event)">
                                <i class='bx bx-trash'></i> Eliminar Registro
                            </button>
                        </div>
                        `}
                        <div class="table-responsive">
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Fecha</th>
                                        <th>Monto</th>
                                        <th>Total</th>
                                        <th>Estado</th>
                                        <th>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${paymentsHtml}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            
            loansListEl.insertAdjacentHTML('beforeend', loanCardHtml);
        });
    }

    document.getElementById('stat-active-loans').textContent = activeLoansCount;
    document.getElementById('stat-total-lent').textContent = formatCurrency(totalLent);
    document.getElementById('stat-total-collected').textContent = formatCurrency(totalCollected);
}

document.addEventListener('DOMContentLoaded', init);
