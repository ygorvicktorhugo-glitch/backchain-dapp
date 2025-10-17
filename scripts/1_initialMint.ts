// scripts/1_initialMint.ts

import hre from "hardhat";
import addresses from "../deployment-addresses.json";
import { LogDescription, ContractTransactionReceipt } from "ethers";
import fs from "fs";

// Função de atraso
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Wrapper de transação com retentativas
async function sendTransactionWithRetries(txFunction: () => Promise<any>, retries = 3): Promise<ContractTransactionReceipt> {
  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txFunction();
      console.log(`   -> Transação enviada... aguardando confirmação...`);
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transação enviada, mas o recibo retornado foi nulo.");
      }
      await sleep(1500); // Pausa para a rede processar
      return receipt;
    } catch (error: any) {
      if ((error.message.includes("nonce") || error.message.includes("in-flight")) && i < retries - 1) {
        const delay = (i + 1) * 5000;
        console.warn(`   ⚠️ Problema de nonce. Tentando novamente em ${delay / 1000} segundos...`);
        await sleep(delay);
      } else {
        throw error;
      }
    }
  }
  throw new Error("A transação falhou após múltiplas tentativas.");
}

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const treasuryWallet = deployer.address;

  console.log("🚀 Iniciando a cunhagem e inicialização de liquidez dos pools...");

  const rewardBoosterNFT = await ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);
  const nftLiquidityPool = await ethers.getContractAt("NFTLiquidityPool", addresses.nftLiquidityPool, deployer);
  const bkcToken = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);

  const CHUNK_SIZE = 150; // Mintar em lotes de 150 para evitar timeouts
  const LIQUIDITY_PER_POOL = ethers.parseEther("1000000");

  const tiers = [
    { name: "Diamond", boostBips: 5000, metadata: "diamond_booster.json", totalSupply: 1000 },
    { name: "Platinum", boostBips: 4000, metadata: "platinum_booster.json", totalSupply: 1500 },
    { name: "Gold", boostBips: 3000, metadata: "gold_booster.json", totalSupply: 4000 },
    { name: "Silver", boostBips: 2000, metadata: "silver_booster.json", totalSupply: 8000 },
    { name: "Bronze", boostBips: 1000, metadata: "bronze_booster.json", totalSupply: 12000 },
  ];
  
  const allTreasuryTokenIds: { [key: string]: string[] } = {};

  const totalBkcApproval = LIQUIDITY_PER_POOL * BigInt(tiers.length);
  console.log(`\n1. Aprovando o NFTLiquidityPool para gastar ${ethers.formatEther(totalBkcApproval)} $BKC...`);
  await sendTransactionWithRetries(() => bkcToken.approve(addresses.nftLiquidityPool, totalBkcApproval));
  console.log("✅ Aprovação de BKC bem-sucedida.");

  for (const tier of tiers) {
    console.log(`\n--- Processando tier: ${tier.name} (Total: ${tier.totalSupply} NFTs) ---`);

    const poolInfo = await nftLiquidityPool.pools(tier.boostBips);
    if (poolInfo.nftCount > 0) {
        console.log(`⚠️  Pool do tier ${tier.name} já foi inicializado. Pulando.`);
        if (fs.existsSync("treasury-nft-ids.json")) {
            const existingIds = JSON.parse(fs.readFileSync("treasury-nft-ids.json", "utf-8"));
            if (existingIds[tier.name]) {
                allTreasuryTokenIds[tier.name] = existingIds[tier.name];
            }
        }
        continue;
    }

    // Define as quantidades: 5% para a tesouraria (venda pública/marketing), 95% para a liquidez do pool
    const treasuryAmount = Math.floor(tier.totalSupply * 0.05);
    const poolAmount = tier.totalSupply - treasuryAmount;

    // --- Etapa 1: Mintar NFTs da Tesouraria ---
    const treasuryTokenIdsInTier: string[] = [];
    if (treasuryAmount > 0) {
        console.log(` -> Etapa 1: Mintando ${treasuryAmount} NFTs (5%) para a Tesouraria...`);
        for (let i = 0; i < treasuryAmount; i += CHUNK_SIZE) {
            const amountToMint = Math.min(treasuryAmount - i, CHUNK_SIZE);
            const receipt = await sendTransactionWithRetries(() => 
                rewardBoosterNFT.batchSafeMintWithBoost(treasuryWallet, amountToMint, tier.boostBips, tier.metadata)
            );
            const tokenIdsInChunk = receipt.logs
                .map((log: any) => { try { return rewardBoosterNFT.interface.parseLog(log); } catch { return null; } })
                .filter((log): log is LogDescription => log !== null && log.name === "BoosterMinted")
                .map((log) => log.args.tokenId.toString());
            treasuryTokenIdsInTier.push(...tokenIdsInChunk);
        }
        allTreasuryTokenIds[tier.name] = treasuryTokenIdsInTier;
        console.log(`   ✅ NFTs da Tesouraria cunhados.`);
    }

    // --- Etapa 2: Mintar NFTs e Adicionar Liquidez ao Pool ---
    const allPoolTokenIds: string[] = [];
    if (poolAmount > 0) {
        console.log(` -> Etapa 2: Mintando ${poolAmount} NFTs (95%) para a liquidez...`);
        for (let i = 0; i < poolAmount; i += CHUNK_SIZE) {
            const amountToMint = Math.min(poolAmount - i, CHUNK_SIZE);
            const receipt = await sendTransactionWithRetries(() => 
                rewardBoosterNFT.batchSafeMintWithBoost(deployer.address, amountToMint, tier.boostBips, tier.metadata)
            );
            const tokenIdsInChunk = receipt.logs
                .map((log: any) => { try { return rewardBoosterNFT.interface.parseLog(log); } catch { return null; } })
                .filter((log): log is LogDescription => log !== null && log.name === "BoosterMinted")
                .map((log) => log.args.tokenId.toString());
            allPoolTokenIds.push(...tokenIdsInChunk);
        }
        console.log(`   ✅ Todos os ${allPoolTokenIds.length} NFTs para o pool foram cunhados para a sua carteira.`);

        console.log(` -> Etapa 3: Adicionando liquidez com ${allPoolTokenIds.length} NFTs...`);
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(addresses.nftLiquidityPool, true));
        let isFirstChunk = true;
        for (let i = 0; i < allPoolTokenIds.length; i += CHUNK_SIZE) {
            const chunk = allPoolTokenIds.slice(i, i + CHUNK_SIZE);
            if (isFirstChunk) {
                await sendTransactionWithRetries(() => 
                    nftLiquidityPool.addInitialLiquidity(tier.boostBips, chunk, LIQUIDITY_PER_POOL)
                );
                isFirstChunk = false;
            } else {
                await sendTransactionWithRetries(() => 
                    nftLiquidityPool.addMoreNFTsToPool(tier.boostBips, chunk)
                );
            }
        }
        await sendTransactionWithRetries(() => rewardBoosterNFT.setApprovalForAll(addresses.nftLiquidityPool, false));
        console.log("   ✅ Liquidez adicionada com sucesso.");
    }

    console.log(`✅ Tier ${tier.name} inicializado com sucesso.`);
  }
  
  fs.writeFileSync("treasury-nft-ids.json", JSON.stringify(allTreasuryTokenIds, null, 2));
  console.log("\n✅ IDs dos NFTs da tesouraria salvos em treasury-nft-ids.json");

  console.log("\n🔒 Etapa Final: Renunciando à propriedade do contrato RewardBoosterNFT...");
  await sendTransactionWithRetries(() => 
    rewardBoosterNFT.renounceOwnership()
  );
  console.log("✅ Propriedade renunciada. O suprimento de NFTs agora é imutável.");

  console.log("\n🎉 Processo de cunhagem e inicialização de liquidez concluído!");
}

main().catch((error: any) => {
  console.error("\n❌ ERRO CRÍTICO DURANTE A CUNHAGEM E INICIALIZAÇÃO DOS POOLS ❌\n");
  console.error("Ocorreu um erro inesperado:", error.message);
  process.exit(1);
});