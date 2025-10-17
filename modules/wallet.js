// modules/wallet.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { showToast, openModal } from '../ui-feedback.js'; 
import { 
    addresses, sepoliaRpcUrl, sepoliaChainId,
    bkcTokenABI, delegationManagerABI, rewardManagerABI, 
    rewardBoosterABI, nftBondingCurveABI, actionsManagerABI
} from '../config.js';
import { loadPublicData, loadUserData } from './data.js';
import { formatBigNumber } from '../utils.js';

function updateConnectionStatus(status, message) {
    const statuses = {
        disconnected: { bg: 'bg-red-500/20', text: 'text-red-400', icon: 'fa-circle' },
        connecting: { bg: 'bg-amber-500/20', text: 'text-amber-400', icon: 'fa-spinner fa-spin' },
        connected: { bg: 'bg-green-500/20', text: 'text-green-400', icon: 'fa-circle' },
    };
    const { bg, text, icon } = statuses[status];
    DOMElements.connectionStatus.className = `hidden sm:inline-flex items-center gap-2 py-1.5 px-3 rounded-full text-sm font-medium ${bg} ${text}`;
    DOMElements.connectionStatus.innerHTML = `<i class="fa-solid ${icon} text-xs"></i><span>${message}</span>`;
}

function instantiateContracts(signerOrProvider) {
    State.bkcTokenContract = new ethers.Contract(addresses.bkcToken, bkcTokenABI, signerOrProvider);
    State.delegationManagerContract = new ethers.Contract(addresses.delegationManager, delegationManagerABI, signerOrProvider);
    State.rewardManagerContract = new ethers.Contract(addresses.rewardManager, rewardManagerABI, signerOrProvider);
    State.actionsManagerContract = new ethers.Contract(addresses.actionsManager, actionsManagerABI, signerOrProvider);
    
    if (ethers.isAddress(addresses.rewardBoosterNFT)) {
        State.rewardBoosterContract = new ethers.Contract(addresses.rewardBoosterNFT, rewardBoosterABI, signerOrProvider);
    }
    if (ethers.isAddress(addresses.nftBondingCurve)) {
        State.nftBondingCurveContract = new ethers.Contract(addresses.nftBondingCurve, nftBondingCurveABI, signerOrProvider);
    }
}

export async function initPublicProvider() {
     try {
        State.publicProvider = new ethers.JsonRpcProvider(sepoliaRpcUrl);
        instantiateContracts(State.publicProvider);
        await loadPublicData();
    } catch (e) {
        console.error("Failed to initialize public provider:", e);
        showToast("Could not connect to the blockchain network.", "error");
    }
}

export async function connectWallet(routerCallback) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    if (typeof window.ethereum === 'undefined') {
        if (isMobile) {
            // CORREÇÃO: Detecta o domínio atual automaticamente
            const dappUrl = window.location.hostname;
            const metamaskDeeplink = `https://metamask.app.link/dapp/${dappUrl}`;
            
            openModal(`
                <div class="text-center">
                    <i class="fa-solid fa-mobile-screen-button text-5xl text-amber-400 mb-4"></i>
                    <h3 class="text-xl font-bold mb-2">Wallet Browser Required</h3>
                    <p class="text-zinc-400 mb-6">To connect on mobile, please open this site directly within your wallet's built-in dApp browser.</p>
                    <a href="${metamaskDeeplink}" class="block w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-md transition-colors">
                        <i class="fa-solid fa-arrow-up-right-from-square mr-2"></i>Try Opening in MetaMask
                    </a>
                </div>
            `);
            return;
        }
        
        showToast('MetaMask (or another wallet) is not installed.', 'error');
        return;
    }
    
    DOMElements.connectButton.disabled = true;
    DOMElements.connectButton.innerHTML = '<div class="loader"></div>';
    updateConnectionStatus('connecting', 'Connecting...');

    try {
        State.provider = new ethers.BrowserProvider(window.ethereum);
        const network = await State.provider.getNetwork();
        if (network.chainId !== sepoliaChainId) {
            showToast('Please switch to the Sepolia network.', 'info');
            await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
        }
        
        State.signer = await State.provider.getSigner();
        State.userAddress = await State.signer.getAddress();
        
        instantiateContracts(State.signer);
        
        DOMElements.walletAddressEl.textContent = `${State.userAddress.substring(0, 6)}...${State.userAddress.substring(State.userAddress.length - 4)}`;
        DOMElements.connectButton.classList.add('hidden');
        DOMElements.userInfo.classList.remove('hidden');
        DOMElements.userInfo.classList.add('flex');
        
        document.getElementById('pop-mining-tab').style.display = 'block';
        document.getElementById('validator-section-tab').style.display = 'block';
        
        await loadUserData(); 
        
        if (DOMElements.userBalanceEl) {
             const balanceNum = formatBigNumber(State.currentUserBalance);
             DOMElements.userBalanceEl.textContent = `${balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $BKC`;
        }
        
        updateConnectionStatus('connected', 'Connected');
        State.isConnected = true;
        showToast('Wallet connected successfully!', 'success');
        
        if (routerCallback) routerCallback();

    } catch (error) {
        console.error('Error connecting wallet:', error);
        showToast(`Error connecting: ${error.message || 'User rejected the connection.'}`, 'error');
        disconnectWallet();
    } finally {
        DOMElements.connectButton.disabled = false;
        DOMElements.connectButton.innerHTML = '<i class="fa-solid fa-wallet mr-2"></i>Connect Wallet';
    }
}

export function disconnectWallet() {
    State.provider = null; State.signer = null; State.userAddress = null;
    State.isConnected = false;
    
    instantiateContracts(State.publicProvider);
    
    updateConnectionStatus('disconnected', 'Disconnected');
    DOMElements.connectButton.classList.remove('hidden');
    DOMElements.userInfo.classList.add('hidden');
    DOMElements.userInfo.classList.remove('flex');
    document.getElementById('pop-mining-tab').style.display = 'none';
    document.getElementById('validator-section-tab').style.display = 'none';
    
    document.getElementById('userBalanceEl').textContent = '-- $BKC';
    document.getElementById('statUserPStake').textContent = '--';
    document.getElementById('statUserRewards').textContent = '--';
    document.getElementById('dashboardClaimBtn').classList.add('opacity-0', 'btn-disabled');
    document.getElementById('dashboardClaimBtn').disabled = true;
    
    showToast('Wallet disconnected.', 'info');
    
    loadPublicData(); 
}