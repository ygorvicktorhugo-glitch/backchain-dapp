// pages/AboutPage.js

import { showToast } from '../ui-feedback.js';

const renderAboutContent = () => {
    const aboutContainer = document.getElementById('about');
    if (!aboutContainer) return;

    aboutContainer.innerHTML = `
        <div class="container mx-auto max-w-6xl py-8">
            <div class="text-center mb-20">
                <h1 class="text-5xl md:text-6xl font-black mb-4 tracking-tight text-gradient">The Backchain Manifesto</h1>
                <p class="text-lg md:text-xl text-zinc-400 max-w-3xl mx-auto">
                    An overview of the self-sustaining economic engine designed to reward every participant and challenge the status quo of Web3.
                </p>
            </div>

            <section id="philosophy" class="mb-20">
                <div class="bg-sidebar border border-border-color rounded-xl p-8 md:p-12">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                        <div class="text-center"><i class="fa-solid fa-hand-fist text-9xl text-amber-400/10"></i></div>
                        <div class="md:col-span-2">
                            <h3 class="text-3xl font-bold text-gradient mb-4">The Fair Launch Philosophy</h3>
                            <p class="text-zinc-400 mb-6">Backchain was founded on a simple principle: true decentralization. There is no central owner, no corporate entity, and **no reserved token supply for developers or early investors.**</p>
                            <ul class="space-y-4">
                                <li class="flex items-start"><i class="fa-solid fa-check-circle text-green-400 mt-1 mr-3"></i><div><strong class="text-white">NFT-Funded Ecosystem:</strong> The entire initial funding for liquidity, marketing, and development comes from one transparent source: the public sale of our utility NFTs. These aren't just collectibles; they are power assets that grant special abilities within the dApp and can be sold at any time in our native liquidity pool.</div></li>
                                <li class="flex items-start"><i class="fa-solid fa-check-circle text-green-400 mt-1 mr-3"></i><div><strong class="text-white">Community First:</strong> To ensure maximum decentralization from day one, **35% of the initial token supply (TGE)** will be distributed for free to community members who help promote and build the rebellion.</div></li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>
            
            <div class="border-t border-border-color my-20"></div>

            <section id="how-it-works" class="mb-20">
                <div class="text-center mb-16">
                    <span class="text-sm font-bold text-amber-400 tracking-widest">THE ECONOMIC ENGINE</span>
                    <h2 class="text-4xl md:text-5xl font-bold my-4">The Self-Sustaining Value Cycle</h2>
                    <p class="text-lg text-zinc-400 max-w-3xl mx-auto">
                        Our closed-loop model ensures every action generates value that is redistributed back to its most active participants.
                    </p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div class="p-8 bg-sidebar rounded-lg border border-border-color transform hover:-translate-y-2 transition-transform duration-300">
                        <div class="flex items-center justify-center h-16 w-16 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-6">
                            <i class="fa-solid fa-fire text-3xl text-amber-400"></i>
                        </div>
                        <h3 class="text-2xl font-bold mb-3">1. Proof-of-Purchase Mining</h3>
                        <p class="text-zinc-400">Instead of burning electricity, the network mints new tokens based on real economic activity. Key user actions, like creating a Vesting Certificate, trigger the minting of new $BKC that are sent directly to the reward pools, fueling the entire system.</p>
                    </div>
                    <div class="p-8 bg-sidebar rounded-lg border border-border-color transform hover:-translate-y-2 transition-transform duration-300">
                         <div class="flex items-center justify-center h-16 w-16 rounded-xl bg-purple-500/10 border border-purple-500/30 mb-6">
                            <i class="fa-solid fa-shield-halved text-3xl text-purple-400"></i>
                        </div>
                        <h3 class="text-2xl font-bold mb-3">2. Staking & Security (pStake)</h3>
                        <p class="text-zinc-400">Users lock their $BKC tokens by delegating to validators. This staking process (pStake) secures the network and makes them eligible to claim a share of the rewards. The longer you stake, the greater your pStake power and potential rewards.</p>
                    </div>
                    <div class="p-8 bg-sidebar rounded-lg border border-border-color transform hover:-translate-y-2 transition-transform duration-300">
                        <div class="flex items-center justify-center h-16 w-16 rounded-xl bg-green-500/10 border border-green-500/30 mb-6">
                            <i class="fa-solid fa-bolt text-3xl text-green-400"></i>
                        </div>
                        <h3 class="text-2xl font-bold mb-3">3. Booster NFTs: The Multiplier</h3>
                        <p class="text-zinc-400">The base reward claim efficiency starts at 50%. By acquiring a Booster NFT, you amplify this efficiency up to 100%. These are strategic assets that directly multiply your passive income from staking.</p>
                    </div>
                </div>
            </section>

            <div class="border-t border-border-color my-20"></div>

            <section id="roles" class="mb-20">
                <div class="text-center mb-16">
                    <span class="text-sm font-bold text-cyan-400 tracking-widest">PARTICIPATION</span>
                    <h2 class="text-4xl md:text-5xl font-bold my-4">Your Role in the Rebellion</h2>
                    <p class="text-lg text-zinc-400 max-w-3xl mx-auto">
                        Whether you are a passive investor or a core network operator, there is a vital role for you.
                    </p>
                </div>
                <div class="space-y-10">
                    <div class="bg-sidebar border border-border-color rounded-xl p-8 md:p-12">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                            <div class="md:col-span-2">
                                <h3 class="text-3xl font-bold text-gradient mb-4">The Delegator: The Backbone</h3>
                                <p class="text-zinc-400 mb-6">Delegators are users who stake their $BKC tokens to support the network. It's the most accessible way to earn passive rewards.</p>
                                <ul class="space-y-4">
                                    <li class="flex items-start"><i class="fa-solid fa-circle-check text-green-400 mt-1 mr-3"></i><div><strong class="text-white">Earn Passive Income:</strong> Receive a share of rewards from all platform fees and Proof-of-Purchase Mining.</div></li>
                                    <li class="flex items-start"><i class="fa-solid fa-circle-check text-green-400 mt-1 mr-3"></i><div><strong class="text-white">Amplify with Time:</strong> The pStake calculation rewards long-term commitment. The longer you lock your tokens, the greater your share of the reward pool.</div></li>
                                </ul>
                            </div>
                            <div class="text-center"><i class="fa-solid fa-users text-9xl text-purple-400/10"></i></div>
                        </div>
                    </div>
                    <div class="bg-sidebar border border-border-color rounded-xl p-8 md:p-12">
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                            <div class="text-center md:order-2"><i class="fa-solid fa-user-shield text-9xl text-cyan-400/10"></i></div>
                            <div class="md:col-span-2 md:order-1">
                                <h3 class="text-3xl font-bold text-gradient mb-4">The Validator: The Guardian</h3>
                                <p class="text-zinc-400 mb-6">Validators run the network's infrastructure. This role requires a higher commitment (a dynamic minimum self-stake) but comes with greater rewards.</p>
                                <ul class="space-y-4">
                                    <li class="flex items-start"><i class="fa-solid fa-circle-check text-green-400 mt-1 mr-3"></i><div><strong class="text-white">Earn Multiple Reward Streams:</strong> Validators earn staking rewards on their self-stake and are placed in a queue to receive exclusive rewards from PoP Mining events.</div></li>
                                    <li class="flex items-start"><i class="fa-solid fa-circle-check text-green-400 mt-1 mr-3"></i><div><strong class="text-white">Shape the Ecosystem:</strong> As a core operator, you are a key figure in the network's health and future governance.</div></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            
            <div class="border-t border-border-color my-20"></div>

            <section id="share" class="text-center">
                 <span class="text-sm font-bold text-green-400 tracking-widest">JOIN THE CAUSE</span>
                <h2 class="text-4xl md:text-5xl font-bold my-4">Spread the Rebellion</h2>
                <p class="text-lg text-zinc-400 max-w-3xl mx-auto mb-8">
                    Our strength is our community. Share the project with your network and help us build a truly decentralized future.
                </p>
                <button id="shareProjectBtn" class="bg-amber-500 hover:bg-amber-600 text-zinc-900 font-bold py-3 px-6 rounded-lg text-lg transition-transform hover:scale-105">
                    <i class="fa-solid fa-share-nodes mr-2"></i> Share the Project
                </button>
            </section>
        </div>
    `;
};

// Adiciona a lógica para o botão de compartilhar
const setupAboutPageListeners = () => {
    const shareButton = document.getElementById('shareProjectBtn');
    if (shareButton) {
        shareButton.addEventListener('click', () => {
            const url = window.location.origin; // Pega a URL base (ex: https://seusite.com)
            navigator.clipboard.writeText(url).then(() => {
                showToast('Project link copied to clipboard!', 'success');
            }).catch(err => {
                console.error('Failed to copy: ', err);
                showToast('Failed to copy link.', 'error');
            });
        });
    }
};

export const AboutPage = {
    render() {
        renderAboutContent();
        setupAboutPageListeners(); // Garante que o listener seja ativado
    }
};