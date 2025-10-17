// app.js

const ethers = window.ethers;

import { DOMElements } from './dom-elements.js';
import { State } from './state.js';
import { connectWallet, disconnectWallet, initPublicProvider } from './modules/wallet.js';

import { DashboardPage } from './pages/DashboardPage.js';
import { EarnPage } from './pages/EarnPage.js';
import { StorePage } from './pages/StorePage.js';
import { RewardsPage } from './pages/RewardsPage.js';
import { ActionsPage } from './pages/ActionsPage.js';
import { AboutPage } from './pages/AboutPage.js'; // Importa a nova página

const routes = {
    'dashboard': DashboardPage,
    'earn': EarnPage,
    'store': StorePage,
    'rewards': RewardsPage,
    'actions': ActionsPage,
    'about': AboutPage, // Adiciona a nova rota
};

let activePageId = 'dashboard';

// --- ROTAS & NAVEGAÇÃO ---
function navigateTo(targetId) {
    if (!routes[targetId]) return;

    activePageId = targetId;

    document.querySelectorAll('main section').forEach(section => {
        if (section) section.classList.add('hidden');
    });
    
    const targetSection = document.getElementById(targetId);
    if (targetSection) targetSection.classList.remove('hidden');

    document.querySelectorAll('.sidebar-link').forEach(l => {
        if(!l.hasAttribute('data-target')) return;
        l.classList.remove('active', 'text-white');
        l.classList.add('text-zinc-400');
    });
    const activeLink = document.querySelector(`.sidebar-link[data-target="${targetId}"]`);
    if(activeLink) {
        activeLink.classList.add('active', 'text-white');
        activeLink.classList.remove('text-zinc-400');
    }

    routes[targetId].render();
}

// --- CONTROLES DE LAYOUT ---
function toggleSidebar() {
    DOMElements.sidebar.classList.toggle('-translate-x-full');
    DOMElements.sidebarBackdrop.classList.toggle('hidden');
}
function closeSidebar() {
    DOMElements.sidebar.classList.add('-translate-x-full');
    DOMElements.sidebarBackdrop.classList.add('hidden');
}

// --- SETUP PRINCIPAL ---
function setupGlobalListeners() {
    DOMElements.menuBtn.addEventListener('click', toggleSidebar);
    DOMElements.sidebarBackdrop.addEventListener('click', closeSidebar);
    
    DOMElements.navLinks.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link || link.classList.contains('cursor-not-allowed')) return;

        if (link.hasAttribute('data-target')) {
            e.preventDefault();
            navigateTo(link.dataset.target);
            closeSidebar();
        }
    });
    
    DOMElements.connectButton.addEventListener('click', () => connectWallet(() => navigateTo(activePageId)));
    DOMElements.disconnectButton.addEventListener('click', disconnectWallet);

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (target && (target.id === 'closeModalBtn' || target.classList.contains('closeModalBtn'))) {
            document.getElementById('modal-container').innerHTML = '';
        }
    });
    
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.dataset.target && routes[link.dataset.target]) {
            e.preventDefault();
            navigateTo(link.dataset.target);
        }
    });
    
    const earnTabs = document.getElementById('earn-tabs');
    if (earnTabs) {
        earnTabs.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-btn');
            if (!button) return;
            document.querySelectorAll('#earn-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            document.querySelectorAll('#earn .tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(button.dataset.target).classList.add('active');
        });
    }

    const actionsTabs = document.getElementById('actions-tabs');
    if (actionsTabs) {
        actionsTabs.addEventListener('click', (e) => {
            const button = e.target.closest('.tab-btn');
            if (!button) return;
            document.querySelectorAll('#actions-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            ActionsPage.render(true, button.dataset.filter); 
        });
    }
}

async function init() {
    if (typeof ethers === 'undefined') {
        console.error("Ethers library not loaded globally. Check index.html script tag.");
        return;
    }

    setupGlobalListeners();
    await initPublicProvider();
    navigateTo(activePageId);
}

document.addEventListener('DOMContentLoaded', init);