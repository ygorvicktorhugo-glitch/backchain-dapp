import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Implantando PublicSale com a conta:", deployer.address);
  
  // MODIFICAÇÃO: Lendo o arquivo de endereços
  const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
  const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

  const nftContractAddress = addresses.rewardBoosterNFT;
  const treasuryAddress = "0x55b9362e97AdEf3D6FBcca2cc12d33E2964d1E90";

  console.log(`Usando RewardBoosterNFT em: ${nftContractAddress}`);

  const publicSale = await hre.ethers.deployContract("PublicSale", [
    nftContractAddress,
    deployer.address,
    treasuryAddress,
  ]);

  await publicSale.waitForDeployment();
  console.log(`✅ Contrato PublicSale implantado em: ${publicSale.target}`);

  // MODIFICAÇÃO: Adicionando o novo endereço e salvando o arquivo
  addresses.publicSale = publicSale.target;
  fs.writeFileSync(addressesFilePath, JSON.stringify(addresses, null, 2));
  console.log("✅ Endereço do PublicSale salvo em deployment-addresses.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});