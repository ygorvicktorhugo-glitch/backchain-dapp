// modules/data.js

const ethers = window.ethers;

import { State } from '../state.js';
import { DOMElements } from '../dom-elements.js';
import { formatBigNumber, formatPStake } from '../utils.js';
import { addresses, boosterTiers, ipfsGateway } from '../config.js';

// ====================================================================
// FUNÇÕES DE SEGURANÇA E RESILIÊNCIA (EXPORTADAS PARA USO EM OUTROS MODULES)
// ====================================================================

// Função auxiliar para buscar saldo com fallback seguro, tratando BAD_DATA
export const safeBalanceOf = async (contract, address) => {
    try {
        return await contract.balanceOf(address);
    } catch (e) {
        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            console.warn(`SafeBalanceOf: Falha ao buscar saldo para ${address}. Assumindo 0n.`, e);
            return 0n;
        }
        throw e;
    }
};

// NOVO: Função auxiliar genérica para chamadas de contrato view/pure que podem reverter
export const safeContractCall = async (contract, method, args = [], fallbackValue = 0n) => {
    try {
        const result = await contract[method](...args);
        return result;
    } catch (e) {
        if (e.code === 'BAD_DATA' || e.code === 'CALL_EXCEPTION') {
            console.warn(`SafeContractCall (${method}): Falha com BAD_DATA/CALL_EXCEPTION. Retornando fallback.`, e);
            if (typeof fallbackValue === 'object' && fallbackValue !== null && !Array.isArray(fallbackValue) && typeof fallbackValue !== 'bigint') {
                 return { ...fallbackValue };
            }
            return fallbackValue;
        }
        throw e;
    }
};

// ====================================================================
// FIM FUNÇÕES DE SEGURANÇA
// ====================================================================


