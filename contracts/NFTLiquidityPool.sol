// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// Interface para interagir com o DelegationManager
interface IDelegationManager {
    function depositRewards(uint256 validatorAmount, uint256 delegatorAmount) external;
}

// NOVO: Interface para consultar o boostBips diretamente do contrato de NFT
interface IRewardBoosterNFT {
    function boostBips(uint256 tokenId) external view returns (uint256);
}

/**
 * @title NFTLiquidityPool
 * @dev Versão final aprimorada. Funciona como um AMM aberto para qualquer RewardBoosterNFT.
 * @notice A trava de 30 dias foi REMOVIDA. Qualquer NFT do tipo RewardBooster pode ser vendido ao pool.
 */
contract NFTLiquidityPool is Ownable, ReentrancyGuard, IERC721Receiver {
    IERC20 public immutable bkcToken;
    // ALTERADO: A interface é usada para consultar o contrato de NFT
    IRewardBoosterNFT public immutable rewardBoosterNFT;
    IDelegationManager public immutable delegationManager;
    address public immutable treasuryWallet;

    struct Pool {
        uint256 tokenBalance;
        uint256 nftCount;
        uint256 k;
        bool isInitialized;
    }

    mapping(uint256 => Pool) public pools;
    // REMOVIDO: O mapeamento de timestamp não é mais necessário
    // mapping(uint256 => uint256) public nftPurchaseTimestamp;
    
    // REMOVIDO: O mapeamento de registro interno não é mais necessário
    // mapping(uint256 => uint256) public tokenIdToBoostBips;

    uint256 public constant SELL_FEE_BIPS = 1200; // 12%
    uint256 public constant FEE_SPLIT_DIVISOR = 3;
    // REMOVIDO: A constante de trava não é mais necessária
    // uint256 public constant LOCK_DURATION = 30 days;

    event PoolCreated(uint256 indexed boostBips);
    event LiquidityAdded(uint256 indexed boostBips, uint256 nftAmount, uint256 bkcAmount);
    event NFTsAddedToPool(uint256 indexed boostBips, uint256 nftAmount);
    event NFTBought(address indexed buyer, uint256 indexed boostBips, uint256 tokenId, uint256 price);
    event NFTSold(address indexed seller, uint256 indexed boostBips, uint256 tokenId, uint256 payout, uint256 feePaid);

    constructor(
        address _bkcToken,
        address _rewardBooster,
        address _delegationManager,
        address _treasury,
        address _initialOwner
    ) Ownable(_initialOwner) {
        bkcToken = IERC20(_bkcToken);
        // ALTERADO: O endereço é convertido para a nova interface
        rewardBoosterNFT = IRewardBoosterNFT(_rewardBooster);
        delegationManager = IDelegationManager(_delegationManager);
        treasuryWallet = _treasury;
    }

    function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // --- Funções de Administração (Owner) ---
    // (createPool, addInitialLiquidity, etc. permanecem as mesmas)

    function createPool(uint256 _boostBips) external onlyOwner {
        require(!pools[_boostBips].isInitialized, "Pool already exists");
        pools[_boostBips].isInitialized = true;
        emit PoolCreated(_boostBips);
    }

    function addInitialLiquidity(uint256 _boostBips, uint256[] calldata _tokenIds, uint256 _bkcAmount) external onlyOwner nonReentrant {
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized, "Pool not initialized");
        require(pool.nftCount == 0, "Liquidity already added");
        require(_tokenIds.length > 0 && _bkcAmount > 0, "Invalid initial liquidity");

        for (uint i = 0; i < _tokenIds.length; i++) {
            IERC721(address(rewardBoosterNFT)).safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }

        require(bkcToken.transferFrom(msg.sender, address(this), _bkcAmount), "BKC transfer failed");

        pool.nftCount = _tokenIds.length;
        pool.tokenBalance = _bkcAmount;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit LiquidityAdded(_boostBips, pool.nftCount, pool.tokenBalance);
    }
    
    function addMoreNFTsToPool(uint256 _boostBips, uint256[] calldata _tokenIds) external onlyOwner nonReentrant {
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized && pool.nftCount > 0, "Pool not initialized with liquidity yet");
        require(_tokenIds.length > 0, "Token IDs array cannot be empty");

        for (uint i = 0; i < _tokenIds.length; i++) {
            IERC721(address(rewardBoosterNFT)).safeTransferFrom(msg.sender, address(this), _tokenIds[i]);
        }

        pool.nftCount += _tokenIds.length;
        pool.k = pool.nftCount * pool.tokenBalance;

        emit NFTsAddedToPool(_boostBips, _tokenIds.length);
    }


    // --- Funções de Negociação ---

    function buyNFT(uint256 _boostBips, uint256 _tokenId) external nonReentrant {
        Pool storage pool = pools[_boostBips];
        require(pool.isInitialized && pool.nftCount > 0, "No NFTs available in this pool");
        // ALTERADO: A verificação de propriedade agora usa a interface IERC721 padrão
        require(IERC721(address(rewardBoosterNFT)).ownerOf(_tokenId) == address(this), "Contract does not own this NFT");
        require(rewardBoosterNFT.boostBips(_tokenId) == _boostBips, "Token does not belong to this tier's pool");

        uint256 price = getBuyPrice(_boostBips);
        require(bkcToken.transferFrom(msg.sender, address(this), price), "BKC transfer failed");
        
        pool.tokenBalance += price;
        pool.nftCount--;
        pool.k = pool.tokenBalance * pool.nftCount;
        
        IERC721(address(rewardBoosterNFT)).safeTransferFrom(address(this), msg.sender, _tokenId);
        emit NFTBought(msg.sender, _boostBips, _tokenId, price);
    }
    
    // FUNÇÃO PRINCIPAL ALTERADA
    function sellNFT(uint256 _tokenId) external nonReentrant {
        require(IERC721(address(rewardBoosterNFT)).ownerOf(_tokenId) == msg.sender, "Not the owner");
        
        // ALTERADO: O tier do NFT é consultado diretamente no contrato do NFT
        uint256 boostBips = rewardBoosterNFT.boostBips(_tokenId);
        require(boostBips > 0, "Not a valid Booster NFT");
        
        Pool storage pool = pools[boostBips];
        require(pool.isInitialized, "Pool does not exist for this tier");
        
        // REMOVIDO: A verificação de trava de 30 dias foi eliminada
        // require(block.timestamp >= nftPurchaseTimestamp[_tokenId] + LOCK_DURATION, "NFT is locked");

        uint256 sellValue = getSellPrice(boostBips);
        require(pool.tokenBalance >= sellValue, "Pool has insufficient liquidity");
        
        uint256 totalFee = (sellValue * SELL_FEE_BIPS) / 10000;
        uint256 feeSplit = totalFee / FEE_SPLIT_DIVISOR;
        uint256 payoutToSeller = sellValue - totalFee;

        // O vendedor transfere o NFT para o pool
        IERC721(address(rewardBoosterNFT)).safeTransferFrom(msg.sender, address(this), _tokenId);

        // O pool distribui os fundos
        if (payoutToSeller > 0) bkcToken.transfer(msg.sender, payoutToSeller);
        if (feeSplit > 0) {
            bkcToken.transfer(treasuryWallet, feeSplit);
            bkcToken.approve(address(delegationManager), feeSplit);
            delegationManager.depositRewards(0, feeSplit);
        }

        // Atualiza o estado do pool
        pool.tokenBalance -= (payoutToSeller + (feeSplit * 2));
        pool.nftCount++;
        pool.k = pool.tokenBalance * pool.nftCount;
        
        emit NFTSold(msg.sender, boostBips, _tokenId, payoutToSeller, totalFee);
    }
    
    // --- Funções de Consulta (View) ---
    // (getBuyPrice e getSellPrice permanecem as mesmas)

    function getBuyPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == 0) return type(uint256).max;
        uint256 newY = pool.k / (pool.nftCount - 1);
        return newY - pool.tokenBalance;
    }

    function getSellPrice(uint256 _boostBips) public view returns (uint256) {
        Pool storage pool = pools[_boostBips];
        if (!pool.isInitialized || pool.nftCount == type(uint256).max) return 0;
        uint256 newY = pool.k / (pool.nftCount + 1);
        return pool.tokenBalance - newY;
    }
}