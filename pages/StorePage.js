// pages/StorePage.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { loadUserData, loadMyBoosters } from '../modules/data.js';
import { executeBuyBooster, executeSellBooster } from '../modules/transactions.js';
import { formatBigNumber, renderLoading, renderError } from '../utils.js';
import { boosterTiers } from '../config.js';
import { safeContractCall } from '../modules/data.js';

async function renderLiquidityPools() {
    const el = document.getElementById('store-items-grid');
    if (!el) return;

    if (!State.isConnected || !State.nftBondingCurveContract || !State.rewardBoosterContract) {
        const message = !State.isConnected ? 'Connect your wallet to see the store.' : 'Store configuration is incomplete.';
        renderError(el, message);
        return;
    }
    renderLoading(el);
    
    await loadMyBoosters();

    const renderPromises = boosterTiers.map(async (tier) => {
        try {
            // --- Pool Information ---
            const fallbackPoolStruct = { tokenBalance: 0n, nftCount: 0n, k: 0n, isInitialized: false };
            const poolInfo = await safeContractCall(State.nftBondingCurveContract, 'pools', [tier.boostBips], fallbackPoolStruct);
            const availableInPool = Number(poolInfo.nftCount);
            const buyPriceResult = await safeContractCall(State.nftBondingCurveContract, 'getBuyPrice', [tier.boostBips], ethers.MaxUint256);
            const sellPrice = await safeContractCall(State.nftBondingCurveContract, 'getSellPrice', [tier.boostBips], 0n);
            const isBuyDisabled = availableInPool === 0 || buyPriceResult === ethers.MaxUint256;
            
            // --- User's Position & Sell Eligibility ---
            const userOwnedOfTier = State.myBoosters.filter(b => b.boostBips === tier.boostBips);
            const userOwnedCount = userOwnedOfTier.length;
            
            let sellableTokenId = null;
            if (userOwnedCount > 0) {
                const lockDuration = await safeContractCall(State.nftBondingCurveContract, 'LOCK_DURATION', [], 30n * 86400n);
                const now = Math.floor(Date.now() / 1000);
                
                // Find the first sellable token for this tier
                for (const token of userOwnedOfTier) {
                    const purchaseTimestamp = await safeContractCall(State.nftBondingCurveContract, 'nftPurchaseTimestamp', [token.tokenId], 0n);
                    if (purchaseTimestamp > 0n) { // Token was bought from the pool
                        const unlockTime = Number(purchaseTimestamp) + Number(lockDuration);
                        if (now >= unlockTime) {
                            sellableTokenId = token.tokenId.toString();
                            break; // Found a sellable token, no need to check others
                        }
                    }
                }
            }

            const isSellDisabled = sellableTokenId === null;

            return `
                <div class="relative z-0 h-full w-full bg-sidebar border border-border-color rounded-xl p-5 flex flex-col overflow-hidden">
                    <div class="absolute -top-1/4 -right-1/4 w-[250px] h-[250px] ${tier.glowColor} opacity-30 blur-3xl rounded-full -z-10"></div>
                    <div class="relative z-10 flex flex-col h-full">
                        
                        <div class="text-center mb-4">
                            <img src="${tier.img}" alt="${tier.name}" class="w-24 h-24 mx-auto mb-3"/>
                            <h3 class="text-xl font-bold ${tier.color}">${tier.name} Booster</h3>
                            <p class="text-2xl font-bold text-green-400">+${tier.boostBips / 100}% Efficiency</p>
                        </div>
                        
                        <div class="bg-main/50 p-3 rounded-lg my-2 text-center">
                             <p class="text-xs text-zinc-400">Pool Liquidity</p>
                            <div class="grid grid-cols-2 gap-2 mt-2">
                                <div>
                                    <p class="font-bold text-lg">${availableInPool}</p>
                                    <p class="text-xs text-zinc-500">NFTs Available</p>
                                </div>
                                <div>
                                    <p class="font-bold text-lg">${formatBigNumber(poolInfo.tokenBalance).toFixed(0)}</p>
                                    <p class="text-xs text-zinc-500">$BKC in Pool</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="bg-main/50 p-3 rounded-lg my-2 text-center">
                             <p class="text-xs text-zinc-400">Your Position</p>
                            <p class="font-bold text-2xl text-amber-400 mt-1">${userOwnedCount}</p>
                             <p class="text-sm text-zinc-500">You Own</p>
                        </div>

                        <div class="mt-auto pt-4 space-y-3">
                            <div class="p-2 border border-border-color rounded-md text-center">
                                <span class="text-xs text-zinc-400">Buy Price</span>
                                <p class="font-mono font-semibold">${isBuyDisabled ? '--' : formatBigNumber(buyPriceResult).toFixed(2)} $BKC</p>
                                <button class="w-full mt-2 font-bold py-2 px-4 rounded-md transition-colors buy-booster-btn ${isBuyDisabled ? 'btn-disabled' : 'bg-green-600 hover:bg-green-700 text-white'}" data-boostbips="${tier.boostBips}" data-price="${buyPriceResult.toString()}" ${isBuyDisabled ? 'disabled' : ''}>
                                    Buy
                                </button>
                            </div>
                            
                            <div class="p-2 border border-border-color rounded-md text-center">
                                <span class="text-xs text-zinc-400">Sell Value</span>
                                <p class="font-mono font-semibold">${isSellDisabled ? '--' : formatBigNumber(sellPrice).toFixed(2)} $BKC</p>
                                <button class="w-full mt-2 font-bold py-2 px-4 rounded-md transition-colors sell-booster-btn ${isSellDisabled ? 'btn-disabled' : 'bg-red-600 hover:bg-red-700 text-white'}" data-tokenid="${sellableTokenId}" ${isSellDisabled ? 'disabled' : ''}>
                                    Sell
                                </button>
                            </div>
                        </div>

                    </div>
                </div>
            `;
        } catch (e) {
            console.error(`Error loading tier ${tier.name}:`, e);
            return `<div class="bg-sidebar border border-border-color rounded-xl p-4 text-center text-red-400"><p>Failed to load ${tier.name} tier</p></div>`;
        }
    });

    el.innerHTML = (await Promise.all(renderPromises)).join('');
}


// --- LISTENERS ---

function setupStorePageListeners() {
    DOMElements.store.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (button) {
            if (button.classList.contains('buy-booster-btn')) {
                e.preventDefault();
                const { boostbips, price } = button.dataset;
                const success = await executeBuyBooster(boostbips, price, button);
                if (success) {
                    State.myBoosters = []; // Força o recarregamento dos boosters
                    await loadUserData();
                    await StorePage.render(true);
                }
                return;
            }
            
            if (button.classList.contains('sell-booster-btn')) {
                e.preventDefault();
                const { tokenid } = button.dataset;
                const success = await executeSellBooster(tokenid, button);
                if (success) {
                    State.myBoosters = []; // Força o recarregamento dos boosters
                    await loadUserData();
                    await StorePage.render(true);
                }
                return;
            }
        }
    });
}

if (!DOMElements.store._listenersInitialized) {
    setupStorePageListeners();
    DOMElements.store._listenersInitialized = true;
}

export const StorePage = {
    async render(isUpdate = false) {
        const myBoostersContainer = document.getElementById('my-boosters-list-container');
        if (myBoostersContainer) {
            myBoostersContainer.innerHTML = '';
        }
        
        await renderLiquidityPools();
    }
}