// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BKCToken.sol";
import "./DelegationManager.sol";

/**
 * @title RewardManager (Vesting Certificate NFT + PoP Mining)
 * @dev Gerencia a "Mineração por Compra" e a distribuição de recompensas de mineração.
 * @notice ALTERADO: A lógica de mineração agora se baseia apenas na escassez dinâmica.
 * @notice NOVO: Receptores de certificados de vesting recebem um bônus de 10% sobre o valor minerado,
 * que é adicionado ao seu certificado e travado por 5 anos.
 */
contract RewardManager is ERC721Enumerable, Ownable, ReentrancyGuard {
    BKCToken public immutable bkcToken;
    DelegationManager public delegationManager;
    address public immutable treasuryWallet;
    string private baseURI;

    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;
    uint256 public constant MINT_POOL = MAX_SUPPLY - TGE_SUPPLY;

    uint256 private _tokenIdCounter;
    mapping(address => uint256) public minerRewardsOwed;
    
    uint256 private nextValidatorIndex;

    struct VestingPosition {
        uint256 totalAmount;
        uint256 startTime;
    }
    mapping(uint256 => VestingPosition) public vestingPositions;

    uint256 public constant VESTING_DURATION = 5 * 365 days; // 5 anos
    uint256 public constant INITIAL_PENALTY_BIPS = 5000; // Penalidade de 50%

    event VestingCertificateCreated(uint256 indexed tokenId, address indexed recipient, uint256 netAmount);
    event CertificateWithdrawn(uint256 indexed tokenId, address indexed owner, uint256 amountToOwner, uint256 penaltyAmount);
    event MinerRewardClaimed(address indexed miner, uint256 amount);

    constructor(
        address _bkcTokenAddress,
        address _treasuryWallet,
        address _initialOwner
    ) ERC721("Backchain Vesting Certificate", "BKCV") Ownable(_initialOwner) {
        require(_bkcTokenAddress != address(0) && _treasuryWallet != address(0), "Invalid addresses");
        bkcToken = BKCToken(_bkcTokenAddress);
        treasuryWallet = _treasuryWallet;
    }

    function setDelegationManager(address _delegationManagerAddress) external onlyOwner {
        require(_delegationManagerAddress != address(0), "RM: Address cannot be zero");
        require(address(delegationManager) == address(0), "RM: Already set");
        delegationManager = DelegationManager(_delegationManagerAddress);
    }
    
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        baseURI = newBaseURI;
    }

    function createVestingCertificate(address _recipient, uint256 _grossAmount) external nonReentrant {
        require(address(delegationManager) != address(0), "RM: DelegationManager not set");
        require(_grossAmount > 0, "RM: Amount must be greater than zero");
        require(_recipient != address(0), "RM: Invalid recipient");
        
        // A lógica de taxa de entrada (se houver) permanece a mesma
        uint256 feeAmount = 0;
        uint256 netAmountForVesting = _grossAmount;
        uint256 userPStake = delegationManager.userTotalPStake(msg.sender);
        uint256 totalPStake = delegationManager.totalNetworkPStake();

        if (totalPStake > 0) {
            uint256 userShareBIPS = (userPStake * 10000) / totalPStake;
            if (userShareBIPS < 10) { feeAmount = (_grossAmount * 5) / 100; } 
            else if (userShareBIPS < 100) { feeAmount = (_grossAmount * 2) / 100; }
        } else {
            feeAmount = (_grossAmount * 5) / 100;
        }
        
        if (feeAmount > 0) {
            netAmountForVesting = _grossAmount - feeAmount;
            require(netAmountForVesting > 0, "RM: Amount after fee is zero");
            require(bkcToken.transferFrom(msg.sender, treasuryWallet, feeAmount), "RM: Fee transfer failed");
        }
        
        require(bkcToken.transferFrom(msg.sender, address(this), netAmountForVesting), "RM: Token transfer failed");

        // --- NOVA LÓGICA DE MINERAÇÃO E BÔNUS ---
        uint256 totalMintAmount = _calculateMintAmount(_grossAmount);

        uint256 finalVestingAmount = netAmountForVesting;

        if (totalMintAmount > 0) {
            // 1. Calcular e alocar o bônus de 10% para o receptor
            uint256 recipientRewardAmount = (totalMintAmount * 10) / 100;
            
            // 2. O valor final travado no NFT é a soma do valor do usuário + o bônus
            finalVestingAmount += recipientRewardAmount;

            // 3. Minera o bônus diretamente para este contrato para ser adicionado ao vesting
            if (recipientRewardAmount > 0) {
                bkcToken.mint(address(this), recipientRewardAmount);
            }

            // 4. Seleciona o minerador e distribui o restante das recompensas (90%)
            address selectedMiner = _selectNextValidator();
            require(selectedMiner != address(0), "RM: Could not select a miner");

            uint256 treasuryAmount = (totalMintAmount * 10) / 100;       // 10%
            uint256 minerRewardAmount = (totalMintAmount * 15) / 100;      // 15%
            uint256 delegatorPoolAmount = (totalMintAmount * 65) / 100;    // 65%

            if (treasuryAmount > 0) bkcToken.mint(treasuryWallet, treasuryAmount);
            
            if (minerRewardAmount > 0) {
                minerRewardsOwed[selectedMiner] += minerRewardAmount;
                bkcToken.mint(address(this), minerRewardAmount);
            }
            
            if (delegatorPoolAmount > 0) {
                bkcToken.mint(address(this), delegatorPoolAmount);
                bkcToken.approve(address(delegationManager), delegatorPoolAmount);
                // Envia 100% dos fundos do pool para os delegadores (0 para validadores)
                delegationManager.depositRewards(0, delegatorPoolAmount);
            }
        }
        
        // 5. Cria o NFT com o valor final (valor do usuário + bônus se houver)
        uint256 tokenId = _tokenIdCounter++;
        _safeMint(_recipient, tokenId);
        vestingPositions[tokenId] = VestingPosition({ totalAmount: finalVestingAmount, startTime: block.timestamp });
        emit VestingCertificateCreated(tokenId, _recipient, finalVestingAmount);
    }

    function withdraw(uint256 _tokenId) external nonReentrant {
        require(ownerOf(_tokenId) == msg.sender, "Not the owner");
        VestingPosition storage position = vestingPositions[_tokenId];
        (uint256 amountToOwner, uint256 penaltyAmount) = _calculateWithdrawalAmounts(position);
        delete vestingPositions[_tokenId];
        _burn(_tokenId);
        if (penaltyAmount > 0) require(bkcToken.transfer(treasuryWallet, penaltyAmount));
        if (amountToOwner > 0) require(bkcToken.transfer(msg.sender, amountToOwner));
        emit CertificateWithdrawn(_tokenId, msg.sender, amountToOwner, penaltyAmount);
    }
    
    function claimMinerRewards() external nonReentrant {
        uint256 amountToClaim = minerRewardsOwed[msg.sender];
        require(amountToClaim > 0, "RM: No miner rewards to claim");
        minerRewardsOwed[msg.sender] = 0;
        require(bkcToken.transfer(msg.sender, amountToClaim), "RM: Failed to transfer miner rewards");
        emit MinerRewardClaimed(msg.sender, amountToClaim);
    }

    function _calculateWithdrawalAmounts(VestingPosition memory _pos) internal view returns (uint256, uint256) {
        uint256 elapsedTime = block.timestamp - _pos.startTime;
        if (elapsedTime >= VESTING_DURATION) return (_pos.totalAmount, 0);
        
        // A penalidade é fixa em 50% para retirada antecipada, como discutido.
        uint256 penaltyAmount = (_pos.totalAmount * INITIAL_PENALTY_BIPS) / 10000;
        return (_pos.totalAmount - penaltyAmount, penaltyAmount);
    }

    // --- LÓGICA DE MINERAÇÃO SIMPLIFICADA ---
    function _calculateMintAmount(uint256 _purchaseAmount) internal view returns (uint256) {
        uint256 currentSupply = bkcToken.totalSupply();
        if (currentSupply >= MAX_SUPPLY) { return 0; }

        uint256 currentMinted = currentSupply > TGE_SUPPLY ?
            currentSupply - TGE_SUPPLY : 0;
        uint256 remainingMintable = MINT_POOL - currentMinted;
        if (remainingMintable == 0) { return 0; }

        // Apenas a escassez dinâmica é usada
        uint256 scarcityRate = (remainingMintable * 1e18) / MINT_POOL;
        uint256 finalMintAmount = (_purchaseAmount * scarcityRate) / 1e18;

        // Garante que não ultrapasse o MAX_SUPPLY
        if (currentSupply + finalMintAmount > MAX_SUPPLY) {
            finalMintAmount = MAX_SUPPLY - currentSupply;
        }

        return finalMintAmount;
    }

    function _selectNextValidator() internal returns (address) {
        address[] memory validators = delegationManager.getAllValidators();
        uint256 count = validators.length;
        if (count == 0) return address(0);

        if (nextValidatorIndex >= count) { nextValidatorIndex = 0; }
        address selectedValidator = validators[nextValidatorIndex];
        nextValidatorIndex = (nextValidatorIndex + 1) % count;
        return selectedValidator;
    }
    
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(ownerOf(tokenId) != address(0), "ERC721: invalid token ID");
        return string(abi.encodePacked(baseURI, "vesting_cert.json"));
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }
    
    function supportsInterface(bytes4 interfaceId) public view override(ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}