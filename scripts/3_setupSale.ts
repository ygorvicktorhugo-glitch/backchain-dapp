import hre from "hardhat";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

interface TreasuryNFTs {
    [key: string]: string[];
}

async function main() {
    const addressesFilePath = path.join(__dirname, "../deployment-addresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesFilePath, "utf8"));

    const treasuryIdsFilePath = path.join(__dirname, "../treasury-nft-ids.json");
    if (!fs.existsSync(treasuryIdsFilePath)) {
        console.error("❌ Erro: Arquivo 'treasury-nft-ids.json' não encontrado. Rode o script '1_initialMint.ts' primeiro.");
        return;
    }
    const treasuryIds: TreasuryNFTs = JSON.parse(fs.readFileSync(treasuryIdsFilePath, "utf8"));

    const SALE_CONTRACT_ADDRESS = (addresses as any).publicSale;
    const NFT_CONTRACT_ADDRESS = addresses.rewardBoosterNFT;

    const tiersToSetup = [
        { tierId: 0, tierName: "Diamond",  priceETH: "1.00",  count: 20 },
        { tierId: 1, tierName: "Platinum", priceETH: "0.40",  count: 30 },
        { tierId: 2, tierName: "Gold",     priceETH: "0.15",  count: 80 },
        { tierId: 3, tierName: "Silver",   priceETH: "0.075", count: 160 },
        { tierId: 4, tierName: "Bronze",   priceETH: "0.04",  count: 240 },
    ];

    if (!SALE_CONTRACT_ADDRESS) {
        console.error("❌ Erro: Endereço do PublicSale não encontrado.");
        return;
    }

    const [deployer] = await hre.ethers.getSigners();
    console.log("🚀 Configurando a venda pública com a conta:", deployer.address);
    console.log(`Usando contrato PublicSale em: ${SALE_CONTRACT_ADDRESS}`);

    const saleContract = await hre.ethers.getContractAt("PublicSale", SALE_CONTRACT_ADDRESS, deployer);
    const nftContract = await hre.ethers.getContractAt("RewardBoosterNFT", NFT_CONTRACT_ADDRESS, deployer);

    // --- PASSO DE APROVAÇÃO ADICIONADO ---
    console.log("\n1. Aprovando o contrato de venda para gerenciar seus NFTs...");
    try {
        const approveTx = await nftContract.setApprovalForAll(SALE_CONTRACT_ADDRESS, true);
        await approveTx.wait();
        console.log("✅ Permissão concedida com sucesso!");
    } catch (error: any) {
        console.error("❌ Falha ao conceder permissão. Motivo:", error.message);
        return; // Para o script se a aprovação falhar
    }
    // ------------------------------------

    for (const tier of tiersToSetup) {
        console.log(`\n🔹 Configurando Tier '${tier.tierName}' (ID ${tier.tierId})...`);

        const availableIds = treasuryIds[tier.tierName];
        if (!availableIds || availableIds.length < tier.count) {
            console.error(`   ❌ ERRO: Tentando listar ${tier.count} NFTs, mas apenas ${availableIds?.length || 0} estão disponíveis no arquivo para o tier ${tier.tierName}.`);
            continue;
        }

        const tokenIdsToList = availableIds.slice(0, tier.count);
        const priceInWei = ethers.parseEther(tier.priceETH);

        try {
            console.log(`   Listando ${tokenIdsToList.length} NFTs para venda...`);
            const tx = await saleContract.setTier(tier.tierId, priceInWei, tokenIdsToList);
            await tx.wait();
            console.log(`   ✅ Tier ${tier.tierName} configurado com sucesso com ${tokenIdsToList.length} NFTs.`);
        } catch (error: any) {
            console.error(`   ❌ Falha ao configurar o Tier ${tier.tierName}. Motivo: ${error.reason || error.message}`);
        }
    }

    // Opcional: Revogar a permissão por segurança
    console.log("\n3. Revogando a permissão do contrato de venda por segurança...");
    await nftContract.setApprovalForAll(SALE_CONTRACT_ADDRESS, false);
    console.log("✅ Permissão revogada.");

    console.log("\n🎉 Configuração da venda pública concluída!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});