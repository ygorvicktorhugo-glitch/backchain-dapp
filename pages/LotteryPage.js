// pages/LotteryPage.js

import { DOMElements } from '../dom-elements.js';

export const LotteryPage = {
    async render() {
        DOMElements.lottery.innerHTML = `
            <div class="text-center p-8 bg-sidebar border border-border-color rounded-xl">
                <i class="fa-solid fa-ticket text-6xl text-amber-400 mb-4"></i>
                <h1 class="text-3xl font-bold mb-2">Lottery Coming Soon!</h1>
                <p class="text-zinc-400 max-w-md mx-auto">A new way to use your $BKC tokens is on the horizon. Stay tuned for more details.</p>
            </div>
        `;
    }
}