// config.js

// --- CONTRACTS SETUP (Endereços implantados em Sepolia - Confirmados pelos logs de 17/10/2025) ---
export const addresses = {
    // Endereços do deploy.ts:
    bkcToken: "0x3d178F42c948646BB5a5eA74DF8F5fE2185bFD95",
    delegationManager: "0x6C4EF8fc2D2dcA25e3eB2AB2F21b9E7E554442bF",
    rewardManager: "0xe5440738D6C7e27c43A3FCECf7cf32eCf55101bA",
    rewardBoosterNFT: "0x5aE62209c1635C150573c318BC8d3B36EecFe177",
    nftBondingCurve: "0x1471D83065A6bC1A849f0d4D362b1a86a023D6FB", // NFTLiquidityPool
    actionsManager: "0xB35ab889f12f05F3c17457055989cd5b8406CE43", // FortuneTiger
    
    // Endereço do deploySale.ts (PublicSale)
    publicSale: "0xbD544F8F954Dd7b82B6d0f406a375F80AAD27793"
};

export const sepoliaRpcUrl = "https://eth-sepolia.g.alchemy.com/v2/GNfs8FTc-lBMgbTvpudoz";
export const ipfsGateway = "https://ipfs.io/ipfs/";
export const sepoliaChainId = 11155111n; // Sepolia Chain ID: 11155111

export const boosterTiers = [
    { name: "Diamond", boostBips: 5000, color: "text-cyan-400", img: "https://ipfs.io/ipfs/bafybeign2k73pq5pdicg2v2jdgumavw6kjmc4nremdenzvq27ngtcusv5i", borderColor: "border-cyan-400/50", glowColor: "bg-cyan-500/10" },
    { name: "Platinum", boostBips: 4000, color: "text-gray-300", img: "https://ipfs.io/ipfs/bafybeiag32gp4wssbjbpxjwxewer64fecrtjryhmnhhevgec74p4ltzrau", borderColor: "border-gray-300/50", glowColor: "bg-gray-400/10" },
    { name: "Gold", boostBips: 3000, color: "text-amber-400", img: "https://ipfs.io/ipfs/bafybeido6ah36xn4rpzkvl5avicjzf225ndborvx726sjzpzbpvoogntem", borderColor: "border-amber-400/50", glowColor: "bg-amber-500/10" },
    { name: "Silver", boostBips: 2000, color: "text-gray-400", img: "https://ipfs.io/ipfs/bafybeiaktaw4op7zrvsiyx2sghphrgm6sej6xw362mxgu326ahljjyu3gu", borderColor: "border-gray-400/50", glowColor: "bg-gray-500/10" },
    { name: "Bronze", boostBips: 1000, color: "text-yellow-600", img: "https://ipfs.io/ipfs/bafybeifkke3zepb4hjutntcv6vor7t2e4k5oseaur54v5zsectcepgseye", borderColor: "border-yellow-600/50", glowColor: "bg-yellow-600/10" },
];

// --- ABIs ---
export const bkcTokenABI = [ 
    "function totalSupply() view returns (uint256)", 
    "function balanceOf(address account) view returns (uint256)", 
    "function approve(address spender, uint256 value) returns (bool)", 
    "function transferFrom(address from, address to, uint256 value) returns (bool)", 
    "function name() view returns (string)", 
    "function symbol() view returns (string)",
    "function allowance(address owner, address spender) view returns (uint256)", 
    "function mint(address to, uint256 amount)"
];

export const delegationManagerABI = [ 
    "function totalNetworkPStake() view returns (uint256)", 
    "function getAllValidators() view returns (address[])", 
    "function validators(address) view returns (bool isRegistered, uint256 selfStakeAmount, uint256 selfStakeUnlockTime, uint256 totalPStake, uint256 totalDelegatedAmount)", 
    "function userTotalPStake(address) view returns (uint256)", 
    "function getDelegationsOf(address _user) view returns (tuple(uint256 amount, uint256 unlockTime, uint256 lockDuration, address validator)[])", 
    "function pendingDelegatorRewards(address _user) public view returns (uint256)", 
    "function DELEGATION_FEE_BIPS() view returns (uint256)", 
    "function VALIDATOR_LOCK_DURATION() view returns (uint256)", 
    "function hasPaidRegistrationFee(address) view returns (bool)", 
    "function getDelegationPStake(address _delegator, uint256 _index) view returns (uint256)", 
    "function MIN_LOCK_DURATION() view returns (uint256)", 
    "function MAX_LOCK_DURATION() view returns (uint256)", 
    "function MINT_POOL() view returns (uint256)", 
    "function TGE_SUPPLY() view returns (uint256)", 
    "function payRegistrationFee()", 
    "function registerValidator(address _validatorAddress)", 
    "function delegate(address _validatorAddress, uint256 _totalAmount, uint256 _lockDuration)", 
    "function unstake(uint256 _delegationIndex)", 
    "function forceUnstake(uint256 _delegationIndex)", 
    "function claimDelegatorReward()",
    "function getMinValidatorStake() view returns (uint256)"
];

export const rewardManagerABI = [ 
    "function balanceOf(address owner) view returns (uint256)", 
    "function vestingPositions(uint256) view returns (uint256 totalAmount, uint256 startTime)", 
    "function VESTING_DURATION() view returns (uint256)", 
    "function tokenURI(uint256 _tokenId) view returns (string)", 
    "function minerRewardsOwed(address) view returns (uint256)", 
    "function INITIAL_PENALTY_BIPS() view returns (uint256)", 
    "function withdraw(uint256 _tokenId)", 
    "function claimMinerRewards()", 
    "function createVestingCertificate(address _recipient, uint256 _grossAmount)" 
];

export const rewardBoosterABI = [ 
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function balanceOf(address owner) view returns (uint256)", 
    "function boostBips(uint256) view returns (uint256)", 
    "function tokenURI(uint256 tokenId) view returns (string)", 
    "function ownerOf(uint256 tokenId) view returns (address)", 
    "function approve(address to, uint256 tokenId)",
    "function getHighestBoost(address user) view returns (uint256)"
];

export const nftBondingCurveABI = [ 
    "function pools(uint256) view returns (uint256 tokenBalance, uint256 nftCount, uint256 k, bool isInitialized)", 
    "function getBuyPrice(uint256 _boostBips) view returns (uint256)", 
    "function getSellPrice(uint256 _boostBips) view returns (uint256)", 
    "function buyNFT(uint256 _boostBips, uint256 _tokenId)", 
    "function sellNFT(uint256 _tokenId)" 
];

export const actionsManagerABI = [
    "function actionCounter() view returns (uint256)",
    "function actions(uint256) view returns (uint256 id, address creator, string description, uint8 actionType, uint8 status, uint256 endTime, uint256 totalPot, uint256 creatorStake, bool isStakeReturned, address beneficiary, uint256 totalCoupons, address winner, uint256 closingBlock, uint256 winningCoupon)",
    "function getMinCreatorStake() view returns (uint256)", 
    "function createAction(uint256 _duration, uint8 _actionType, uint256 _charityStake, string calldata _description)",
    "function participate(uint256 _actionId, uint256 _bkcAmount)",
    "function finalizeAction(uint256 _actionId)",
];