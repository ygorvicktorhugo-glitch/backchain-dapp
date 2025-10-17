// pages/RewardsPage.js

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadMyCertificates, calculateUserTotalRewards, getHighestBoosterBoost } from '../modules/data.js';
import { executeUniversalClaim, executeWithdraw } from '../modules/transactions.js';
import { formatBigNumber, renderLoading, renderError, renderNoData, renderPaginatedList, ipfsGateway } from '../utils.js';
import { addresses } from '../config.js';

let rewardsCurrentPage = 1;

// --- RENDERIZAÇÃO ---

async function renderClaimableRewards() {
    const el = document.getElementById('rewards-details-content');
    const loader = document.getElementById('rewards-loader');
    if (!el || !loader) return;

    if (!State.isConnected) {
        el.innerHTML = '<p class="text-zinc-400 text-center">Connect your wallet to see rewards.</p>';
        return;
    }
    
    loader.classList.remove('hidden');
    el.innerHTML = '';

    try {
        const { stakingRewards, minerRewards, totalRewards } = await calculateUserTotalRewards();
        const efficiencyData = await getHighestBoosterBoost();
        
        let html = `<div class="p-4 bg-main border border-border-color rounded-lg space-y-3">
            <div class="flex justify-between items-center text-zinc-400">
                <span><i class="fa-solid fa-users mr-2 text-cyan-400"></i>Staking Rewards</span>
                <span class="font-bold text-white">${formatBigNumber(stakingRewards).toFixed(4)} $BKC</span>
            </div>
            <div class="flex justify-between items-center text-zinc-400">
                <span><i class="fa-solid fa-person-digging mr-2 text-amber-400"></i>PoP Mining Rewards</span>
                <span class="font-bold text-white">${formatBigNumber(minerRewards).toFixed(4)} $BKC</span>
            </div>
            <div class="border-t border-border-color my-2"></div>
            <div class="flex justify-between items-center">
                <span class="font-bold">Total Owed</span>
                <span class="font-bold text-xl text-amber-400">${formatBigNumber(totalRewards).toFixed(4)} $BKC</span>
            </div>
        </div>`;
        
        if (stakingRewards > 0n) {
            const finalEfficiency = efficiencyData.efficiency;
            const claimableAmount = (stakingRewards * BigInt(Math.floor(finalEfficiency * 100))) / 10000n;
            const treasuryAmount = stakingRewards - claimableAmount;

            html += `<div class="mt-4 p-4 bg-main border border-border-color rounded-lg space-y-2 text-sm">
                <p class="font-bold text-center mb-2">Staking Claim Details</p>
                <div class="flex justify-between items-center"><p>Your Reward Efficiency:</p><p class="font-bold text-green-400 text-base">${finalEfficiency}%</p></div>
                <div class="flex justify-between items-center text-green-400"><p>You Will Receive (Staking):</p><p class="font-bold">${formatBigNumber(claimableAmount).toFixed(4)} $BKC</p></div>
                <div class="flex justify-between items-center text-red-400/80"><p>Sent to Treasury:</p><p class="font-bold">${formatBigNumber(treasuryAmount).toFixed(4)} $BKC</p></div>
            </div>`;
        }
        
        html += `<div class="mt-6">
                    <button id="universal-claim-btn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-4 rounded-md transition-colors w-full text-lg ${ totalRewards === 0n ? 'btn-disabled' : ''}" ${ totalRewards === 0n ? 'disabled' : ''}>
                    <i class="fa-solid fa-gifts mr-2"></i>Claim All Rewards
                    </button>
                </div>`;
        
        el.innerHTML = html;
    } catch (e) {
        console.error("Error loading claimable rewards", e);
        renderError(el, 'Failed to load rewards data.');
    } finally {
        loader.classList.add('hidden');
    }
}

