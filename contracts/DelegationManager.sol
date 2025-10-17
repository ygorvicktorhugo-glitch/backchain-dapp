// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BKCToken.sol";

// --- MUDANÇA: A interface para o RewardBoosterNFT foi removida pois não é mais utilizada on-chain ---

/**
 * @title DelegationManager
 * @dev Gerencia o staking, validadores, delegações e a distribuição de recompensas.
 * @notice ALTERADO: Taxas de delegação e unstake são agora fixas e imutáveis.
 * @notice MELHORIA: Implementado um padrão de acumulador de recompensas para distribuição
 * mais justa e precisa dos prêmios de staking.
 * @notice NOVO: Stake mínimo de validador é dinâmico (0.0003% do Total Supply).
 */
contract DelegationManager is Ownable, ReentrancyGuard {
    BKCToken public immutable bkcToken;
    address public treasuryWallet;
    address public rewardManagerAddress;

    // --- CONSTANTES DE STAKING (FIXAS) ---
    uint256 public constant MIN_LOCK_DURATION = 1 days;
    uint256 public constant MAX_LOCK_DURATION = 3650 days; // 10 anos
    uint256 public constant VALIDATOR_LOCK_DURATION = 1825 days; // 5 anos
    
    uint256 public constant DELEGATION_FEE_BIPS = 50; // 0.5%
    uint256 public constant ONTIME_UNSTAKE_FEE_BIPS = 100; // 1%
    uint256 public constant FORCE_UNSTAKE_PENALTY_BIPS = 5000; // 50%
    uint256 public constant VALIDATOR_FEE_BIPS = 5; // 0.05%

    uint256 public constant MAX_SUPPLY = 200_000_000 * 10**18;
    uint256 public constant TGE_SUPPLY = 40_000_000 * 10**18;
    uint256 public constant MINT_POOL = MAX_SUPPLY - TGE_SUPPLY;
    
    // --- NOVO: Constante para a taxa base de validador (0.0003% = 3 BIPS)
    uint256 public constant DYNAMIC_STAKE_BIPS = 3; 
    // NOVO: 1% de margem de erro por causa da mineração por compra (10100/10000 = 1.01)
    uint256 public constant SAFETY_MARGIN_BIPS = 10100; 

    struct Validator {
        bool isRegistered;
        uint256 selfStakeAmount;
        uint256 selfStakeUnlockTime;
        uint256 totalPStake;
        uint256 totalDelegatedAmount;
    }

    struct Delegation {
        uint256 amount;
        uint256 unlockTime;
        uint256 lockDuration;
        address validator;
    }
    
    mapping(address => bool) public hasPaidRegistrationFee;
    mapping(address => Validator) public validators;
    mapping(address => Delegation[]) public userDelegations;
    address[] public validatorsArray;
    uint256 public totalNetworkPStake;
    mapping(address => uint256) public userTotalPStake;
    
    uint256 public accValidatorRewardPerStake;
    uint256 public accDelegatorRewardPerStake;
    mapping(address => uint256) public validatorRewardDebt;
    mapping(address => uint256) public delegatorRewardDebt;
    // Eventos
    event ValidatorRegistered(address indexed validator, uint256 selfStake);
    event Delegated(address indexed user, address indexed validator, uint256 delegationIndex, uint256 amount, uint256 feePaid);
    event Unstaked(address indexed user, uint256 delegationIndex, uint256 amount, uint256 feePaid);
    event RewardsDeposited(address indexed from, uint256 validatorAmount, uint256 delegatorAmount);
    event ValidatorRewardClaimed(address indexed validator, uint256 amount);
    event DelegatorRewardClaimed(address indexed delegator, uint256 amount);

    constructor(
        address _bkcTokenAddress,
        address _initialOwner,
        address _treasuryWallet
    ) Ownable(_initialOwner) {
        require(_bkcTokenAddress != address(0), "DM: BKCToken address cannot be zero");
        require(_treasuryWallet != address(0), "DM: Treasury wallet address cannot be zero");
        bkcToken = BKCToken(_bkcTokenAddress);
        treasuryWallet = _treasuryWallet;
    }

    // --- Funções de Configuração ---
    function setRewardManager(address _manager) external onlyOwner {
        require(_manager != address(0), "DM: RewardManager cannot be zero address");
        rewardManagerAddress = _manager;
    }
    
    // --- FUNÇÃO DE CONSULTA DINÂMICA (SUBSTITUI A CONSTANTE FIXA) ---
    /**
     * @notice Calcula dinamicamente o stake mínimo e a taxa de registro para validadores.
     * @dev Usa 0.0003% do Total Supply + 1% de margem de erro para compensar a mineração.
     */
    function getMinValidatorStake() public view returns (uint256) {
        // Cálculo: (TotalSupply * DYNAMIC_STAKE_BIPS / 10000) * SAFETY_MARGIN_BIPS / 10000
        uint256 dynamicStake = (bkcToken.totalSupply() * DYNAMIC_STAKE_BIPS) / 10000;
        return (dynamicStake * SAFETY_MARGIN_BIPS) / 10000;
    }

    // --- Funções de Validador ---

    function payRegistrationFee() external nonReentrant {
        uint256 stakeAmount = getMinValidatorStake();
        require(!hasPaidRegistrationFee[msg.sender], "DM: Fee already paid");
        require(bkcToken.transferFrom(msg.sender, treasuryWallet, stakeAmount), "DM: Fee transfer failed");
        hasPaidRegistrationFee[msg.sender] = true;
    }

    function registerValidator(address _validatorAddress) external nonReentrant {
        uint256 stakeAmount = getMinValidatorStake();
        require(msg.sender == _validatorAddress, "DM: Can only register self");
        require(hasPaidRegistrationFee[msg.sender], "DM: Must pay registration fee first");
        require(!validators[_validatorAddress].isRegistered, "DM: Validator already registered");
        require(bkcToken.transferFrom(msg.sender, address(this), stakeAmount), "DM: Stake transfer failed");

        validators[_validatorAddress] = Validator({
            isRegistered: true,
            selfStakeAmount: stakeAmount,
            selfStakeUnlockTime: block.timestamp + VALIDATOR_LOCK_DURATION,
            totalPStake: _calculatePStake(stakeAmount, VALIDATOR_LOCK_DURATION),
            totalDelegatedAmount: 0
        });
        validatorsArray.push(_validatorAddress);
        
        emit ValidatorRegistered(_validatorAddress, stakeAmount);
    }
    
    // --- Funções de Staking ---
    function delegate(address _validatorAddress, uint256 _totalAmount, uint256 _lockDuration) external nonReentrant {
        _claimDelegatorReward(msg.sender);
        require(validators[_validatorAddress].isRegistered, "DM: Invalid validator");
        require(_totalAmount > 0, "DM: Invalid amount");
        require(_lockDuration >= MIN_LOCK_DURATION && _lockDuration <= MAX_LOCK_DURATION, "DM: Invalid lock duration");
        
        uint256 feeAmount = (_totalAmount * DELEGATION_FEE_BIPS) / 10000;
        uint256 stakeAmount = _totalAmount - feeAmount;
        require(stakeAmount > 0, "DM: Invalid net stake amount");
        require(bkcToken.transferFrom(msg.sender, treasuryWallet, feeAmount), "DM: Failed to pay delegation fee");
        require(bkcToken.transferFrom(msg.sender, address(this), stakeAmount), "DM: Failed to delegate tokens");
        userDelegations[msg.sender].push(Delegation({
            amount: stakeAmount,
            unlockTime: block.timestamp + _lockDuration,
            lockDuration: _lockDuration,
            validator: _validatorAddress
        }));
        uint256 pStake = _calculatePStake(stakeAmount, _lockDuration);
        totalNetworkPStake += pStake;
        validators[_validatorAddress].totalPStake += pStake;
        validators[_validatorAddress].totalDelegatedAmount += stakeAmount;
        userTotalPStake[msg.sender] += pStake;
        delegatorRewardDebt[msg.sender] = userTotalPStake[msg.sender] * accDelegatorRewardPerStake / 1e18;
        
        emit Delegated(msg.sender, _validatorAddress, userDelegations[msg.sender].length - 1, stakeAmount, feeAmount);
    }

    function unstake(uint256 _delegationIndex) external nonReentrant {
        _claimDelegatorReward(msg.sender);
        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(block.timestamp >= d.unlockTime, "DM: Lock period not over");
        
        uint256 pStakeToRemove = _calculatePStake(d.amount, d.lockDuration);
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= d.amount;
        userTotalPStake[msg.sender] -= pStakeToRemove;
        
        uint256 feeAmount = (d.amount * ONTIME_UNSTAKE_FEE_BIPS) / 10000;
        uint256 amountToUser = d.amount - feeAmount;
        if (feeAmount > 0) {
            require(bkcToken.transfer(treasuryWallet, feeAmount), "DM: Failed to transfer unstake fee");
        }
        
        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();
        
        require(bkcToken.transfer(msg.sender, amountToUser), "DM: Failed to transfer tokens back");
        delegatorRewardDebt[msg.sender] = userTotalPStake[msg.sender] * accDelegatorRewardPerStake / 1e18;

        emit Unstaked(msg.sender, _delegationIndex, amountToUser, feeAmount);
    }
    
    function forceUnstake(uint256 _delegationIndex) external nonReentrant {
        _claimDelegatorReward(msg.sender);
        Delegation[] storage delegationsOfUser = userDelegations[msg.sender];
        require(_delegationIndex < delegationsOfUser.length, "DM: Invalid index");
        
        Delegation storage d = delegationsOfUser[_delegationIndex];
        require(block.timestamp < d.unlockTime, "DM: Delegation is already unlocked, use regular unstake");

        uint256 originalAmount = d.amount;
        uint256 penaltyAmount = (originalAmount * FORCE_UNSTAKE_PENALTY_BIPS) / 10000;
        uint256 amountToUser = originalAmount - penaltyAmount;
        
        uint256 pStakeToRemove = _calculatePStake(originalAmount, d.lockDuration);
        totalNetworkPStake -= pStakeToRemove;
        validators[d.validator].totalPStake -= pStakeToRemove;
        validators[d.validator].totalDelegatedAmount -= originalAmount;
        userTotalPStake[msg.sender] -= pStakeToRemove;
        if (penaltyAmount > 0) {
            require(bkcToken.transfer(treasuryWallet, penaltyAmount), "DM: Failed to send penalty to treasury");
        }
        
        require(bkcToken.transfer(msg.sender, amountToUser), "DM: Failed to return tokens to user");
        if (delegationsOfUser.length > 1 && _delegationIndex != delegationsOfUser.length - 1) {
            delegationsOfUser[_delegationIndex] = delegationsOfUser[delegationsOfUser.length - 1];
        }
        delegationsOfUser.pop();
        
        delegatorRewardDebt[msg.sender] = userTotalPStake[msg.sender] * accDelegatorRewardPerStake / 1e18;
        emit Unstaked(msg.sender, _delegationIndex, amountToUser, penaltyAmount);
    }
    
    // --- Funções de Recompensa ---

    function depositRewards(uint256 _validatorAmount, uint256 _delegatorAmount) external nonReentrant {
        if (_validatorAmount > 0 && totalNetworkPStake > 0) {
            // A ser implementado se validadores tiverem um pool separado
        }
        if (_delegatorAmount > 0 && totalNetworkPStake > 0) {
          
            accDelegatorRewardPerStake += (_delegatorAmount * 1e18) / totalNetworkPStake;
        }
        
        emit RewardsDeposited(msg.sender, _validatorAmount, _delegatorAmount);
    }

    function claimDelegatorReward() external nonReentrant {
        _claimDelegatorReward(msg.sender);
    }
    
    function _claimDelegatorReward(address _user) internal {
        uint256 pending = pendingDelegatorRewards(_user);
        if (pending > 0) {
            delegatorRewardDebt[_user] = userTotalPStake[_user] * accDelegatorRewardPerStake / 1e18;
            require(bkcToken.transfer(_user, pending), "DM: Failed to transfer delegator rewards");
            emit DelegatorRewardClaimed(_user, pending);
        }
    }
    
    // --- Funções de Consulta (View) ---
    
    function pendingDelegatorRewards(address _user) public view returns (uint256) {
        return (userTotalPStake[_user] * accDelegatorRewardPerStake / 1e18) - delegatorRewardDebt[_user];
    }
    
    function _calculatePStake(uint256 _amount, uint256 _lockDuration) internal pure returns (uint256) {
        uint256 amountInEther = _amount / 1e18;
        return (amountInEther * (_lockDuration / 1 days));
    }
    
    function getDelegationsOf(address _user) external view returns (Delegation[] memory) {
        return userDelegations[_user];
    }

    function getAllValidators() external view returns (address[] memory) {
        return validatorsArray;
    }
}