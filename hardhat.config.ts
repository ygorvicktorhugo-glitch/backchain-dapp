import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// --- Carrega as variáveis de ambiente do arquivo .env ---
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

// --- Verificação de Segurança ---
if (SEPOLIA_PRIVATE_KEY === "") {
  console.warn("⚠️  Atenção: A chave privada da Sepolia (SEPOLIA_PRIVATE_KEY) não foi encontrada no arquivo .env.");
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: SEPOLIA_PRIVATE_KEY !== "" ? [SEPOLIA_PRIVATE_KEY] : [],
      
      // +++ CORREÇÃO: Define o preço do gás de forma compatível com a sua versão +++
      // "auto" tentará estimar um bom preço. Se falhar, aumentaremos para um valor fixo.
      gasPrice: "auto", 
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY
  },
  sourcify: {
    enabled: true
  }
};

export default config;