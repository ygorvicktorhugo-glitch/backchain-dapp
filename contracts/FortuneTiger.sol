// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./BKCToken.sol";
import "./DelegationManager.sol";

/**
 * @title FortuneTiger (ActionManager)
 * @dev Contrato final para Ações Descentralizadas, com taxas fixas e sorteio automatizado.
 * @notice ALTERADO: Em Ações Beneficentes, a recompensa de 4% do criador foi removida e incorporada
 * ao prêmio da causa, que agora é de 92% do total.
 */
contract FortuneTiger is Ownable, ReentrancyGuard {
    BKCToken public immutable bkcToken;
    DelegationManager public immutable delegationManager;
    address public immutable treasuryWallet;

    enum ActionType { Esportiva, Beneficente }
    enum Status { Open, Finalized }

    struct Action {
        uint256 id;
        address creator;
        string description;
        ActionType actionType;
        Status status;
        uint256 endTime;
        uint256 totalPot;
        uint256 creatorStake;
        bool isStakeReturned;
        address beneficiary;
        uint256 totalCoupons;
        address winner;
        uint256 closingBlock;
        uint256 winningCoupon;
    }

    mapping(uint256 => Action) public actions;
    mapping(uint256 => address[]) public couponOwners;
    mapping(uint256 => uint256[]) public couponRanges;

    uint256 public actionCounter;
    uint256 public constant COUPONS_PER_BKC = 1000;
    uint256 public constant DRAW_MAX_OFFSET_BLOCKS = 100;

    // --- TAXAS DE AÇÃO BENEFICENTE (TOTAL 8%) ---
    uint256 public constant BENEFICENT_CAUSE_BIPS = 9200; // ALTERADO: 92% para a Causa
    uint256 public constant BENEFICENT_DELEGATOR_BIPS = 400; // 4% para Delegadores
    uint256 public constant BENEFICENT_TREASURY_BIPS = 400; // 4% para Tesouraria
    uint256 public constant BENEFICENT_CREATOR_BIPS = 0; // ALTERADO: Recompensa do criador é zerada
    
    // --- TAXAS DE AÇÃO ESPORTIVA (TOTAL 12%) ---
    uint256 public constant SPORT_WINNER_BIPS = 8800;
    uint256 public constant SPORT_CREATOR_BIPS = 400;
    uint256 public constant SPORT_DELEGATOR_BIPS = 400;
    uint256 public constant SPORT_TREASURY_BIPS = 400;

    event ActionCreated(uint256 indexed actionId, address indexed creator, ActionType actionType, uint256 endTime, string description);
    event Participation(uint256 indexed actionId, address indexed participant, uint256 bkcAmount, uint256 couponsIssued);
    event ActionFinalized(uint256 indexed actionId, address indexed finalRecipient, uint256 prizeAmount);
    event StakeReturned(uint256 indexed actionId, address indexed creator, uint256 stakeAmount);

    constructor(
        address _bkcTokenAddress,
        address _delegationManagerAddress,
        address _treasuryAddress,
        address _initialOwner
    ) Ownable(_initialOwner) {
        bkcToken = BKCToken(_bkcTokenAddress);
        delegationManager = DelegationManager(_delegationManagerAddress);
        treasuryWallet = _treasuryAddress;
    }

    function getMinCreatorStake() public view returns (uint256) {
        uint256 stake = bkcToken.totalSupply() / 1_000_000;
        return stake > 0 ? stake : 1;
    }

    function createAction(
        uint256 _duration,
        ActionType _actionType,
        uint256 _charityStake,
        string calldata _description
    ) external nonReentrant {
        actionCounter++;
        uint256 newActionId = actionCounter;
        uint256 stakeAmount;
        address beneficiary;
        string memory finalDescription;

        if (_actionType == ActionType.Esportiva) {
            stakeAmount = getMinCreatorStake();
            require(stakeAmount > 0, "Min stake cannot be zero");
            beneficiary = address(0);
            finalDescription = "Sports Lottery Draw";
        } else {
            require(_charityStake > 0, "Charity stake must be > 0");
            stakeAmount = _charityStake;
            beneficiary = msg.sender;
            require(bytes(_description).length > 0 && bytes(_description).length < 500, "Invalid description length");
            finalDescription = _description;
        }
        
        require(bkcToken.transferFrom(msg.sender, address(this), stakeAmount), "Stake transfer failed");

        actions[newActionId] = Action({
            id: newActionId, creator: msg.sender, description: finalDescription, actionType: _actionType,
            status: Status.Open, endTime: block.timestamp + _duration, totalPot: 0, creatorStake: stakeAmount,
            isStakeReturned: false, beneficiary: beneficiary, totalCoupons: 0, winner: address(0),
            closingBlock: 0, winningCoupon: 0
        });

        emit ActionCreated(newActionId, msg.sender, _actionType, actions[newActionId].endTime, finalDescription);
    }

    function participate(uint256 _actionId, uint256 _bkcAmount) external nonReentrant {
        Action storage action = actions[_actionId];
        require(action.status == Status.Open, "Action is not open");
        require(block.timestamp < action.endTime, "Participation time has ended");
        require(_bkcAmount > 0, "Amount must be positive");
        require(bkcToken.transferFrom(msg.sender, address(this), _bkcAmount), "Token transfer failed");
        
        action.totalPot += _bkcAmount;
        uint256 couponsToIssue = 0;
        if (action.actionType == ActionType.Esportiva) {
            couponsToIssue = _bkcAmount * COUPONS_PER_BKC / (10**18);
            require(couponsToIssue > 0, "Amount too small for coupons");
            action.totalCoupons += couponsToIssue;
            couponOwners[_actionId].push(msg.sender);
            couponRanges[_actionId].push(action.totalCoupons);
        }
        emit Participation(_actionId, msg.sender, _bkcAmount, couponsToIssue);
    }
    
    function finalizeAction(uint256 _actionId) external nonReentrant {
        Action storage action = actions[_actionId];
        require(action.status == Status.Open, "Action not open or already finalized");
        require(block.timestamp >= action.endTime, "Action has not ended yet");
        
        uint256 pot = action.totalPot;
        address finalRecipient;
        uint256 prizeAmount;

        if (action.actionType == ActionType.Esportiva) {
            action.closingBlock = block.number;
            uint256 randomSeed = uint256(blockhash(action.closingBlock));
            require(randomSeed != 0, "Closing blockhash not available yet");
            uint256 randomOffset = (randomSeed % DRAW_MAX_OFFSET_BLOCKS) + 1;
            uint256 drawBlock = action.closingBlock + randomOffset;
            bytes32 blockHash = blockhash(drawBlock);
            require(uint256(blockHash) != 0, "Draw blockhash not available yet, try again later");
            
            uint256 winningCouponNumber = (uint256(blockHash) % action.totalCoupons) + 1;
            action.winningCoupon = winningCouponNumber;
            action.winner = _findCouponOwner(_actionId, winningCouponNumber);
            require(action.winner != address(0), "Could not find winner");

            finalRecipient = action.winner;
            prizeAmount = (pot * SPORT_WINNER_BIPS) / 10000;
            _distributeSportFees(pot, action.creator);
        } else {
            finalRecipient = action.beneficiary;
            prizeAmount = (pot * BENEFICENT_CAUSE_BIPS) / 10000;
            _distributeBeneficentFees(pot, action.creator);
        }

        action.status = Status.Finalized;
        _returnCreatorStake(action);
        if (prizeAmount > 0) {
            bkcToken.transfer(finalRecipient, prizeAmount);
        }
        emit ActionFinalized(_actionId, finalRecipient, prizeAmount);
    }
    
    function _distributeBeneficentFees(uint256 _pot, address _creator) internal {
        uint256 delegatorAmount = (_pot * BENEFICENT_DELEGATOR_BIPS) / 10000;
        uint256 treasuryAmount = (_pot * BENEFICENT_TREASURY_BIPS) / 10000;
        uint256 creatorAmount = (_pot * BENEFICENT_CREATOR_BIPS) / 10000; // Será zero
        if (creatorAmount > 0) bkcToken.transfer(_creator, creatorAmount);
        if (delegatorAmount > 0) delegationManager.depositRewards(0, delegatorAmount);
        if (treasuryAmount > 0) bkcToken.transfer(treasuryWallet, treasuryAmount);
    }

    function _distributeSportFees(uint256 _pot, address _creator) internal {
        uint256 creatorAmount = (_pot * SPORT_CREATOR_BIPS) / 10000;
        uint256 delegatorAmount = (_pot * SPORT_DELEGATOR_BIPS) / 10000;
        uint256 treasuryAmount = (_pot * SPORT_TREASURY_BIPS) / 10000;
        if (creatorAmount > 0) bkcToken.transfer(_creator, creatorAmount);
        if (delegatorAmount > 0) delegationManager.depositRewards(0, delegatorAmount);
        if (treasuryAmount > 0) bkcToken.transfer(treasuryWallet, treasuryAmount);
    }
    
    function _returnCreatorStake(Action storage action) internal {
        if (!action.isStakeReturned && action.creatorStake > 0) {
            action.isStakeReturned = true;
            bkcToken.transfer(action.creator, action.creatorStake);
            emit StakeReturned(action.id, action.creator, action.creatorStake);
        }
    }
    
    function _findCouponOwner(uint256 _actionId, uint256 _couponNumber) internal view returns (address) {
        uint256[] memory ranges = couponRanges[_actionId];
        uint256 low = 0;
        uint256 high = ranges.length - 1;
        while (low <= high) {
            uint256 mid = (low + high) / 2;
            uint256 prevRange = (mid == 0) ? 0 : ranges[mid - 1];
            if (_couponNumber > prevRange && _couponNumber <= ranges[mid]) {
                return couponOwners[_actionId][mid];
            } else if (_couponNumber > ranges[mid]) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return address(0);
    }
}