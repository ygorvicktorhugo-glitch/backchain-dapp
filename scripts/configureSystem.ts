import hre from "hardhat";
import { ethers } from "hardhat";
import addresses from "../deployment-addresses.json";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Iniciando configuração do sistema com a conta:", deployer.address);

  // CIDs ATUALIZADOS COM OS SEUS VALORES FINAIS DO IPFS
  const ipfsBaseURI_Vesting = "ipfs://bafybeiew62trbumuxfta36hh7tz7pdzhnh73oh6lnsrxx6ivq5mxpwyo24/";
  const ipfsBaseURI_Boosters = "ipfs://bafybeiekppvla3j7s2qqx7nvvkxawlmih5oewmbeurdappljd2ky4qt4qq/";

  // --- Carrega os contratos ---
  const bkcToken = await ethers.getContractAt("BKCToken", addresses.bkcToken, deployer);
  const delegationManager = await ethers.getContractAt("DelegationManager", addresses.delegationManager, deployer);
  const rewardManager = await ethers.getContractAt("RewardManager", addresses.rewardManager, deployer);
  const rewardBooster = await ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);

  // --- Passo 1: Configurar Endereços de Referência no BKCToken ---
  console.log("\n1. Configurando endereços de referência no BKCToken...");
  let tx = await bkcToken.setTreasuryWallet(deployer.address);
  await tx.wait();
  console.log(` -> Tesouraria definida como: ${deployer.address}`);
  
  tx = await bkcToken.setDelegationManager(addresses.delegationManager);
  await tx.wait();
  console.log(` -> Endereço do DelegationManager registrado.`);
  
  tx = await bkcToken.setRewardManager(addresses.rewardManager);
  await tx.wait();
  console.log(` -> Endereço do RewardManager registrado.`);
  console.log("✅ Endereços de referência do BKCToken configurados.");

  // --- Passo 2: Configurar Managers ---
  console.log("\n2. Configurando as interdependências dos managers...");
  tx = await delegationManager.setRewardManager(addresses.rewardManager);
  await tx.wait();
  console.log(` -> RewardManager definido no DelegationManager.`);
  
  // --- MUDANÇA: A chamada para setBoosterNFT foi removida pois a função não existe mais ---
  
  tx = await rewardManager.setDelegationManager(addresses.delegationManager);
  await tx.wait();
  console.log(` -> DelegationManager definido no RewardManager.`);
  console.log("✅ Managers configurados.");

  // --- Passo 3: Configurar as Base URIs dos NFTs ---
  console.log("\n3. Configurando as Base URIs para os metadados...");
  tx = await rewardManager.setBaseURI(ipfsBaseURI_Vesting);
  await tx.wait();
  console.log(` -> Base URI dos Certificados de Vesting configurada.`);
  
  tx = await rewardBooster.setBaseURI(ipfsBaseURI_Boosters);
  await tx.wait();
  console.log(` -> Base URI dos Boosters de Recompensa configurada.`);
  console.log("✅ Base URIs configuradas.");

  // --- Passo 4: Transferir propriedade do BKCToken ---
  console.log("\n4. Transferindo propriedade do BKCToken para o RewardManager...");
  const currentOwner = await bkcToken.owner();
  if (currentOwner.toLowerCase() === deployer.address.toLowerCase()) {
      tx = await bkcToken.transferOwnership(addresses.rewardManager);
      await tx.wait();
      console.log(`✅ Propriedade do BKCToken transferida para: ${addresses.rewardManager}`);
  } else {
      console.log(`⚠️  Propriedade do BKCToken já pertence a ${currentOwner}. Nenhuma ação foi tomada.`);
  }

  console.log("\n🎉 Configuração completa do sistema concluída! 🎉");
}

main().catch((error: any) => {
  console.error("\n❌ ERRO CRÍTICO DURANTE A CONFIGURAÇÃO DO SISTEMA ❌\n");

  if (
    error.message.includes("ProviderError") ||
    error.message.includes("in-flight") ||
    error.message.includes("nonce") ||
    error.message.includes("underpriced")
  ) {
    console.error("Causa provável: Problema de conexão ou transação pendente na rede.");
    console.log("\n--- AÇÃO RECOMENDADA ---");
    console.log("1. Na sua MetaMask, vá em 'Configurações' -> 'Avançado' e clique em 'Redefinir dados de atividade da conta'.");
    console.log("2. Aguarde um minuto e tente executar ESTE SCRIPT ('configureSystem.ts') novamente.");
    console.log("\n👉 SE O ERRO PERSISTIR, reinicie o processo do zero (delete 'deployment-addresses.json' e rode 'deploy.ts' novamente).");
  } else {
    console.error("Ocorreu um erro inesperado:", error.message);
  }
  
  process.exit(1);
});