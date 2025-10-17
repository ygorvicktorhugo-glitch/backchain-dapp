// pages/DashboardPage.js

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadMyCertificates, calculateUserTotalRewards, getHighestBoosterBoost } from '../modules/data.js'; // Ajustado para modules/
import { executeUniversalClaim, executeUnstake, executeForceUnstake } from '../modules/transactions.js'; // Ajustado para modules/
import { formatBigNumber, formatAddress, formatPStake, renderLoading, renderNoData, ipfsGateway } from '../utils.js';
import { startCountdownTimers } from '../ui-feedback.js';
import { addresses } from '../config.js';
import { safeContractCall } from '../modules/data.js'; // IMPORTAÇÃO CORRIGIDA

let dashboardCurrentPage = 1;

function setupDashboardListeners() {
    DOMElements.dashboard.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.id === 'dashboardClaimBtn') {
            e.preventDefault();
            const { stakingRewards, minerRewards } = await calculateUserTotalRewards();
            const success = await executeUniversalClaim(stakingRewards, minerRewards, target);
            if (success) await DashboardPage.render(true);
        }
        
        if (target.classList.contains('unstake-btn')) {
            e.preventDefault();
            const index = target.dataset.index;
            const success = await executeUnstake(Number(index));
            if (success) await DashboardPage.render(true); 
        }
        if (target.classList.contains('force-unstake-btn')) {
            e.preventDefault();
            const index = target.dataset.index;
            const success = await executeForceUnstake(Number(index));
            if (success) await DashboardPage.render(true);
        }
    });
}

// Inicializa Listeners apenas na primeira vez
if (!DOMElements.dashboard._listenersInitialized) {
    setupDashboardListeners();
    DOMElements.dashboard._listenersInitialized = true;
}


async function renderRewardEfficiencyPanel(efficiencyData) {
    const el = document.getElementById('reward-efficiency-panel');
    if (!el) return;
    
    if (efficiencyData.highestBoost === 0) {
        el.innerHTML = `<div class="bg-main border border-border-color rounded-xl p-4 text-center"><p class="font-bold text-lg">Reward Efficiency: <span class="text-amber-400">50%</span></p><p class="text-sm text-zinc-400 mt-1">Acquire a Booster NFT to increase your claim rate!</p></div>`;
        return;
    }

    const boostPercent = efficiencyData.highestBoost / 100;
    
    el.innerHTML = `
        <div class="bg-main border border-border-color rounded-xl p-4 flex flex-col sm:flex-row items-center gap-5">
            <img src="${efficiencyData.imageUrl}" alt="${efficiencyData.boostName}" class="w-20 h-20 rounded-md object-cover border border-zinc-700 nft-clickable-image" data-address="${addresses.rewardBoosterNFT}" data-tokenid="${efficiencyData.tokenId}">
            <div class="flex-1 text-center sm:text-left">
                 <p class="font-bold text-lg">${efficiencyData.boostName}</p>
                <p class="text-2xl font-bold text-green-400 mt-1">${efficiencyData.efficiency}%</p>
                <p class="text-sm text-zinc-400">Reward Efficiency (50% Base + ${boostPercent}% Boost)</p>
            </div>
        </div>`;
}