export async function loadPublicData() {
    if (!State.publicProvider || !State.bkcTokenContract || !State.delegationManagerContract) return;

    try {
        const publicDelegationContract = State.delegationManagerContract;
        const publicBkcContract = State.bkcTokenContract;
        
        let totalSupply = await safeContractCall(publicBkcContract, 'totalSupply', [], 0n);

        const [totalPStake, validators, MINT_POOL, TGE_SUPPLY, delegatedManagerBalance, nftPoolBalance] = await Promise.all([ 
            safeContractCall(publicDelegationContract, 'totalNetworkPStake', [], 0n),
            safeContractCall(publicDelegationContract, 'getAllValidators', [], []),
            safeContractCall(publicDelegationContract, 'MINT_POOL', [], 0n),
            safeContractCall(publicDelegationContract, 'TGE_SUPPLY', [], 0n),
            
            safeBalanceOf(publicBkcContract, addresses.delegationManager), 
            safeBalanceOf(publicBkcContract, addresses.nftBondingCurve)
        ]);
        
        if (totalSupply === 0n && TGE_SUPPLY > 0n) {
             totalSupply = TGE_SUPPLY;
             console.warn("Usando TGE_SUPPLY como estimativa de Total Supply devido à falha na chamada totalSupply().");
        }
        
        const totalLockedWei = delegatedManagerBalance + nftPoolBalance;
        let lockedPercentage = 0;

        if (totalSupply > 0n) {
             lockedPercentage = (Number(totalLockedWei) * 100) / Number(totalSupply);
        }

        DOMElements.statTotalSupply.textContent = `${formatBigNumber(totalSupply).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
        DOMElements.statTotalPStake.textContent = formatPStake(totalPStake);
        DOMElements.statValidators.textContent = validators.length;

        const lockedEl = document.getElementById('statLockedPercentage');
        if (lockedEl) lockedEl.textContent = `${lockedPercentage.toFixed(2)}%`;
        
        const scarcityRateEl = document.getElementById('statScarcity');
        const currentMinted = totalSupply > TGE_SUPPLY ? totalSupply - TGE_SUPPLY : 0n;
        const remainingMintable = MINT_POOL - currentMinted;
        
        let scarcityRate = 0n;
        if (MINT_POOL > 0n) {
            scarcityRate = (remainingMintable * 10000n) / MINT_POOL;
        } else {
             scarcityRate = (totalSupply === 0n && remainingMintable > 0n) ? 10000n : 0n;
        }
        
        if (scarcityRateEl) scarcityRateEl.textContent = `${(Number(scarcityRate) / 100).toFixed(2)}%`;


        if (validators.length === 0) {
            State.allValidatorsData = [];
        } else {
            const validatorDataPromises = validators.map(async (addr) => {
                const fallbackStruct = { isRegistered: false, selfStakeAmount: 0n, totalDelegatedAmount: 0n };
                const validatorInfo = await safeContractCall(publicDelegationContract, 'validators', [addr], fallbackStruct);
                const pStake = await safeContractCall(publicDelegationContract, 'userTotalPStake', [addr], 0n);
                
                return {
                    addr, 
                    pStake,
                    selfStake: validatorInfo.selfStakeAmount,
                    delegatedStake: validatorInfo.totalDelegatedAmount
                };
            });
            State.allValidatorsData = await Promise.all(validatorDataPromises);
        }

    } catch (e) { console.error("Error loading public data", e)}
}

// --- LÓGICA DE DADOS DO USUÁRIO ---

export async function loadUserData() {
    if (!State.signer || !State.userAddress) return;
    
    const statUserPStake = document.getElementById('statUserPStake');
    const statUserRewards = document.getElementById('statUserRewards');
    const dashboardClaimBtn = document.getElementById('dashboardClaimBtn');

    try {
        const [balance, delegationsRaw, totalUserPStake] = await Promise.all([
            safeBalanceOf(State.bkcTokenContract, State.userAddress),
            safeContractCall(State.delegationManagerContract, 'getDelegationsOf', [State.userAddress], []),
            safeContractCall(State.delegationManagerContract, 'userTotalPStake', [State.userAddress], 0n)
        ]);
        
        State.currentUserBalance = balance;
        
        State.userDelegations = delegationsRaw.map((d, index) => ({
            amount: d[0], unlockTime: d[1], 
            lockDuration: d[2], validator: d[3], index
        }));
        
        if(statUserPStake) statUserPStake.textContent = formatPStake(totalUserPStake);
        
        const { totalRewards } = await calculateUserTotalRewards();
        if(statUserRewards) statUserRewards.textContent = `${formatBigNumber(totalRewards).toFixed(4)}`;
        
        if (dashboardClaimBtn) {
            if (totalRewards > 0n) {
                dashboardClaimBtn.classList.remove('opacity-0', 'btn-disabled');
                dashboardClaimBtn.disabled = false;
            } else {
                dashboardClaimBtn.classList.add('opacity-0', 'btn-disabled');
                dashboardClaimBtn.disabled = true;
            }
        }
    } catch (e) {
        console.error("Error loading user data:", e);
    }
}

export async function calculateUserTotalRewards() {
    if (!State.delegationManagerContract || !State.rewardManagerContract || !State.userAddress) {
        return { stakingRewards: 0n, minerRewards: 0n, totalRewards: 0n };
    }
    
    try {
        const delegatorReward = await safeContractCall(State.delegationManagerContract, 'pendingDelegatorRewards', [State.userAddress], 0n);
        const minerRewards = await safeContractCall(State.rewardManagerContract, 'minerRewardsOwed', [State.userAddress], 0n);
        
        const stakingRewards = delegatorReward;
        return { stakingRewards, minerRewards, totalRewards: stakingRewards + minerRewards };

    } catch (e) {
        console.error("Error in calculateUserTotalRewards:", e);
        return { stakingRewards: 0n, minerRewards: 0n, totalRewards: 0n };
    }
}

// CORREÇÃO: Função refatorada para ser mais simples e robusta
export async function getHighestBoosterBoost() {
    if (!State.rewardBoosterContract || !State.userAddress) {
        return { highestBoost: 0, boostName: 'None', imageUrl: '', tokenId: null, efficiency: 50 };
    }
    
    await loadMyBoosters(); // Garante que os boosters do usuário estão carregados
    
    if (State.myBoosters.length === 0) {
        return { highestBoost: 0, boostName: 'None', imageUrl: '', tokenId: null, efficiency: 50 };
    }
    
    try {
        // Encontra o booster com o maior 'boostBips' do array já carregado
        const highestBooster = State.myBoosters.reduce((max, booster) => booster.boostBips > max.boostBips ? booster : max, State.myBoosters[0]);

        const highestBoost = highestBooster.boostBips;
        const bestTokenId = highestBooster.tokenId;
        
        const boostPercent = highestBoost / 100;
        const finalEfficiency = Math.min(50 + boostPercent, 100);

        const tier = boosterTiers.find(t => t.boostBips === highestBoost);
        let imageUrl = tier?.img || '';
        let nftName = tier?.name ? `${tier.name} Booster` : 'Booster NFT';

        // Tenta buscar metadados on-chain para ter a imagem e nome mais atualizados
        try {
            const tokenURI = await State.rewardBoosterContract.tokenURI(bestTokenId);
            if (tokenURI) {
                const metadataResponse = await fetch(tokenURI.replace("ipfs://", ipfsGateway));
                if (metadataResponse.ok) {
                    const metadata = await metadataResponse.json();
                    imageUrl = metadata.image ? metadata.image.replace("ipfs://", ipfsGateway) : imageUrl;
                    nftName = metadata.name || nftName;
                }
            }
        } catch (e) { 
            console.warn(`Could not fetch metadata for booster #${bestTokenId}:`, e); 
        }

        return { highestBoost, boostName: nftName, imageUrl, tokenId: bestTokenId.toString(), efficiency: finalEfficiency };

    } catch (e) {
        console.error("Error processing highest booster:", e);
        return { highestBoost: 0, boostName: 'Error', imageUrl: '', tokenId: null, efficiency: 50 };
    }
}


