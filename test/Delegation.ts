import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Signer } from "ethers";
import { DelegationManager, BKCToken, RewardManager } from "../typechain-types"; // Adicionando RewardManager

describe("DelegationManager", function () {
  let bkcToken: BKCToken;
  let rewardManager: RewardManager; // Adicionando variável para o RewardManager
  let delegationManager: DelegationManager;
  let owner: Signer, validator1: Signer, user1: Signer;

  beforeEach(async function () {
    [owner, validator1, user1] = await ethers.getSigners();

    const treasuryWalletAddress = "0xD7E622124B78A28C4c928B271FC9423285804f98";

    // 1. Deploy do BKCToken
    const BKCTokenFactory = await ethers.getContractFactory("BKCToken");
    bkcToken = await BKCTokenFactory.deploy(owner);
    await bkcToken.waitForDeployment();
    
    // 2. Deploy do RewardManager (passo que provavelmente estava faltando)
    const RewardManagerFactory = await ethers.getContractFactory("RewardManager");
    // Assumindo que o RewardManager precisa do endereço do token no construtor
    rewardManager = await RewardManagerFactory.deploy(await bkcToken.getAddress()); 
    await rewardManager.waitForDeployment();
    
    // 3. Deploy do DelegationManager com TODOS os argumentos necessários
    const DelegationManagerFactory = await ethers.getContractFactory("DelegationManager");
    delegationManager = await DelegationManagerFactory.deploy(
      await bkcToken.getAddress(),
      await rewardManager.getAddress(), // O segundo argumento
      treasuryWalletAddress             // O terceiro argumento
    );
    await delegationManager.waitForDeployment();

    // Setup para registro do validador
    const feeAndStakeAmount = await delegationManager.getDynamicValidatorFeeAndStake();
    const totalRequiredAmount = feeAndStakeAmount * 2n;

    await bkcToken.connect(owner).transfer(await validator1.getAddress(), totalRequiredAmount);
    await bkcToken.connect(validator1).approve(await delegationManager.getAddress(), totalRequiredAmount);
    await delegationManager.connect(validator1).payRegistrationFee();
    await delegationManager.connect(validator1).registerValidator(await validator1.getAddress());
  });

  it("Should allow a user to delegate, and then unstake after the lock period", async function () {
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const delegateAmount = ethers.parseEther("5000");
    const initialUserBalance = ethers.parseEther("10000");

    await bkcToken.connect(owner).transfer(await user1.getAddress(), initialUserBalance);
    await bkcToken.connect(user1).approve(await delegationManager.getAddress(), delegateAmount);

    await delegationManager.connect(user1).delegate(
      await validator1.getAddress(),
      delegateAmount,
      thirtyDaysInSeconds
    );
    
    const validatorData = await delegationManager.validators(await validator1.getAddress());
    expect(validatorData.totalDelegatedAmount).to.equal(delegateAmount);

    await network.provider.send("evm_increaseTime", [thirtyDaysInSeconds + 60]);
    await network.provider.send("evm_mine");

    const delegationIndex = 0;
    await delegationManager.connect(user1).unstake(delegationIndex);

    const finalBalance = await bkcToken.balanceOf(await user1.getAddress());
    expect(finalBalance).to.equal(initialUserBalance);
  });
});