// pages/ActionsPage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { loadUserData } from '../modules/data.js';
import { formatBigNumber, formatAddress, renderLoading, renderError, renderNoData, renderPaginatedList } from '../utils.js';
import { showToast, openModal, closeModal, showIntroModal } from '../ui-feedback.js';
import { addresses } from '../config.js';
import { safeContractCall } from '../modules/data.js'; 

let actionsCurrentPage = 1;
let currentFilter = 'all'; 
let currentSort = 'default'; 

// --- Constantes e Helpers da UI ---
const ACTION_TYPES = ['Sports', 'Charity']; 
const ACTION_STATUS = ['Open', 'Finalized']; 

function getStatusBadge(action) {
    const statusText = ACTION_STATUS[action.status] || 'Unknown';
    const now = Math.floor(Date.now() / 1000);
    
    if (action.status === 0) { // Open
        if (now >= action.endTime) {
            return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400">Ready to Finalize</span>`;
        }
        return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-green-500/20 text-green-400">${statusText}</span>`;
    }
    if (action.status === 1) { // Finalized
        return `<span class="px-2 py-1 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-400">${statusText}</span>`;
    }
    return statusText;
}

// --- Funções de Transação ---

async function executeCreateAction(duration, type, charityStake, description, btnElement) {
    if (!State.signer) return showToast("Connect wallet first.", "error");

    try {
        let stakeToApprove = 0n;
        let charityStakeWei = 0n;

        if (type === 1) { // Charity
            if (!charityStake || parseFloat(charityStake) <= 0) throw new Error("Stake for Charity must be greater than zero.");
            charityStakeWei = ethers.parseEther(charityStake.toString());
            stakeToApprove = charityStakeWei;
        } else { // Sports
            const minStakeSports = await safeContractCall(State.actionsManagerContract, 'getMinCreatorStake', [], 0n);
            if (minStakeSports === 0n) {
                throw new Error("Minimum stake for Sports is currently zero. The system may not be fully initialized or total supply is too low.");
            }
            stakeToApprove = minStakeSports;
        }
        
        showToast(`Approving ${formatBigNumber(stakeToApprove)} $BKC for action...`, "info");
        const approveTx = await State.bkcTokenContract.approve(addresses.actionsManager, stakeToApprove);
        await approveTx.wait();
        showToast('Approval successful!', "success");
        
        if(btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Creating...';
        showToast("Submitting action creation...", "info");
        
        const createTx = await State.actionsManagerContract.createAction(duration, type, charityStakeWei, description);
        const receipt = await createTx.wait();
        
        showToast('Action created successfully!', "success", receipt.hash);
        closeModal();
        await loadUserData();
        await ActionsPage.render(true);

    } catch (e) {
        console.error(e);
        const reason = e.reason || e.message || 'Transaction reverted.';
        showToast(`Creation Failed: ${reason}`, "error");
    } finally {
        if(btnElement) btnElement.innerHTML = 'Create Action';
    }
}

async function executeParticipate(actionId, amount, btnElement) {
    if (!State.signer) return showToast("Connect wallet first.", "error");
    try {
        const amountWei = ethers.parseEther(amount.toString());
        showToast(`Approving ${amount} $BKC for participation...`, "info");
        const approveTx = await State.bkcTokenContract.approve(addresses.actionsManager, amountWei);
        await approveTx.wait();
        showToast('Approval successful!', "success");
        if(btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Participating...';
        const participateTx = await State.actionsManagerContract.participate(actionId, amountWei);
        const receipt = await participateTx.wait();
        showToast('Participation successful!', "success", receipt.hash);
        closeModal();
        await ActionsPage.render(true);
    } catch (e) {
        console.error(e);
        showToast(`Error participating: ${e.reason || e.message || 'Transaction reverted.'}`, "error");
    } finally {
        if(btnElement) btnElement.innerHTML = 'Participate';
    }
}

async function executeFinalizeAction(actionId, btnElement) {
    if (!State.signer) return showToast("Connect wallet first.", "error");
    try {
        if(btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Finalizing...';
        const finalizeTx = await State.actionsManagerContract.finalizeAction(actionId);
        const receipt = await finalizeTx.wait();
        showToast('Action finalized! Prize distributed.', "success", receipt.hash);
        await loadUserData(); 
        await ActionsPage.render(true);
    } catch (e) {
        console.error(e);
        showToast(`Error finalizing action: ${e.reason || e.message || 'Transaction reverted.'}`, "error");
    } finally {
        if(btnElement) btnElement.innerHTML = 'Finalize Action';
    }
}

async function loadAllActions() {
    if (!State.actionsManagerContract) return [];
    try {
        const actionCounter = Number(await safeContractCall(State.actionsManagerContract, 'actionCounter', [], 0n));
        if (actionCounter === 0) return [];
        const promises = [];
        const fallbackActionStruct = { 
            id: 0n, creator: addresses.actionsManager, description: "", actionType: 0, status: 0, 
            endTime: 0n, totalPot: 0n, creatorStake: 0n, beneficiary: addresses.actionsManager, 
            totalCoupons: 0n, winner: addresses.actionsManager, closingBlock: 0n, winningCoupon: 0n 
        };
        for (let i = 1; i <= actionCounter; i++) {
            promises.push(safeContractCall(State.actionsManagerContract, 'actions', [i], fallbackActionStruct));
        }
        const rawActions = await Promise.all(promises);
        return rawActions.filter(a => a.id > 0n).map(a => ({
            id: Number(a.id), creator: a.creator, description: a.description, actionType: Number(a.actionType),
            status: Number(a.status), endTime: Number(a.endTime), totalPot: a.totalPot,
            beneficiary: a.beneficiary, winner: a.winner,
        })); 
    } catch (e) { console.error("Error loading all actions:", e); return []; }
}

function getActionCardHTML(action) {
    const now = Math.floor(Date.now() / 1000);
    const timeEnded = now >= action.endTime;
    const isFinalized = action.status === 1;

    let buttonHTML = '';
    if (!isFinalized) {
        if (timeEnded) {
            buttonHTML = `<button class="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-3 rounded-md transition-colors action-finalize-btn" data-id="${action.id}">Finalize Action</button>`;
        } else {
            const buttonText = action.actionType === 0 ? 'Participate' : 'Donate';
            const buttonColor = action.actionType === 0 ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600';
            buttonHTML = `<button class="w-full ${buttonColor} text-white font-bold py-2 px-3 rounded-md transition-colors action-participate-btn" data-id="${action.id}">${buttonText}</button>`;
        }
    } else {
        buttonHTML = `<span class="text-green-400 font-bold text-center w-full block">Finalized!</span>`;
    }

    const publicityLinkMatch = action.description.match(/\[Link: (.*?)\]/);
    let descriptionText = publicityLinkMatch ? action.description.replace(publicityLinkMatch[0], '').trim() : action.description;
    const title = action.actionType === 0 ? `${descriptionText} #${action.id}` : descriptionText;
    
    let resultLine = '';
    if (isFinalized) {
        const recipientAddress = action.actionType === 0 ? action.winner : action.beneficiary;
        const recipientLabel = action.actionType === 0 ? 'Winner' : 'Beneficiary';
        resultLine = `<div class="text-xs text-zinc-400 border-t border-border-color/50 pt-2"><p><strong>${recipientLabel}:</strong> ${formatAddress(recipientAddress)}</p></div>`;
    }

    return `
        <div class="bg-sidebar border border-border-color rounded-xl p-5 flex flex-col justify-between h-full">
            <div>
                <div class="flex items-start justify-between mb-3 border-b border-border-color/50 pb-3">
                    <h3 class="text-xl font-bold break-words">${title}</h3>
                    ${getStatusBadge(action)}
                </div>
                <div class="space-y-3 flex-1 mb-4">
                    <div class="grid grid-cols-2 gap-3">
                        <div><p class="text-xs text-zinc-500">Creator</p><p class="font-bold text-amber-300">${formatAddress(action.creator)}</p></div>
                        <div><p class="text-xs text-zinc-500">Current Pot</p><p class="font-bold text-green-400">${formatBigNumber(action.totalPot).toFixed(2)} $BKC</p></div>
                    </div>
                    ${resultLine}
                </div>
            </div>
            <div class="mt-auto flex gap-2">
                <div class="flex-1">${buttonHTML}</div>
                <button class="w-10 h-10 flex-shrink-0 bg-zinc-700 hover:bg-zinc-600 text-white font-bold rounded-md transition-colors action-share-btn" title="Share Action" data-id="${action.id}"><i class="fa-solid fa-share-nodes"></i></button>
            </div>
        </div>`;
}

async function openCreateActionModal() {
    if (!State.isConnected) return showToast("Connect wallet first.", "error");

    const minStakeSports = await safeContractCall(State.actionsManagerContract, 'getMinCreatorStake', [], 0n);
    const minStakeSportsFormatted = formatBigNumber(minStakeSports, 18).toPrecision(8);

    const content = `
        <h3 class="text-xl font-bold mb-4 text-amber-400">Create New Action</h3>
        <div class="space-y-4">
            <div>
                <label for="actionType" class="block text-sm font-medium text-zinc-400 mb-2">Action Type</label>
                <select id="actionType" class="form-input">
                    <option value="0">Sports Action (Lottery Draw)</option>
                    <option value="1">Charity Action (Fundraiser)</option>
                </select>
            </div>
            
            <div id="sports-info" class="p-3 bg-zinc-800 border border-border-color rounded-lg text-sm space-y-2">
                <p>A stake of <strong class="text-amber-400">${minStakeSportsFormatted} $BKC</strong> will be automatically transferred from your wallet to create this lottery.</p>
                <p class="text-xs text-green-400/80"><i class="fa-solid fa-star mr-1"></i>You will receive 4% of the total pot as a creator's reward.</p>
            </div>

            <div id="charity-fields" class="hidden space-y-4">
                <div class="p-3 bg-zinc-800 border border-border-color rounded-lg text-sm text-green-400/80">
                    <i class="fa-solid fa-star mr-1"></i>As the beneficiary, you will receive 92% of the total pot. Your stake is returned upon finalization.
                </div>
                <div>
                    <label for="charityStake" class="block text-sm font-medium text-zinc-400 mb-2">Your Stake ($BKC)</label>
                    <input type="number" id="charityStake" class="form-input" placeholder="e.g., 100">
                </div>
                <div>
                    <label for="publicityLink" class="block text-sm font-medium text-zinc-400 mb-2">Publicity Link (Optional)</label>
                    <input type="url" id="publicityLink" class="form-input" placeholder="https://youtube.com/your-channel">
                </div>
                <div>
                    <label for="description" class="block text-sm font-medium text-zinc-400 mb-2">Short Description</label>
                    <textarea id="description" class="form-input" rows="3" placeholder="Explain the cause you are supporting..."></textarea>
                </div>
            </div>

            <div>
                <label class="block text-sm font-medium text-zinc-400 mb-2">Duration: <span id="durationLabel" class="font-bold text-amber-400">30 Days</span></label>
                <div class="flex gap-2 mb-3">
                    <button class="text-xs px-3 py-1 rounded-md bg-amber-500 text-zinc-900 duration-btn" data-days="30">30 Days</button>
                    <button class="text-xs px-3 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 duration-btn" data-days="180">6 Months</button>
                    <button class="text-xs px-3 py-1 rounded-md bg-zinc-700 hover:bg-zinc-600 duration-btn" data-days="custom">Custom</button>
                </div>
                <input type="number" id="durationDays" class="form-input hidden" value="30" min="1">
            </div>

            <div class="flex gap-3">
                <button id="confirmCreateActionBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition-colors flex-1">Create Action</button>
                <button class="bg-zinc-700 hover:bg-zinc-600 text-white font-bold py-2 px-4 rounded-md transition-colors closeModalBtn">Cancel</button>
            </div>
        </div>
    `;
    openModal(content);

    const actionTypeSelect = document.getElementById('actionType');
    const charityFields = document.getElementById('charity-fields');
    const sportsInfo = document.getElementById('sports-info');
    const durationInput = document.getElementById('durationDays');
    const durationLabel = document.getElementById('durationLabel');
    const durationBtns = document.querySelectorAll('.duration-btn');

    actionTypeSelect.addEventListener('change', () => {
        const isCharity = actionTypeSelect.value === '1';
        charityFields.style.display = isCharity ? 'block' : 'none';
        sportsInfo.style.display = isCharity ? 'none' : 'block';
    });

    durationBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            durationBtns.forEach(b => {
                b.classList.remove('bg-amber-500', 'text-zinc-900');
                b.classList.add('bg-zinc-700');
            });
            e.target.classList.add('bg-amber-500', 'text-zinc-900');
            e.target.classList.remove('bg-zinc-700');
            const days = e.target.dataset.days;
            if (days === 'custom') {
                durationInput.classList.remove('hidden');
                durationInput.focus();
                durationLabel.textContent = `${durationInput.value || 1} Days (Custom)`;
            } else {
                durationInput.classList.add('hidden');
                durationInput.value = days;
                durationLabel.textContent = `${days} Days`;
            }
        });
    });
    durationInput.addEventListener('input', () => {
        durationLabel.textContent = `${durationInput.value || 1} Days (Custom)`;
    });
}