function renderValidatorsList() {
    const listEl = document.getElementById('top-validators-list');
    if (!listEl) return;
    
    const sortedData = [...State.allValidatorsData].sort((a, b) => {
        if (a.pStake < b.pStake) return -1;
        if (a.pStake > b.pStake) return 1;
        return 0;
    });

    const generateValidatorHtml = (validator) => {
        const { addr, pStake, selfStake, delegatedStake } = validator;
        return `
            <div class="bg-main border border-border-color rounded-xl p-4 flex flex-col h-full">
                <div class="flex items-center gap-3 border-b border-border-color pb-3 mb-3">
                    <i class="fa-solid fa-user-shield text-xl text-zinc-500"></i>
                    <p class="font-mono text-zinc-400 text-sm break-all">${formatAddress(addr)}</p>
                </div>
                <div class="flex-1 space-y-2 text-sm">
                    <div class="flex justify-between items-center"><span class="text-zinc-400">Total pStake:</span><span class="font-bold text-lg text-purple-400">${formatPStake(pStake)}</span></div>
                    <div class="border-t border-border-color my-2 pt-2">
                        <div class="flex justify-between"><span class="text-zinc-400">Self-Staked:</span><span class="font-semibold">${formatBigNumber(selfStake).toFixed(2)} $BKC</span></div>
                        <div class="flex justify-between"><span class="text-zinc-400">Delegated:</span><span class="font-semibold">${formatBigNumber(delegatedStake).toFixed(2)} $BKC</span></div>
                    </div>
                </div>
                <a href="#" data-target="earn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors w-full mt-4 text-center delegate-link" data-validator="${addr}">Delegate</a>
            </div>`;
    };

    if (State.allValidatorsData.length === 0) {
        listEl.innerHTML = `<p class="text-center text-zinc-400 p-4 col-span-full">No active validators on the network.</p>`;
    } else {
        listEl.innerHTML = sortedData.slice(0, 5).map(generateValidatorHtml).join('');
    }
}

async function renderMyDelegations() {
    const containerEl = document.getElementById('my-delegations-dashboard');
    const listEl = document.getElementById('my-delegations-list');
    
    if (!containerEl || !listEl) return;

    if (!State.isConnected) {
        containerEl.classList.add('hidden');
        return;
    }

    if (!State.userDelegations || State.userDelegations.length === 0) {
        containerEl.classList.add('hidden');
        return;
    }
    
    containerEl.classList.remove('hidden');
    renderLoading(listEl);

    const htmlPromises = State.userDelegations.map(async (d) => {
        const amount = d.amount;
        const amountFormatted = formatBigNumber(amount);
        
        // CORRIGIDO: Usando safeContractCall
        const pStake = await safeContractCall(State.delegationManagerContract, 'getDelegationPStake', [State.userAddress, d.index], 0n);
        
        const unlockTimestamp = Number(d.unlockTime);
        const isLocked = unlockTimestamp > (Date.now() / 1000);
        const penaltyAmount = formatBigNumber(amount / 2n);
        const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        return `
            <div class="bg-main border border-border-color rounded-xl p-4 delegation-card">
                <div class="flex justify-between items-start gap-4">
                    <div>
                        <p class="text-2xl font-bold">${amountFormatted.toFixed(4)} <span class="text-amber-400">$BKC</span></p>
                        <p class="text-sm text-zinc-400">To: <span class="font-mono">${formatAddress(d.validator)}</span></p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-xl text-purple-400">${formatPStake(pStake)}</p>
                        <p class="text-sm text-zinc-400">pStake Minner</p>
                    </div>
                </div>
                
                <div class="bg-sidebar/50 border border-border-color rounded-lg p-3 mt-4">
                    <div class="flex justify-between items-center">
                        <div class="text-sm">
                            <p class="text-zinc-400">${isLocked ? 'Unlocks In:' : 'Status:'}</p>
                            <div class="countdown-timer text-lg" data-unlock-time="${unlockTimestamp}" data-index="${d.index}">
                                ${isLocked ? '<div class="loader !w-4 !h-4"></div>' : '<span class="text-green-400 font-bold">Unlocked</span>'}
                            </div>
                            <p class="text-xs text-zinc-500">${unlockDate}</p>
                        </div>
                        <div class="flex gap-2 flex-wrap justify-end">
                            ${isLocked ? `
                                <button title="Early unstake with 50% penalty" class="bg-red-900/50 hover:bg-red-900/80 text-red-400 font-bold py-2 px-3 rounded-md text-sm force-unstake-btn" data-index="${d.index}">
                                    <i class="fa-solid fa-triangle-exclamation mr-1"></i> Force
                                </button>`
                            : ''}
                            <button class="${isLocked ? 'btn-disabled' : 'bg-amber-500 hover:bg-amber-600 text-zinc-900'} font-bold py-2 px-3 rounded-md text-sm unstake-btn" data-index="${d.index}" ${isLocked ? 'disabled' : ''}>
                                <i class="fa-solid fa-unlock mr-1"></i> Unstake
                            </button>
                        </div>
                    </div>
                    <div class="delegation-expired-text">
                        ${isLocked ? `
                            <div class="text-xs text-red-400/80 mt-2 pt-2 border-t border-border-color/50">
                                <strong>Force Unstake Penalty:</strong> 50% (~${penaltyAmount.toFixed(4)} $BKC)
                            </div>`
                        : `
                            <div class="text-xs text-green-400 mt-2 pt-2 border-t border-border-color/50">
                                You can unstake now to receive your full amount with no penalty.
                            </div>`
                        }
                    </div>
                </div>
            </div>`;
    });
    
    listEl.innerHTML = (await Promise.all(htmlPromises)).join('');
    
    const timers = listEl.querySelectorAll('.countdown-timer');
    if (timers.length > 0) startCountdownTimers(timers);
}