async function getFullCertificateHTML(tokenId) {
    if (!State.rewardManagerContract) return '';
    
    try {
        const VESTING_DURATION = await State.rewardManagerContract.VESTING_DURATION();
        const INITIAL_PENALTY_BIPS = await State.rewardManagerContract.INITIAL_PENALTY_BIPS(); 

        const [position, tokenURI] = await Promise.all([
            State.rewardManagerContract.vestingPositions(tokenId),
            State.rewardManagerContract.tokenURI(tokenId)
        ]);

        let imageUrl = '', tier = 'Certificate', tierColor = 'text-zinc-400';
         if (tokenURI) {
             try {
                 const metadata = await (await fetch(tokenURI.replace("ipfs://", ipfsGateway))).json();
                 imageUrl = metadata.image ? metadata.image.replace("ipfs://", ipfsGateway) : '';
                 tier = metadata.attributes?.find(a => a.trait_type === "Tier")?.value || tier;
             } catch (e) { /* ignore */ }
         }
        if (tier === 'Bronze') tierColor = 'text-yellow-600'; else if (tier === 'Silver') tierColor = 'text-gray-400'; else if (tier === 'Gold') tierColor = 'text-amber-400'; else if (tier === 'Diamond') tierColor = 'text-cyan-400';

        const totalAmount = position.totalAmount;
        const amountInEther = formatBigNumber(totalAmount);
        const startTime = Number(position.startTime);
        const now = Math.floor(Date.now() / 1000);
        const elapsedTime = now > startTime ? now - startTime : 0;
        const progress = Math.min(Math.floor((elapsedTime / Number(VESTING_DURATION)) * 100), 100);
        const noFeeDate = new Date((startTime + Number(VESTING_DURATION)) * 1000).toLocaleDateString("en-US");
        
        let currentPenaltyPercent = "50.00", penaltyAmount = formatBigNumber((totalAmount * INITIAL_PENALTY_BIPS) / 10000n).toFixed(2);
        
        if (elapsedTime >= Number(VESTING_DURATION)) {
            currentPenaltyPercent = "0.00";
            penaltyAmount = "0.00";
        }
        
        return `
            <div class="flex gap-4">
                <img src="${imageUrl}" alt="${tier} Certificate" class="w-24 h-24 rounded-md object-cover border border-border-color nft-clickable-image" data-address="${addresses.rewardManager}" data-tokenid="${tokenId.toString()}">
                <div class="flex-1">
                    <p class="font-bold ${tierColor}">${tier} Certificate</p>
                    <p class="text-xs text-zinc-400">Token ID: #${tokenId.toString()}</p>
                    <p class="text-2xl font-bold my-1">${amountInEther.toFixed(2)} <span class="text-amber-400 text-lg">$BKC</span></p>
                </div>
            </div>
            <div class="mt-4 flex-1 flex flex-col justify-end">
                <div class="text-xs space-y-1 text-zinc-400 mb-3">
                    <div class="flex justify-between"><span>Vesting End:</span> <span class="font-semibold text-zinc-300">${noFeeDate}</span></div>
                    <div class="flex justify-between"><span>Penalty (Pre-Vest):</span> <span class="font-semibold ${currentPenaltyPercent === "0.00" ? 'text-green-400' : 'text-red-400'}">${currentPenaltyPercent}% (~${penaltyAmount} $BKC)</span></div>
                </div>
                <div class="w-full bg-main rounded-full h-2.5 border border-border-color mb-2">
                    <div class="bg-green-500 h-full rounded-full" style="width: ${progress}%"></div>
                </div>
                <p class="text-xs text-center text-zinc-400 mb-3">Vesting Progress: ${progress}%</p>
                <button class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition-colors w-full withdraw-btn" data-tokenid="${tokenId.toString()}">
                    <i class="fa-solid fa-cash-register mr-2"></i>Withdraw
                </button>
            </div>
        `;
    } catch(e) {
        console.error(e);
        return `<p class="text-red-400">Failed to load data for Certificate #${tokenId}</p>`;
    }
}

function renderPaginatedCertificates(page) {
    const container = document.getElementById('certificates-list-container');
    if (!container) return;
    
    if (!State.isConnected) {
        renderNoData(container, 'Connect your wallet to see your certificates.');
        return;
    }

    if(State.myCertificates.length === 0){
        renderNoData(container, "You don't have any Vesting Certificates.");
        return;
    }
    
    const renderCertificateItem = (cert) => {
        return `<div class="bg-sidebar border border-border-color rounded-xl p-4 flex flex-col" data-tokenid-render="${cert.tokenId.toString()}"><div class="loader"></div></div>`;
    }
    const onPageChange = (newPage) => { rewardsCurrentPage = newPage; renderPaginatedCertificates(newPage); };
    
    renderPaginatedList(State.myCertificates, container, renderCertificateItem, 6, page, onPageChange, 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6');

    const visibleItems = State.myCertificates.slice((page-1)*6, page*6);
    visibleItems.forEach(async cert => {
        const el = container.querySelector(`[data-tokenid-render="${cert.tokenId.toString()}"]`);
        if(el) el.innerHTML = await getFullCertificateHTML(cert.tokenId);
    });
}

// --- LISTENERS ---

function setupRewardsPageListeners() {
    DOMElements.rewards.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.id === 'universal-claim-btn') {
            e.preventDefault();
            const { stakingRewards, minerRewards } = await calculateUserTotalRewards();
            const success = await executeUniversalClaim(stakingRewards, minerRewards, target);
            if (success) {
                await loadMyCertificates(); 
                await RewardsPage.render(true);
            }
            return;
        }

        if (target.classList.contains('withdraw-btn')) {
            e.preventDefault();
            const tokenId = target.dataset.tokenid;
            const success = await executeWithdraw(tokenId, target);
            if (success) {
                await loadMyCertificates(); 
                await RewardsPage.render(true);
            }
            return;
        }
        
        const clickableImage = e.target.closest('.nft-clickable-image');
        if (clickableImage) {
            const { address, tokenid } = clickableImage.dataset;
            if(address && tokenid) {
                import('../ui-feedback.js').then(module => module.addNftToWallet(address, tokenid));
            }
        }
    });
}

// Inicializa Listeners apenas na primeira vez
if (!DOMElements.rewards._listenersInitialized) {
    setupRewardsPageListeners();
    DOMElements.rewards._listenersInitialized = true;
}

export const RewardsPage = {
    async render(isUpdate = false) {
        await renderClaimableRewards();
        await renderPaginatedCertificates(rewardsCurrentPage);
    }
}