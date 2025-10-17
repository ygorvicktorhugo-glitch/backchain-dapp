// ui-feedback.js

import { DOMElements } from './dom-elements.js'; 
import { addresses } from './config.js'; 
import { State } from './state.js'; // Adicionado para showIntroModal

// Gerenciamento de Timers
let activeCountdownIntervals = {};

// --- FUNÇÕES BÁSICAS ---

export const showToast = (message, type = 'info', txHash = null) => {
    if (!DOMElements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `flex items-center gap-3 w-full max-w-xs p-4 text-white rounded-lg shadow-lg transform translate-x-full opacity-0 transition-all duration-300 ease-out`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    toast.classList.add(colors[type]);
    let content = `<i class="fa-solid ${icons[type]}"></i><div class="text-sm font-normal">${message}</div>`;
    if (txHash) {
        const explorerUrl = `https://sepolia.etherscan.io/tx/${txHash}`;
        content += `<a href="${explorerUrl}" target="_blank" title="View on Etherscan" class="ml-auto text-lg hover:text-zinc-200"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`;
    }
    toast.innerHTML = content;
    DOMElements.toastContainer.appendChild(toast);
    setTimeout(() => { toast.classList.remove('translate-x-full', 'opacity-0'); toast.classList.add('translate-x-0', 'opacity-100'); }, 100);
    setTimeout(() => { toast.classList.add('opacity-0'); setTimeout(() => toast.remove(), 5000); }, 5000);
};

export const closeModal = () => { DOMElements.modalContainer.innerHTML = ''; };

export const openModal = (content) => {
    const modalHTML = `
        <div id="modal-backdrop" class="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div id="modal-content" class="bg-sidebar border border-border-color rounded-xl p-6 w-full max-w-md animate-fade-in-up">
                ${content}
                <button class="hidden" id="closeModalBtn"></button>
            </div>
        </div>
        <style>
            @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            .animate-fade-in-up { animation: fade-in-up 0.3s ease-out forwards; }
        </style>
    `;
    DOMElements.modalContainer.innerHTML = modalHTML;
    document.getElementById('modal-backdrop').addEventListener('click', e => {
        if (e.target.id === 'modal-backdrop') closeModal();
    });
    document.querySelectorAll('.closeModalBtn').forEach(btn => {
        btn.addEventListener('click', closeModal);
    });
};

// --- FUNÇÃO DE INTRODUÇÃO (AGORA EXPORTADA) ---
let hasShownIntroModal = false;

export function showIntroModal() {
    if (hasShownIntroModal) return;

    const introContent = `
        <div class="bg-zinc-900 p-6 rounded-xl border border-zinc-700">
            <h3 class="2xl font-extrabold text-amber-400 mb-4">Participate. Earn. Support.</h3>
            <p class="text-zinc-300 mb-4">
                Decentralized Actions drive the Backchain ecosystem. Participation is transparent, secure, and uniquely rewarding.
            </p>
            <ul class="space-y-3 text-zinc-300 ml-4">
                <li class="flex items-start">
                    <i class="fa-solid fa-handshake text-green-400 mt-1 mr-3 flex-shrink-0"></i>
                    <div>
                        <strong class="text-white">Support Network Growth:</strong> Your stake locks $BKC, contributing directly to the network's liquidity and stability.
                    </div>
                </li>
                <li class="flex items-start">
                    <i class="fa-solid fa-trophy text-yellow-400 mt-1 mr-3 flex-shrink-0"></i>
                    <div>
                        <strong class="text-white">Earn from Sports:</strong> Win from prize pools in Lottery Draws, guaranteed by verifiable on-chain fairness.
                    </div>
                </li>
                <li class="flex items-start">
                    <i class="fa-solid fa-heart text-red-400 mt-1 mr-3 flex-shrink-0"></i>
                    <div>
                        <strong class="text-white">Champion a Cause:</strong> Fund Charity Actions to provide fully transparent and traceable support for vetted causes.
                    </div>
                </li>
            </ul>
        </div>
        <div class="mt-4 flex justify-end">
            <button class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-2 px-4 rounded-md transition-colors closeModalBtn">I Understand</button>
        </div>
    `;
    openModal(introContent);
    hasShownIntroModal = true;
}

// --- FUNÇÕES DE TIMER E CARTEIRA ---

export const startCountdownTimers = (elements) => {
    // Clear any existing intervals
    Object.values(activeCountdownIntervals).forEach(clearInterval);
    activeCountdownIntervals = {};

    elements.forEach(el => {
        const unlockTime = parseInt(el.dataset.unlockTime, 10);
        const delegationIndex = el.dataset.index;

        const updateTimer = () => {
            const now = Math.floor(Date.now() / 1000);
            const remaining = unlockTime - now;

            if (remaining <= 0) {
                el.innerHTML = `<span class="text-green-400 font-bold">Unlocked</span>`;
                const parentCard = el.closest('.delegation-card');
                if (parentCard) {
                    parentCard.querySelector('.force-unstake-btn')?.remove();
                    parentCard.querySelector('.unstake-btn')?.classList.remove('btn-disabled');
                    parentCard.querySelector('.unstake-btn')?.removeAttribute('disabled');
                    
                    const expiredTextEl = parentCard.querySelector('.delegation-expired-text');
                    if (expiredTextEl) expiredTextEl.innerHTML = `<div class="text-xs text-green-400 mt-2 pt-2 border-t border-border-color/50">You can unstake now to receive your full amount with no penalty.</div>`;
                }
                
                clearInterval(activeCountdownIntervals[delegationIndex]);
                delete activeCountdownIntervals[delegationIndex];
                return;
            }

            const days = Math.floor(remaining / 86400);
            const hours = Math.floor((remaining % 86400) / 3600);
            const minutes = Math.floor((remaining % 3600) / 60);
            const seconds = remaining % 60;
            
            el.innerHTML = `
                <span class="font-mono text-amber-400">${String(days).padStart(2, '0')}d</span>
                <span class="font-mono text-zinc-400">:</span>
                <span class="font-mono text-amber-400">${String(hours).padStart(2, '0')}h</span>
                <span class="font-mono text-zinc-400">:</span>
                <span class="font-mono text-amber-400">${String(minutes).padStart(2, '0')}m</span>
                <span class="font-mono text-zinc-400">:</span>
                <span class="font-mono text-amber-400">${String(seconds).padStart(2, '0')}s</span>`;
        };

        updateTimer();
        activeCountdownIntervals[delegationIndex] = setInterval(updateTimer, 1000);
    });
}

export async function addNftToWallet(contractAddress, tokenId) {
    if (!tokenId) return;
    try {
        showToast(`Adding NFT #${tokenId} to your wallet...`, 'info');
        const wasAdded = await window.ethereum.request({ method: 'wallet_watchAsset', params: { type: 'ERC721', options: { address: contractAddress, tokenId: tokenId.toString() } } });
        if(wasAdded) {
            showToast(`NFT #${tokenId} added to wallet!`, 'success');
        }
    } catch (error) { console.error(error); showToast(`Error adding NFT: ${error.message}`, 'error');}
}