async function renderMyCertificatesDashboard() {
    const containerEl = document.getElementById('my-certificates-dashboard');
    const listEl = document.getElementById('my-certificates-list');
    
    if (!containerEl || !listEl) return;
    
    if (!State.isConnected) {
        containerEl.classList.add('hidden');
        return;
    }
    
    await loadMyCertificates();
    const certificates = State.myCertificates;

    if (certificates.length === 0) {
        containerEl.classList.add('hidden');
        return;
    }
    
    containerEl.classList.remove('hidden');
    renderLoading(listEl);

    const limit = Math.min(3, certificates.length);
    const recentCertificates = certificates.slice(0, limit);

    const certificatePromises = recentCertificates.map(async ({ tokenId }) => {
        // CORRIGIDO: Usando safeContractCall
        const position = await safeContractCall(State.rewardManagerContract, 'vestingPositions', [tokenId], {totalAmount: 0n, startTime: 0n});
        const tokenURI = await safeContractCall(State.rewardManagerContract, 'tokenURI', [tokenId], "");
        
        let imageUrl = '', tier = 'Certificate', tierColor = 'text-zinc-400';
         if (tokenURI) {
            try {
                const metadata = await (await fetch(tokenURI.replace("ipfs://", ipfsGateway))).json();
                imageUrl = metadata.image ? metadata.image.replace("ipfs://", ipfsGateway) : '';
                tier = metadata.attributes?.find(a => a.trait_type === "Tier")?.value || tier;
            } catch (e) { /* ignore */ }
        }
        if (tier === 'Bronze') tierColor = 'text-yellow-600'; else if (tier === 'Silver') tierColor = 'text-gray-400'; else if (tier === 'Gold') tierColor = 'text-amber-400'; else if (tier === 'Diamond') tierColor = 'text-cyan-400';
        
        return `
            <div class="p-3 bg-main border border-border-color rounded-lg flex items-center gap-4">
                <img src="${imageUrl}" class="w-12 h-12 rounded-md object-cover nft-clickable-image" data-address="${addresses.rewardManager}" data-tokenid="${tokenId.toString()}">
                <div>
                    <p class="font-bold ${tierColor}">${tier} Certificate #${tokenId.toString()}</p>
                    <p class="text-sm text-zinc-400">${formatBigNumber(position.totalAmount).toFixed(2)} $BKC</p>
                </div>
            </div>`;
    });

    listEl.innerHTML = (await Promise.all(certificatePromises)).join('');
}


export const DashboardPage = {
    async render(isUpdate = false) {
        renderValidatorsList();
        
        if (!State.isConnected) {
            document.getElementById('my-delegations-dashboard')?.classList.add('hidden');
            document.getElementById('my-certificates-dashboard')?.classList.add('hidden');
            document.getElementById('activity-history-dashboard')?.classList.add('hidden');
            document.getElementById('reward-efficiency-panel').innerHTML = ''; 
            return;
        }

        if (!isUpdate) {
            renderLoading(document.getElementById('statUserPStake'));
            renderLoading(document.getElementById('statUserRewards'));
        }

        await renderMyDelegations();
        await renderMyCertificatesDashboard();
        
        const efficiencyData = await getHighestBoosterBoost();
        await renderRewardEfficiencyPanel(efficiencyData);
    }
}