// pages/EarnPage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadPublicData } from '../modules/data.js';
import { executeDelegation, payValidatorFee, registerValidator, createVestingCertificate } from '../modules/transactions.js';
import { formatBigNumber, formatAddress, formatPStake, renderLoading, renderError, renderNoData } from '../utils.js';
import { openModal, showToast } from '../ui-feedback.js';
import { safeContractCall } from '../modules/data.js'; // IMPORTAÇÃO CORRIGIDA

let currentDelegateValidator = null;

// --- UTILS DA PÁGINA ---
function setAmountUtil(elementId, percentage) {
    const input = document.getElementById(elementId);
    if (State.currentUserBalance > 0n && input) {
        const amount = (State.currentUserBalance * BigInt(Math.floor(percentage * 10000))) / 10000n;
        input.value = ethers.formatUnits(amount, 18);
        if (elementId === 'delegateAmountInput') updateDelegationFeedback();
    }
}
window.setDelegateAmount = (p) => setAmountUtil('delegateAmountInput', p);
window.setCertificateAmount = (p) => setAmountUtil('certificateAmountInput', p);

function updateDelegationFeedback() {
    const amountInput = document.getElementById('delegateAmountInput');
    const durationSlider = document.getElementById('delegateDurationSlider');
    const feeEl = document.getElementById('modalFeeEl');
    const netEl = document.getElementById('modalNetAmountEl');
    const pStakeEl = document.getElementById('modalPStakeEl');

    if (!amountInput || !durationSlider || !feeEl || !netEl || !pStakeEl) return;

    const amountStr = amountInput.value || '0';
    const durationDays = parseInt(durationSlider.value, 10);
    
    let amount = 0;
    try {
        amount = parseFloat(amountStr);
        if (isNaN(amount) || amount < 0) amount = 0;
    } catch(e) { amount = 0; }
    
    const DELEGATION_FEE_BIPS = 50; 
    const FEE_DIVISOR = 10000;

    const fee = (amount * DELEGATION_FEE_BIPS) / FEE_DIVISOR;
    const netAmount = amount - fee;
    
    const pStake = netAmount * durationDays;

    feeEl.textContent = `${fee.toFixed(4)} $BKC`;
    netEl.textContent = `${netAmount.toFixed(4)} $BKC`;
    pStakeEl.textContent = formatPStake(pStake.toFixed(0));
}

// --- FUNÇÕES DE RENDERIZAÇÃO ---

function renderValidatorsList() {
    const listEl = document.getElementById('validatorsList');
    if (!listEl) return;
    
    const sortedData = [...State.allValidatorsData].sort((a, b) => {
        if (a.pStake < b.pStake) return -1;
        if (a.pStake > b.pStake) return 1;
        return 0;
    });

    const generateValidatorHtml = (validator) => {
        const { addr, pStake, selfStake, delegatedStake } = validator;
        return `
            <div class="bg-sidebar border border-border-color rounded-xl p-6 flex flex-col h-full">
                <div class="flex items-center gap-3 border-b border-border-color pb-3 mb-3">
                    <i class="fa-solid fa-user-shield text-xl text-zinc-500"></i>
                    <p class="font-mono text-zinc-400 text-sm break-all">${addr}</p>
                </div>
                <div class="flex-1 space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-zinc-400">Total pStake:</span><span class="font-bold text-lg text-purple-400">${formatPStake(pStake)}</span></div>
                    <div class="border-t border-border-color my-2 pt-2">
                        <div class="flex justify-between"><span class="text-zinc-400">Self-Staked:</span><span class="font-semibold">${formatBigNumber(selfStake).toFixed(2)} $BKC</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Delegated:</span><span class="font-semibold">${formatBigNumber(delegatedStake).toFixed(2)} $BKC</span></div>
                    </div>
                </div>
                <button class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors w-full mt-4 delegate-btn" data-validator="${addr}">Delegate</button>
            </div>`;
    };

    if (State.allValidatorsData.length === 0) {
        listEl.innerHTML = renderNoData(listEl, "No active validators on the network.");
    } else {
        listEl.innerHTML = sortedData.map(generateValidatorHtml).join('');
    }
}

