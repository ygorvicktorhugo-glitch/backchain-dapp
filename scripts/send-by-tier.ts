import hre from "hardhat";
import addresses from "../deployment-addresses.json";

// ####################################################################################
// --- OBSERVAÇÕES E GUIA DE CONFIGURAÇÃO ---
//
// 1. OBJETIVO DO SCRIPT:
//    Este script serve para resgatar NFTs que estão no contrato de venda pública (PublicSale)
//    e enviá-los para carteiras de vencedores de sorteios ou outras ações de marketing.
//
// 2. COMO USAR:
//    - Edite a lista `GIVEAWAYS` abaixo.
//    - Para cada "tier" (diamond, platinum, etc.), adicione os endereços das carteiras
//      dos vencedores que você deseja premiar.
//    - O script irá processar cada carteira em ordem, resgatando o PRÓXIMO NFT disponível
//      daquele tier e enviando para o endereço correspondente.
//
// 3. EXEMPLO PRÁTICO:
//    Se você precisa enviar 1 NFT "gold" e 2 NFTs "bronze", a configuração seria:
//
//    const GIVEAWAYS = {
//        diamond: [],
//        platinum: [],
//        gold: [
//            "0xCarteiraDoVencedorGold...", // 1 carteira aqui
//        ],
//        silver: [],
//        bronze: [
//            "0xCarteiraVencedorBronze_A...", // 1ª carteira aqui
//            "0xCarteiraVencedorBronze_B...", // 2ª carteira aqui
//        ],
//    };
//
// 4. PRÉ-REQUISITOS:
//    - Certifique-se de que os NFTs já foram listados para venda usando o script `3_setupSale.ts`.
//    - A carteira que você usa para rodar este script deve ser a dona do contrato `PublicSale`.
//
// ####################################################################################

const GIVEAWAYS = {
    diamond: [
        // Adicione aqui os endereços das carteiras que ganharão NFTs do tier Diamond.
        // Exemplo: "0x123...",
    ],
    platinum: [
        // Adicione aqui os endereços das carteiras que ganharão NFTs do tier Platinum.
    ],
    gold: [
        // Adicione aqui os endereços das carteiras que ganharão NFTs do tier Gold.
    ],
    silver: [
        // Adicione aqui os endereços das carteiras que ganharão NFTs do tier Silver.
    ],
    bronze: [
        // Adicione aqui os endereços das carteiras que ganharão NFTs do tier Bronze.
    ],
};

// ####################################################################################
// --- NÃO É PRECISO EDITAR ABAIXO DESTA LINHA ---
// ####################################################################################

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("🚀 Iniciando envio de NFTs por tier com a conta:", deployer.address);

    const saleContract = await hre.ethers.getContractAt("PublicSale", (addresses as any).publicSale, deployer);
    const nftContract = await hre.ethers.getContractAt("RewardBoosterNFT", addresses.rewardBoosterNFT, deployer);

    const tierNameToId: { [key: string]: number } = {
        diamond: 0,
        platinum: 1,
        gold: 2,
        silver: 3,
        bronze: 4,
    };

    for (const [tierName, recipients] of Object.entries(GIVEAWAYS)) {
        if (recipients.length === 0) {
            continue;
        }

        const tierId = tierNameToId[tierName];
        if (tierId === undefined) {
            console.warn(`\n⚠️ Tier '${tierName}' não reconhecido. Pulando.`);
            continue;
        }

        console.log(`\n----------------------------------------------------`);
        console.log(`🔹 Processando ${recipients.length} NFT(s) do tier '${tierName}'...`);

        for (const recipient of recipients) {
            if (!hre.ethers.isAddress(recipient)) {
                console.error(`   ❌ ERRO: Endereço inválido para o tier '${tierName}': ${recipient}. Pulando.`);
                continue;
            }

            try {
                // Passo 1: Descobrir qual é o próximo NFT disponível para este tier
                console.log(`\n   1. Verificando o próximo NFT disponível para o tier '${tierName}'...`);
                const tierInfo = await saleContract.tiers(tierId);
                const nextTokenIndex = Number(tierInfo.nextTokenIndex);
                const tokenIds = tierInfo.tokenIds;

                if (nextTokenIndex >= tokenIds.length) {
                    console.error(`   ❌ ERRO: Não há mais NFTs disponíveis para venda/resgate no tier '${tierName}'.`);
                    break; // Para de processar este tier pois esgotou
                }

                const tokenIdToRescue = tokenIds[nextTokenIndex];
                console.log(`      -> Próximo NFT a ser resgatado: #${tokenIdToRescue}`);

                // Passo 2: Resgatar o NFT do contrato de venda de volta para sua carteira
                console.log(`   2. Resgatando NFT #${tokenIdToRescue}...`);
                const rescueTx = await saleContract.rescueNFT(tierId, tokenIdToRescue);
                await rescueTx.wait();
                console.log(`   ✅ NFT #${tokenIdToRescue} resgatado com sucesso para sua carteira!`);

                // Passo 3: Enviar o NFT da sua carteira para o destinatário final
                console.log(`   3. Enviando NFT #${tokenIdToRescue} para ${recipient}...`);
                const transferTx = await nftContract.safeTransferFrom(deployer.address, recipient, tokenIdToRescue);
                await transferTx.wait();
                console.log(`   ✅ NFT #${tokenIdToRescue} enviado com sucesso para o vencedor!`);

            } catch (error: any) {
                console.error(`   ❌ FALHA no envio para ${recipient}. Motivo: ${error.reason || error.message}`);
            }
        }
    }
    console.log(`\n----------------------------------------------------`);
    console.log("\n🎉 Processo de envio de prêmios concluído!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});