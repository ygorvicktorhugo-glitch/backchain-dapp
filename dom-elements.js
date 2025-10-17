// dom-elements.js

export const DOMElements = {
    // Layout & Navigation
    sidebar: document.getElementById('sidebar'),
    sidebarBackdrop: document.getElementById('sidebar-backdrop'),
    menuBtn: document.getElementById('menu-btn'),
    navLinks: document.getElementById('nav-links'),
    mainContentSections: document.querySelectorAll('main section'),
    earnTabs: document.getElementById('earn-tabs'),
    popMiningTab: document.getElementById('pop-mining-tab'),
    validatorSectionTab: document.getElementById('validator-section-tab'),
    
    // Header & Connection
    connectionStatus: document.getElementById('connectionStatus'),
    connectButton: document.getElementById('connectButton'),
    userInfo: document.getElementById('userInfo'),
    userBalanceEl: document.getElementById('userBalanceEl'),
    walletAddressEl: document.getElementById('walletAddressEl'),
    disconnectButton: document.getElementById('disconnectButton'),
    
    // Modals & Toasts
    modalContainer: document.getElementById('modal-container'),
    toastContainer: document.getElementById('toast-container'),

    // Page Content Containers 
    dashboard: document.getElementById('dashboard'),
    earn: document.getElementById('earn'),
    store: document.getElementById('store'),
    rewards: document.getElementById('rewards'),
    actions: document.getElementById('actions'), // Incluído
    
    // Dashboard Stats (Public)
    statTotalSupply: document.getElementById('statTotalSupply'),
    statValidators: document.getElementById('statValidators'),
    statTotalPStake: document.getElementById('statTotalPStake'),
    statScarcity: document.getElementById('statScarcity'),
};