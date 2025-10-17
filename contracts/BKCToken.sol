// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BKCToken
 * @dev Contrato do token principal do ecossistema Backchain.
 * @notice ALTERADO: A taxa sobre transferências P2P foi REMOVIDA para garantir 
 * máxima compatibilidade com o ecossistema DeFi.
 */
contract BKCToken is ERC20, Ownable {
    // --- Constantes ---
    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;

    // --- Endereços do Sistema ---
    // Mantidos para referência, mas não são mais usados na lógica de transferência.
    address public treasuryWallet;
    address public delegationManagerAddress;
    address public rewardManagerAddress;

    // --- Eventos ---
    event TreasuryWalletSet(address indexed treasury);
    event DelegationManagerSet(address indexed manager);
    event RewardManagerSet(address indexed manager);

    constructor(address _initialOwner) ERC20("Backcoin", "BKC") Ownable(_initialOwner) {
        require(_initialOwner != address(0), "BKC: Owner cannot be zero address");
        _mint(_initialOwner, TGE_SUPPLY);
    }

    // --- Funções de Configuração (Owner) ---

    function setTreasuryWallet(address _treasury) external onlyOwner {
        require(_treasury != address(0), "BKC: Treasury cannot be zero address");
        treasuryWallet = _treasury;
        emit TreasuryWalletSet(_treasury);
    }

    function setDelegationManager(address _manager) external onlyOwner {
        require(_manager != address(0), "BKC: Manager cannot be zero address");
        delegationManagerAddress = _manager;
        emit DelegationManagerSet(_manager);
    }

    function setRewardManager(address _manager) external onlyOwner {
        require(_manager != address(0), "BKC: RewardManager cannot be zero address");
        rewardManagerAddress = _manager;
        emit RewardManagerSet(_manager);
    }

    // --- Lógica Central de Transferência ---

    /**
     * @dev Sobrescreve a função _update do ERC20.
     * @notice A lógica de taxa foi removida. Esta é agora uma transferência ERC20 padrão.
     */
    function _update(address from, address to, uint256 amount) internal virtual override {
        // A lógica de taxa foi removida. Executa uma transferência padrão.
        super._update(from, to, amount);
    }
    
    // --- Função de Mint ---

    /**
     * @dev Permite que o owner (RewardManager) crie novos tokens.
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "BKC: Exceeds max supply");
        _mint(to, amount);
    }
}