function openDelegateModal(validatorAddr) {
    if (!State.isConnected) return showToast("Please connect your wallet first.", "error");
    currentDelegateValidator = validatorAddr;
    
    // Hardcoding DURATIONs (idealmente lidas do contrato)
    const minLockDays = 1;
    const maxLockDays = 3650;
    const defaultLockDays = 1825;

    const balanceFormatted = formatBigNumber(State.currentUserBalance).toFixed(2);
    const content = `
        <h3 class="xl font-bold mb-4">Delegate to Validator</h3>
        <p class="text-sm text-zinc-400 mb-2">To: <span class="font-mono bg-zinc-900/50 text-zinc-400 text-xs py-1 px-2 rounded-md">${formatAddress(validatorAddr)}</span></p>
        <p class="text-sm text-zinc-400 mb-4">Your balance: <span class="font-bold">${balanceFormatted}</span> $BKC</p>
        <div class="space-y-4">
            <div>
                <label for="delegateAmountInput" class="block text-sm font-medium text-zinc-400 mb-2">Amount to Delegate ($BKC)</label>
                <input type="number" id="delegateAmountInput" class="form-input" placeholder="0.00" step="0.01">
                <div class="flex gap-2 mt-2">
                    <button onclick="setDelegateAmount(0.25)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">25%</button>
                    <button onclick="setDelegateAmount(0.50)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">50%</button>
                    <button onclick="setDelegateAmount(0.75)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">75%</button>
                    <button onclick="setDelegateAmount(1.00)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">100%</button>
                </div>
            </div>
            <div>
                <label for="delegateDurationSlider" class="block text-sm font-medium text-zinc-400 mb-2">Lock Duration: <span id="delegateDurationLabel" class="font-bold text-amber-400">${defaultLockDays} days</span></label>
                <input type="range" id="delegateDurationSlider" min="${minLockDays}" max="${maxLockDays}" value="${defaultLockDays}" class="w-full">
            </div>
            <div class="p-3 bg-main border border-border-color rounded space-y-2 text-sm">
                <div class="flex justify-between items-center"><span class="text-zinc-400">Fee (0.5%):</span><span id="modalFeeEl" class="font-bold font-mono">0.00 $BKC</span></div>
                <div class="flex justify-between items-center"><span class="text-zinc-400">Net Delegate Amount:</span><span id="modalNetAmountEl" class="font-bold text-green-400 font-mono">0.00 $BKC</span></div>
                <div class="border-t border-border-color my-1"></div>
                <div class="flex justify-between items-center"><span class="text-zinc-400">Estimated pStake Minner:</span><span id="modalPStakeEl" class="font-bold text-purple-400 text-lg font-mono">0</span></div>
            </div>
            <div class="flex gap-3">
                <button id="confirmDelegateBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors flex-1">Confirm Delegation</button>
                <button class="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded-md transition-colors closeModalBtn" id="closeModalBtn">Cancel</button>
            </div>
        </div>
    `;
    openModal(content);
    document.getElementById('delegateAmountInput').addEventListener('input', updateDelegationFeedback);
    document.getElementById('delegateDurationSlider').addEventListener('input', (e) => {
        const days = parseInt(e.target.value);
        document.getElementById('delegateDurationLabel').textContent = `${days} days`;
        updateDelegationFeedback();
    });
    updateDelegationFeedback();
}

async function renderPopMiningPanel() {
    const el = document.getElementById('pop-mining-content');
    if (!el || !State.isConnected) {
        el.innerHTML = '';
        return;
    }
    
    const minBalance = ethers.parseEther("1");
    if (State.currentUserBalance < minBalance) {
        el.innerHTML = `<div class="p-8 text-center"><div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3"><i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i><h3 class="xl font-bold">Insufficient Balance</h3><p class="text-zinc-300">You do not have enough $BKC to perform PoP Mining.</p></div></div>`;
        return;
    }

    el.innerHTML = `
        <div class="p-6 md:p-8">
            <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                <div class="text-center flex-shrink-0">
                    <div class="w-28 h-28 bg-amber-500/10 rounded-full flex items-center justify-center border-2 border-amber-500/30">
                        <i class="fa-solid fa-gem text-5xl text-amber-400"></i>
                    </div>
                    <h2 class="2xl font-bold mt-4">PoP Mining</h2>
                    <p class="text-sm text-zinc-400">Create Vesting NFTs</p>
                </div>
                <div class="w-full flex-1 space-y-6">
                    <div>
                        <h3 class="lg font-bold">Step 1: Beneficiary Wallet</h3>
                        <p class="text-sm text-zinc-400 mb-2">Enter the address that will receive the vesting NFT.</p>
                        <input type="text" id="recipientAddressInput" class="form-input font-mono" placeholder="0x..." value="${State.userAddress || ''}">
                    </div>
                    <div>
                        <h3 class="lg font-bold">Step 2: Purchase Amount ($BKC)</h3>
                        <p class="text-sm text-zinc-400 mb-2">Your Balance: <span id="distributorBkcBalance" class="font-bold text-amber-400">${formatBigNumber(State.currentUserBalance).toFixed(2)} $BKC</span></p>
                        <input type="number" id="certificateAmountInput" class="form-input" placeholder="e.g., 5000">
                        <div class="flex gap-2 mt-2">
                            <button onclick="setCertificateAmount(0.25)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">25%</button>
                            <button onclick="setCertificateAmount(0.50)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">50%</button>
                            <button onclick="setCertificateAmount(0.75)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">75%</button>
                            <button onclick="setCertificateAmount(1.00)" class="text-xs bg-zinc-700 hover:bg-zinc-600 rounded-md py-1 px-3">100%</button>
                        </div>
                    </div>
                    <button id="createCertificateBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                        <i class="fa-solid fa-person-digging mr-2"></i>Execute Mining & Create Certificate
                    </button>
                </div>
            </div>
        </div>
    `;
}

