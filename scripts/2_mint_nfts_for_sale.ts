import hre from "hardhat";
// MODIFICAÇÃO: Importando os endereços
import addresses from "../deployment-addresses.json";

async function main() {
  // MODIFICAÇÃO: O endereço é lido automaticamente do arquivo JSON
  const NFT_CONTRACT_ADDRESS = addresses.rewardBoosterNFT;

  const tiersToMint = {
      diamond: Array.from({length: 3}, (_, i) => i + 1),
      platinum: Array.from({length: 5}, (_, i) => i + 101),
      gold: Array.from({length: 10}, (_, i) => i + 201),
      silver: Array.from({length: 20}, (_, i) => i + 301),
      bronze: Array.from({length: 30}, (_, i) => i + 401),
  };

  const tierDetails = {
      diamond: { boostBips: 5000, metadata: "diamond_booster.json" },
      platinum: { boostBips: 4000, metadata: "platinum_booster.json" },
      gold: { boostBips: 3000, metadata: "gold_booster.json" },
      silver: { boostBips: 2000, metadata: "silver_booster.json" },
      bronze: { boostBips: 1000, metadata: "bronze_booster.json" },
  };

  const [minter] = await hre.ethers.getSigners();
  console.log("🚀 Iniciando mint de NFTs para a carteira do deployer:", minter.address);
  console.log(`Usando contrato RewardBoosterNFT em: ${NFT_CONTRACT_ADDRESS}`);

  const nftContract = await hre.ethers.getContractAt("RewardBoosterNFT", NFT_CONTRACT_ADDRESS, minter);

  for (const [tierName, tokenIds] of Object.entries(tiersToMint)) {
    if (tokenIds.length === 0) continue;
    console.log(`\n🔹 Mintando ${tokenIds.length} NFTs do tier ${tierName}...`);
    const details = tierDetails[tierName as keyof typeof tierDetails];
    try {
      const tx = await nftContract.batchSafeMintWithBoost(minter.address, tokenIds.length, details.boostBips, details.metadata);
      await tx.wait();
      console.log(`✅ ${tokenIds.length} NFTs do tier ${tierName} mintados com sucesso para ${minter.address}`);
    } catch (error: any) {
      console.error(`❌ Falha ao mintar o tier ${tierName}. Motivo: ${error.message}`);
    }
  }
  console.log("\n🎉 Processo de mint de NFTs concluído!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});