function setupActionsPageListeners() {
    const actionsContainer = document.getElementById('actions');
    if (actionsContainer._listenersInitialized) return;

    actionsContainer.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        if (target.id === 'openCreateActionModalBtn' || target.id === 'confirmCreateActionBtn' || target.classList.contains('action-finalize-btn') || target.classList.contains('action-share-btn') || target.classList.contains('action-participate-btn')) {
            e.preventDefault();
        }

        if (target.id === 'openCreateActionModalBtn') {
            openCreateActionModal();
        } 
        else if (target.id === 'confirmCreateActionBtn') {
            const durationDays = parseInt(document.getElementById('durationDays').value);
            const actionType = parseInt(document.getElementById('actionType').value);
            const charityStake = document.getElementById('charityStake').value;
            let description = document.getElementById('description').value || '';
            if (actionType === 1) {
                const publicityLink = document.getElementById('publicityLink').value;
                if(publicityLink) description += ` [Link: ${publicityLink}]`;
            }
            await executeCreateAction(durationDays * 86400, actionType, charityStake, description, target);
        }
        else if (target.classList.contains('action-participate-btn')) {
            showToast('Participation modal is not yet implemented.', 'info');
        }
        else if (target.classList.contains('action-finalize-btn')) {
            await executeFinalizeAction(parseInt(target.dataset.id), target);
        }
        else if (target.classList.contains('action-share-btn')) {
            const actionId = target.dataset.id;
            const url = `${window.location.origin}${window.location.pathname}?page=actions&id=${actionId}`;
            navigator.clipboard.writeText(url).then(() => {
                showToast('Share link copied to clipboard!', 'success');
            });
        }
    });
    actionsContainer._listenersInitialized = true;
}