export async function loadMyCertificates() {
    if (!State.signer || !State.rewardManagerContract) return [];
    
    try {
        const balance = await safeBalanceOf(State.rewardManagerContract, State.userAddress);
        const count = Number(balance);
        if (count === 0) {
             State.myCertificates = [];
             return [];
        }

        const tokenIds = [];
        for (let i = 0; i < count; i++) {
            try {
                const tokenId = await safeContractCall(State.rewardManagerContract, 'tokenOfOwnerByIndex', [State.userAddress, i], 0n);
                if (tokenId !== 0n) {
                    tokenIds.push(tokenId);
                } else {
                     break; 
                }
            } catch (e) {
                console.error(`Falha ao carregar certificado de índice ${i}. Abortando listagem.`, e);
                break;
            }
        }
        
        State.myCertificates = tokenIds.reverse().map(id => ({ tokenId: id }));
        return State.myCertificates;

    } catch (e) {
        console.error("Erro ao carregar certificados de vesting:", e);
        return [];
    }
}

export async function loadMyBoosters() {
    // Evita recarregar desnecessariamente se já foi carregado
    if (State.myBoosters && State.myBoosters.length > 0) {
        return State.myBoosters;
    }

    if (!State.signer || !State.rewardBoosterContract) return [];
    
    try {
        console.log("Loading user boosters by querying Transfer events...");

        const userAddress = State.userAddress;
        const contract = State.rewardBoosterContract;

        const transferToUserFilter = contract.filters.Transfer(null, userAddress);
        const transferFromUserFilter = contract.filters.Transfer(userAddress, null);

        const [toEvents, fromEvents] = await Promise.all([
            safeContractCall(contract, 'queryFilter', [transferToUserFilter, 0, 'latest'], []),
            safeContractCall(contract, 'queryFilter', [transferFromUserFilter, 0, 'latest'], [])
        ]);

        const ownedTokens = new Map();
        toEvents.forEach(event => {
            const tokenId = event.args.tokenId;
            ownedTokens.set(tokenId.toString(), tokenId);
        });
        fromEvents.forEach(event => {
            const tokenId = event.args.tokenId;
            ownedTokens.delete(tokenId.toString());
        });

        const currentOwnedTokenIds = Array.from(ownedTokens.values());
        
        if (currentOwnedTokenIds.length === 0) {
            State.myBoosters = [];
            return [];
        }

        const boosterDetailsPromises = currentOwnedTokenIds.map(async (tokenId) => {
            const boostBips = await safeContractCall(contract, 'boostBips', [tokenId], 0n);
            return {
                tokenId: tokenId,
                boostBips: Number(boostBips)
            };
        });

        const boosterDetails = await Promise.all(boosterDetailsPromises);

        State.myBoosters = boosterDetails;
        console.log(`Found ${boosterDetails.length} boosters for user.`);
        return boosterDetails;

    } catch (e) {
        console.error("Error loading My Boosters via event query:", e);
        State.myBoosters = [];
        return [];
    }
}