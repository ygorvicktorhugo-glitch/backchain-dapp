import hre from "hardhat";
import fs from "fs";
import { ethers } from "hardhat";

// Função de pausa extra, apenas como uma segurança adicional
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Implantando contratos com a conta:", deployer.address);
  console.log("----------------------------------------------------");

  // --- 1. Implantar BKCToken ---
  console.log("1. Implantando BKCToken...");
  const bkcToken = await ethers.deployContract("BKCToken", [deployer.address]);
  console.log("   Aguardando confirmação...");
  await bkcToken.waitForDeployment();
  console.log(`✅ BKCToken implantado em: ${bkcToken.target}`);
  console.log("----------------------------------------------------");
  await sleep(2000);

  // --- 2. Implantar RewardManager ---
  console.log("2. Implantando RewardManager...");
  const rewardManager = await ethers.deployContract("RewardManager", [
    bkcToken.target, deployer.address, deployer.address,
  ]);
  console.log("   Aguardando confirmação...");
  await rewardManager.waitForDeployment();
  console.log(`✅ RewardManager implantado em: ${rewardManager.target}`);
  console.log("----------------------------------------------------");
  await sleep(2000);

  // --- 3. Implantar DelegationManager ---
  console.log("3. Implantando DelegationManager...");
  const delegationManager = await ethers.deployContract("DelegationManager", [
    bkcToken.target, deployer.address, deployer.address,
  ]);
  console.log("   Aguardando confirmação...");
  await delegationManager.waitForDeployment();
  console.log(`✅ DelegationManager implantado em: ${delegationManager.target}`);
  console.log("----------------------------------------------------");
  await sleep(2000);

  // --- 4. Implantar RewardBoosterNFT ---
  console.log("4. Implantando RewardBoosterNFT...");
  const rewardBoosterNFT = await ethers.deployContract("RewardBoosterNFT", [deployer.address]);
  console.log("   Aguardando confirmação...");
  await rewardBoosterNFT.waitForDeployment();
  console.log(`✅ RewardBoosterNFT implantado em: ${rewardBoosterNFT.target}`);
  console.log("----------------------------------------------------");
  await sleep(2000);
  
  // --- 5. Implantar NFTLiquidityPool ---
  console.log("5. Implantando NFTLiquidityPool...");
  const nftLiquidityPool = await ethers.deployContract("NFTLiquidityPool", [
    bkcToken.target, rewardBoosterNFT.target, delegationManager.target, deployer.address, deployer.address,
  ]);
  console.log("   Aguardando confirmação...");
  await nftLiquidityPool.waitForDeployment();
  console.log(`✅ NFTLiquidityPool implantado em: ${nftLiquidityPool.target}`);
  console.log("----------------------------------------------------");
  await sleep(2000);

  // --- 6. Implantar FortuneTiger ---
  console.log("6. Implantando FortuneTiger...");
  // REMOVIDO: A variável minStakeForAction não é mais necessária no construtor.
  // const minStakeForAction = ethers.parseEther("100"); 
  const fortuneTiger = await ethers.deployContract("FortuneTiger", [
    bkcToken.target, 
    delegationManager.target, 
    deployer.address, 
    deployer.address,
    // REMOVIDO: O quinto argumento foi retirado para corresponder ao novo construtor.
  ]);
  console.log("   Aguardando confirmação...");
  await fortuneTiger.waitForDeployment();
  console.log(`✅ FortuneTiger implantado em: ${fortuneTiger.target}`);
  console.log("----------------------------------------------------");

  console.log("\n🎉 Todos os contratos foram implantados com sucesso! 🎉");
  
  const addresses = {
    bkcToken: bkcToken.target,
    delegationManager: delegationManager.target,
    rewardManager: rewardManager.target,
    rewardBoosterNFT: rewardBoosterNFT.target,
    nftLiquidityPool: nftLiquidityPool.target,
    fortuneTiger: fortuneTiger.target,
  };

  fs.writeFileSync("deployment-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\n✅ Endereços salvos em deployment-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});