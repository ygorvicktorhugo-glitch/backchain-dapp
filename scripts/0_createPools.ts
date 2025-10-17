import hre from "hardhat";
import addresses from "../deployment-addresses.json";

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();

  console.log("🚀 Criando a estrutura das piscinas de liquidez AMM...");

  const nftLiquidityPool = await ethers.getContractAt("NFTLiquidityPool", addresses.nftLiquidityPool, deployer);

  const tiers = [
    { name: "Diamond", boostBips: 5000 },
    { name: "Platinum", boostBips: 4000 },
    { name: "Gold", boostBips: 3000 },
    { name: "Silver", boostBips: 2000 },
    { name: "Bronze", boostBips: 1000 },
  ];

  for (const tier of tiers) {
    console.log(`\n -> Criando a estrutura do pool para ${tier.name}...`);

    const tx = await nftLiquidityPool.createPool(tier.boostBips);
    await tx.wait();
    console.log(`   ✅ Pool ${tier.name} (boostBips: ${tier.boostBips}) criado com sucesso.`);
  }

  console.log("\n🎉 Todas as estruturas de pool foram criadas!");
}

// +++ Bloco de tratamento de erros aprimorado +++
main().catch((error: any) => {
  console.error("\n❌ ERRO CRÍTICO DURANTE A CRIAÇÃO DOS POOLS ❌\n");

  if (
    error.message.includes("ProviderError") ||
    error.message.includes("in-flight") ||
    error.message.includes("nonce") ||
    error.message.includes("underpriced")
  ) {
    console.error("Causa provável: Problema de conexão ou transação pendente na rede.");
    console.log("\n--- AÇÃO RECOMENDADA ---");
    console.log("1. Na sua MetaMask, vá em 'Configurações' -> 'Avançado' e clique em 'Redefinir dados de atividade da conta'.");
    console.log("2. Aguarde um minuto e tente executar ESTE SCRIPT ('0_createPools.ts') novamente.");
  } else {
    console.error("Ocorreu um erro inesperado:", error.message);
  }
  
  process.exit(1);
});     