async function renderValidatorPanel() {
    const el = document.getElementById('validator-content-wrapper');
    if (!el || !State.isConnected) {
        el.innerHTML = '';
        return;
    }
    renderLoading(el);

    try {
        const fallbackValidatorStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n };
        const validatorInfo = await safeContractCall(State.delegationManagerContract, 'validators', [State.userAddress], fallbackValidatorStruct);
        
        // CORRIGIDO: Chamando a nova função dinâmica do contrato
        let minValidatorStakeWei = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n); 
        
        const stakeAmount = minValidatorStakeWei;
        
        if (validatorInfo.isRegistered) {
            el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center"><i class="fa-solid fa-shield-halved text-5xl text-green-400 mb-4"></i><h2 class="2xl font-bold">You are a Registered Validator</h2><p class="text-zinc-400 mt-1">Thank you for helping secure the Backchain network.</p></div>`;
            return;
        }

        if (stakeAmount === 0n) {
            // Se o getMinValidatorStake retornar 0n, o totalSupply é 0, ou houve falha.
            renderError(el, `Failed to load validator stake amount. Total Supply is likely zero.`);
            return;
        }

        const hasPaid = await safeContractCall(State.delegationManagerContract, 'hasPaidRegistrationFee', [State.userAddress], false);

        // Stake Amount = 1x Fee (if unpaid) + 1x Stake. A Fee é igual ao Stake (getMinValidatorStake).
        const requiredAmount = hasPaid ? stakeAmount : stakeAmount * 2n;

        if (State.currentUserBalance < requiredAmount) {
             el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8 text-center"><div class="text-center p-6 border border-red-500/50 bg-red-500/10 rounded-lg space-y-3"><i class="fa-solid fa-circle-exclamation text-4xl text-red-400"></i><h3 class="xl font-bold">Insufficient Balance</h3><p class="text-zinc-300">You need ${formatBigNumber(requiredAmount).toFixed(2)} $BKC to become a validator (Fee + Stake).</p></div></div>`;
        } else {
            if (!hasPaid) {
               renderValidatorPayFeePanel(stakeAmount, el);
            } else {
               renderValidatorRegisterPanel(stakeAmount, el);
            }
        }
    } catch (e) {
        console.error("CRITICAL ERROR in renderValidatorPanel:", e);
        renderError(el, `Failed to Load Validator Panel: ${e.reason || e.message}`);
    }
}

