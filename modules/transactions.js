// modules/transactions.js

const ethers = window.ethers;

import { State } from '../state.js';
import { showToast, closeModal } from '../ui-feedback.js';
import { addresses } from '../config.js';
import { formatBigNumber } from '../utils.js'; 
import { loadUserData } from './data.js';
import { safeContractCall } from './data.js';

// --- Constantes de Tolerância ---
const APPROVAL_TOLERANCE_BIPS = 100; // 1% em BIPS
const BIPS_DENOMINATOR = 10000;

// Transação Genérica de Wrapper
async function executeTransaction(txPromise, successMessage, failMessage, btnElement) {
    if (!btnElement) {
        console.warn("Transaction executed without a button element for feedback.");
    }
    
    const originalText = btnElement ? btnElement.innerHTML : 'Processing...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }
    
    try {
        const tx = await txPromise;
        showToast('Submitting transaction...', 'info');
        const receipt = await tx.wait();
        showToast(successMessage, 'success', receipt.hash);
        
        // Atualiza os dados do usuário após uma transação de sucesso
        loadUserData(); 
        
        return true;
    } catch (e) {
        console.error(e);
        const reason = e.reason || e.message || 'Transaction rejected.';
        showToast(`${failMessage}: ${reason}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}

// --- Funções Auxiliares para Aprovação (Com Tolerância de 1%) ---

async function ensureApproval(spenderAddress, requiredAmount, btnElement, purpose) {
    if (!State.signer) return false;
    
    // 1. Calcula o valor tolerado (1% a mais) para cobrir pequenas variações do supply
    const toleratedAmount = (requiredAmount * BigInt(BIPS_DENOMINATOR + APPROVAL_TOLERANCE_BIPS)) / BigInt(BIPS_DENOMINATOR);
    
    const originalText = btnElement.innerHTML;
    const approvalText = `Approving ${formatBigNumber(toleratedAmount).toFixed(2)} $BKC (with 1% tolerance) for ${purpose}...`;
    
    try {
        const allowance = await State.bkcTokenContract.allowance(State.userAddress, spenderAddress);
        
        // 2. Verifica a permissão para o valor tolerado
        if (allowance < toleratedAmount) {
            showToast(approvalText, "info");
            
            if (!btnElement.innerHTML.includes('Approving')) {
                 btnElement.innerHTML = '<div class="loader inline-block"></div> Approving...';
            }
            
            // 3. Aprova o valor tolerado
            const approveTx = await State.bkcTokenContract.approve(spenderAddress, toleratedAmount);
            await approveTx.wait();
            showToast('Approval successful!', "success");
        }
        return true;
    } catch (e) {
        console.error("Approval Error:", e);
        showToast(`Approval Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error"); 
        btnElement.innerHTML = originalText;
        return false;
    }
}

// --- DELEGAÇÃO / UNSTAKE ---

export async function executeDelegation(validatorAddr, totalAmount, durationSeconds, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    // totalAmount será o valor *líquido* da delegação. A tolerância é aplicada internamente.
    const approved = await ensureApproval(addresses.delegationManager, totalAmount, btnElement, "Delegation");
    if (!approved) return false;

    const delegateTxPromise = State.delegationManagerContract.delegate(validatorAddr, totalAmount, BigInt(durationSeconds));
    const success = await executeTransaction(
        delegateTxPromise, 
        'Delegation successful!', 
        'Error delegating tokens', 
        btnElement
    );
    if (success) closeModal();
    return success;
}

export async function executeUnstake(index) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    const unstakeTxPromise = State.delegationManagerContract.unstake(index);
    return await executeTransaction(
        unstakeTxPromise,
        'Unstake successful!',
        'Error unstaking tokens',
        document.querySelector(`.unstake-btn[data-index='${index}']`)
    );
}

export async function executeForceUnstake(index) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    if (!confirm("Are you sure? This action will incur a 50% penalty on your principal.")) return false;
    
    const forceUnstakeTxPromise = State.delegationManagerContract.forceUnstake(index);
    return await executeTransaction(
        forceUnstakeTxPromise,
        'Force unstake successful!',
        'Error performing force unstake',
        document.querySelector(`.force-unstake-btn[data-index='${index}']`)
    );
}

// --- VALIDADOR ---

export async function payValidatorFee(feeAmount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    // feeAmount será o valor líquido da taxa.
    const approved = await ensureApproval(addresses.delegationManager, feeAmount, btnElement, "Validator Fee");
    if (!approved) return false;
    
    const payTxPromise = State.delegationManagerContract.payRegistrationFee();
    return await executeTransaction(
        payTxPromise, 
        'Fee paid successfully!', 
        'Error paying validator fee', 
        btnElement
    );
}

export async function registerValidator(stakeAmount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    // stakeAmount será o valor líquido do stake.
    const approved = await ensureApproval(addresses.delegationManager, stakeAmount, btnElement, "Validator Stake");
    if (!approved) return false;

    const registerTxPromise = State.delegationManagerContract.registerValidator(State.userAddress);
    return await executeTransaction(
        registerTxPromise, 
        'Validator registered!', 
        'Error registering validator', 
        btnElement
    );
}

// --- POP MINING / CERTIFICADOS ---

