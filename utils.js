// utils.js

const ethers = window.ethers;

import { State } from './state.js'; 

export const ipfsGateway = "https://ipfs.io/ipfs/";

export const formatBigNumber = (value, decimals = 18) => (value === null || typeof value === 'undefined') ? 0 : parseFloat(ethers.formatUnits(value, decimals));
export const formatAddress = (address) => `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

export const formatPStake = (pStake) => {
    try {
        if (typeof pStake === 'undefined' || pStake === null) return '0';
        const value = BigInt(pStake);
        if (value < 1000n) return value.toString();
        const valueNum = Number(value);
        const suffixes = ["", "k", "M", "B", "T"]; 
        const i = Math.floor(Math.log10(valueNum) / 3);
        if (i < suffixes.length) {
            const num = valueNum / (10**(i * 3));
            return `${num.toFixed(2)}${suffixes[i]}`;
        } else {
            return value.toLocaleString('en-US');
        }
    } catch (e) { return '0'; }
};

// CORREÇÃO: Adicionada verificação `if (!el)` em todas as funções de renderização para evitar TypeError: Cannot set properties of undefined
export const renderLoading = (el) => { if (!el) return; el.innerHTML = `<div class="text-center p-4"><div class="loader inline-block"></div></div>`; };
export const renderError = (el, message) => { if (!el) return; el.innerHTML = `<div class="bg-sidebar border border-border-color rounded-xl p-8"><p class="text-center text-red-400">${message}</p></div>`; };
export const renderNoData = (el, message) => { if (!el) return; el.innerHTML = `<div class="text-center p-4 bg-main border border-border-color rounded-lg col-span-full"><p class="text-zinc-400">${message}</p></div>`; }

export const renderPaginatedList = (allItems, containerEl, renderItemFn, itemsPerPage, currentPage = 1, onPageChange, gridClasses = 'space-y-3') => {
    const totalPages = Math.ceil(allItems.length / itemsPerPage);
    currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = allItems.slice(start, end);

    const itemsHtml = pageItems.map(renderItemFn).join('');
    
    let paginationHtml = '';
    if (totalPages > 1) {
        paginationHtml = `
            <div class="flex items-center justify-center gap-2 mt-6">
                <button class="pagination-btn prev-page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
                <span class="pagination-page-num">Page ${currentPage} of ${totalPages}</span>
                <button class="pagination-btn next-page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
            </div>
        `;
    }
    
    if (containerEl) containerEl.innerHTML = `<div class="${gridClasses}">${itemsHtml}</div>${paginationHtml}`;
    
    if (totalPages > 1 && containerEl) {
        containerEl.querySelector('.prev-page-btn')?.addEventListener('click', (e) => onPageChange(parseInt(e.currentTarget.dataset.page)));
        containerEl.querySelector('.next-page-btn')?.addEventListener('click', (e) => onPageChange(parseInt(e.currentTarget.dataset.page)));
    }
};