function renderValidatorPayFeePanel(feeAmount, el) {
    el.innerHTML = `
        <div class="bg-sidebar border border-border-color rounded-xl overflow-hidden">
            <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                    <div class="text-center flex-shrink-0">
                        <div class="w-28 h-28 bg-blue-500/10 rounded-full flex items-center justify-center border-2 border-blue-500/30">
                            <i class="fa-solid fa-money-bill-wave text-5xl text-blue-400"></i>
                        </div>
                        <h2 class="2xl font-bold mt-4">Become a Validator</h2>
                        <p class="text-sm text-zinc-400">Step 1 of 2</p>
                    </div>
                    <div class="w-full flex-1 space-y-4">
                        <h3 class="xl font-bold">Pay Registration Fee</h3>
                        <p class="text-sm text-zinc-400">This one-time fee of <span class="font-bold text-amber-400">${formatBigNumber(feeAmount).toFixed(8)} $BKC</span> is sent to the protocol treasury to enable your validator registration.</p>
                        <button id="payFeeBtn" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                            <i class="fa-solid fa-money-bill-wave mr-2"></i>Approve & Pay Fee
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderValidatorRegisterPanel(stakeAmount, el) {
     el.innerHTML = `
        <div class="bg-sidebar border border-border-color rounded-xl overflow-hidden">
            <div class="p-6 md:p-8">
                <div class="flex flex-col md:flex-row items-center gap-6 md:gap-8">
                    <div class="text-center flex-shrink-0">
                        <div class="w-28 h-28 bg-green-500/10 rounded-full flex items-center justify-center border-2 border-green-500/30">
                            <i class="fa-solid fa-shield-heart text-5xl text-green-400"></i>
                        </div>
                        <h2 class="2xl font-bold mt-4">Become a Validator</h2>
                        <p class="text-sm text-zinc-400">Step 2 of 2</p>
                    </div>
                    <div class="w-full flex-1 space-y-4">
                        <h3 class="xl font-bold">Stake & Register</h3>
                        <p class="text-sm text-zinc-400">Your registration fee is paid. Now, lock <span class="font-bold text-amber-400">${formatBigNumber(stakeAmount).toFixed(8)} $BKC</span> as self-stake to finalize your registration. This amount will be locked for 5 years.</p>
                        <button id="registerValidatorBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-md transition-colors w-full text-lg">
                            <i class="fa-solid fa-lock mr-2"></i>Approve & Register
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- SETUP DE LISTENERS ---

function setupEarnPageListeners() {
    DOMElements.earn.addEventListener('click', async (e) => {
        const target = e.target.closest('button') || e.target.closest('a');
        if (!target) return;
        
        if (target.classList.contains('delegate-btn') || target.classList.contains('delegate-link')) {
            e.preventDefault();
            const validatorAddr = target.dataset.validator;
            openDelegateModal(validatorAddr);
            return;
        }
        
        if (target.id === 'confirmDelegateBtn') {
            e.preventDefault();
            const amountStr = document.getElementById('delegateAmountInput').value;
            const durationDays = document.getElementById('delegateDurationSlider').value;
            
            if (!amountStr || parseFloat(amountStr) <= 0) return showToast('Invalid amount.', 'error');
            if (!currentDelegateValidator) return showToast('Validator address not found.', 'error');

            const totalAmount = ethers.parseEther(amountStr);
            const durationSeconds = parseInt(durationDays) * 86400;
            
            const success = await executeDelegation(currentDelegateValidator, totalAmount, durationSeconds, target);
            if (success) {
                await loadPublicData();
                await loadUserData();
                await EarnPage.render(true);
            }
            return;
        }

        if (target.id === 'createCertificateBtn') {
            e.preventDefault();
            const recipientAddress = document.getElementById('recipientAddressInput').value;
            const amountStr = document.getElementById('certificateAmountInput').value;
            const amount = ethers.parseEther(amountStr || '0');
            
            const success = await createVestingCertificate(recipientAddress, amount, target);
            if (success) {
                await loadUserData();
            }
            return;
        }
        
        if (target.id === 'payFeeBtn') {
            e.preventDefault();
            // CORRIGIDO: Chamando a nova função dinâmica do contrato
            let feeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await payValidatorFee(feeAmount, target);
            if (success) await renderValidatorPanel();
            return;
        }
        
        if (target.id === 'registerValidatorBtn') {
            e.preventDefault();
            // CORRIGIDO: Chamando a nova função dinâmica do contrato
            let stakeAmount = await safeContractCall(State.delegationManagerContract, 'getMinValidatorStake', [], 0n);
            const success = await registerValidator(stakeAmount, target);
            if (success) {
                await loadPublicData();
                await loadUserData();
                await renderValidatorPanel();
            }
            return;
        }
    });
}

// Inicializa Listeners apenas na primeira vez
if (!DOMElements.earn._listenersInitialized) {
    setupEarnPageListeners();
    DOMElements.earn._listenersInitialized = true;
}

export const EarnPage = {
    async render(isUpdate = false) {
        if (!State.isConnected) {
            DOMElements.validatorsList.innerHTML = renderNoData(DOMElements.validatorsList, 'Connect your wallet to see delegation options.');
            document.getElementById('pop-mining-content').innerHTML = renderNoData(document.getElementById('pop-mining-content'), 'Connect your wallet to access PoP Mining.');
            document.getElementById('validator-content-wrapper').innerHTML = renderNoData(document.getElementById('validator-content-wrapper'), 'Connect your wallet to manage validator status.');
            return;
        }
        
        renderValidatorsList();
        
        await renderPopMiningPanel();
        
        await renderValidatorPanel();
    }
}