export async function createVestingCertificate(recipientAddress, amount, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    if (!ethers.isAddress(recipientAddress)) return showToast('Invalid beneficiary address.', 'error');
    if (amount <= 0n) return showToast('Invalid amount.', 'error');
    if (amount > State.currentUserBalance) return showToast("Insufficient $BKC balance.", "error");

    // amount será o valor líquido da compra.
    const approved = await ensureApproval(addresses.rewardManager, amount, btnElement, "PoP Mining Purchase");
    if (!approved) return false;
    
    const createTxPromise = State.rewardManagerContract.createVestingCertificate(recipientAddress, amount);
    const success = await executeTransaction(
        createTxPromise,
        'PoP Mining completed successfully!',
        'Error executing PoP Mining',
        btnElement
    );
    if (success) {
        document.getElementById('recipientAddressInput').value = '';
        document.getElementById('certificateAmountInput').value = '';
    }
    return success;
}

export async function executeWithdraw(tokenId, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const withdrawTxPromise = State.rewardManagerContract.withdraw(tokenId);
    return await executeTransaction(
        withdrawTxPromise,
        'Withdrawal successful!',
        'Error during withdrawal',
        btnElement
    );
}

// --- CLAIM DE RECOMPENSAS ---

export async function executeUniversalClaim(stakingRewards, minerRewards, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    if (stakingRewards === 0n && minerRewards === 0n) {
        showToast("No rewards to claim.", "info");
        return false;
    }

    const originalText = btnElement ? btnElement.innerHTML : 'Claiming...';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div> Claiming...';
    }
    
    try {
        let txHashes = [];
        if (stakingRewards > 0n) {
            showToast("Claiming staking rewards...", "info");
            const tx = await State.delegationManagerContract.claimDelegatorReward(); 
            const receipt = await tx.wait();
            txHashes.push(receipt.hash);
        }
        if (minerRewards > 0n) {
            showToast("Claiming PoP Mining rewards...", "info");
            const tx = await State.rewardManagerContract.claimMinerRewards();
            const receipt = await tx.wait();
            txHashes.push(receipt.hash);
        }

        const successMessage = txHashes.length > 1 ? 'All rewards claimed successfully!' : 'Reward claimed successfully!';
        showToast(successMessage, "success", txHashes[0] || null);

        loadUserData(); 

        return true;
    } catch (e) {
        console.error("Error during universal claim:", e);
        showToast(`Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}

// --- BOOSTER STORE ---

export async function executeBuyBooster(boostBips, price, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");

    const originalText = btnElement ? btnElement.innerHTML : 'Buy';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }

    try {
        showToast("Finding an available NFT...", "info");
        
        // 1. Lógica de Encontrar Token ID
        const transferFilter = State.rewardBoosterContract.filters.Transfer(null, addresses.nftBondingCurve);
        
        let events = await safeContractCall(State.rewardBoosterContract, 'queryFilter', [transferFilter, 0, 'latest'], []);
        
        const candidateTokenIds = events.map(e => e.args.tokenId);
        let availableTokenId = null;
        
        for (const tokenId of candidateTokenIds.reverse()) {
            try {
                const owner = await safeContractCall(State.rewardBoosterContract, 'ownerOf', [tokenId], addresses.actionsManager); 
                const tokenBoostBips = await safeContractCall(State.nftBondingCurveContract, 'tokenIdToBoostBips', [tokenId], 0n);
                
                if (owner.toLowerCase() === addresses.nftBondingCurve.toLowerCase() && Number(tokenBoostBips) == boostBips) {
                    availableTokenId = tokenId;
                    break;
                }
            } catch(e) {
                continue;
            }
        }
        
        if (availableTokenId === null) throw new Error("No NFT of this tier was found in the pool or contract data is corrupt.");
        
        // 2. Aprovação e Compra
        const priceWei = BigInt(price);
        
        const approved = await ensureApproval(addresses.nftBondingCurve, priceWei, btnElement, "NFT Purchase");
        if (!approved) return false;
        
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Buying...';
        showToast("Submitting buy transaction...", "info");
        const buyTxPromise = State.nftBondingCurveContract.buyNFT(boostBips, availableTokenId);
        const success = await executeTransaction(
            buyTxPromise,
            'Purchase successful!',
            'Error during purchase',
            btnElement
        );
        
        // 3. Adicionar à carteira
        if (success) {
            import('../ui-feedback.js').then(module => {
                module.addNftToWallet(addresses.rewardBoosterNFT, availableTokenId.toString());
            });
        }
        return success;

    } catch (e) {
        console.error("Error buying booster:", e);
        showToast(`Error: ${e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}

export async function executeSellBooster(tokenId, btnElement) {
    if (!State.signer) return showToast("Wallet not connected.", "error");
    
    const originalText = btnElement ? btnElement.innerHTML : 'Sell NFT';
    if (btnElement) {
        btnElement.disabled = true;
        btnElement.innerHTML = '<div class="loader inline-block"></div>';
    }

    try {
        // 1. Aprovar o NFT para o pool de liquidez (ERC721.approve)
        showToast(`Approving transfer of NFT #${tokenId}...`, "info");
        const approveTx = await State.rewardBoosterContract.approve(addresses.nftBondingCurve, tokenId);
        await approveTx.wait();
        showToast("NFT approved successfully!", "success");
        
        if (btnElement) btnElement.innerHTML = '<div class="loader inline-block"></div> Selling...';
        showToast("Submitting sell transaction...", "info");
        
        // 2. Executar a venda
        const sellTxPromise = State.nftBondingCurveContract.sellNFT(tokenId);
        const success = await executeTransaction(
            sellTxPromise,
            'Sale successful!',
            'Error during sale',
            btnElement
        );
        return success;

    } catch (e) {
        console.error("Error selling booster:", e);
        showToast(`Error: ${e.reason || e.message || 'Transaction rejected.'}`, "error");
        return false;
    } finally {
        if(btnElement) {
            btnElement.disabled = false;
            btnElement.innerHTML = originalText;
        }
    }
}