export const ActionsPage = {
    async render(isUpdate = false, filter = currentFilter) {
        currentFilter = filter;
        const container = document.getElementById('actions');
        
        if (!isUpdate || !document.getElementById('actions-tabs')) {
            container.innerHTML = `
                <h1 class="text-2xl md:text-3xl font-bold mb-6">Decentralized Actions</h1>
                <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center p-4 bg-sidebar border border-border-color rounded-xl mb-6 gap-4">
                    <div id="actions-tabs" class="-mb-px flex gap-4 border-b border-border-color/50 pt-1">
                        <button class="tab-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>
                        <button class="tab-btn ${filter === '0' ? 'active' : ''}" data-filter="0">Sports</button>
                        <button class="tab-btn ${filter === '1' ? 'active' : ''}" data-filter="1">Charity</button>
                    </div>
                    <button id="openCreateActionModalBtn" class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition-colors">
                        <i class="fa-solid fa-plus mr-2"></i>Create New Action
                    </button>
                </div>
                <div id="actions-list-container"></div>`;
            container._listenersInitialized = false;
            showIntroModal();
        }
        
        const listContainer = document.getElementById('actions-list-container');
        if (!State.isConnected) {
             renderNoData(listContainer, 'Connect your wallet to view and manage decentralized actions.');
             return;
        }

        renderLoading(listContainer);
        const allActions = await loadAllActions();
        let filteredActions = allActions;
        if (filter !== 'all') {
            filteredActions = allActions.filter(action => action.actionType === parseInt(filter));
        }
        filteredActions.sort((a, b) => b.id - a.id);

        if (filteredActions.length === 0) {
            renderNoData(listContainer, `No ${filter === 'all' ? '' : ACTION_TYPES[parseInt(filter)]} actions found.`);
        } else {
            const onPageChange = (newPage) => { actionsCurrentPage = newPage; ActionsPage.render(true, filter); };
            renderPaginatedList(filteredActions, listContainer, getActionCardHTML, 6, actionsCurrentPage, onPageChange, 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6');
        }
        setupActionsPageListeners();
    }
};