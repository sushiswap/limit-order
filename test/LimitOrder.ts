import { ethers } from "hardhat";
import { expect, assert } from "chai";
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO, createSLP, getSignedLimitApprovalData, getSushiLimitReceiverData, getLimitApprovalDigest } from "../test/utilities"

const BYTES_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000"
describe("LimitOrder", function () {

  before(async function () {
    await prepare(this, ['BentoBoxMock', 'SushiSwapFactoryMock', 'SushiSwapPairMock', 'WETH9Mock', 'StopLimitOrder', 'SushiSwapLimitOrderReceiver', 'ERC20Mock', 'OracleMock'])
    await deploy(this, [
      ["weth", this.WETH9Mock]
    ])
  })

  beforeEach(async function () {

    await deploy(this, [
      ["bentoBox", this.BentoBoxMock, [this.weth.address]],
      ["factory", this.SushiSwapFactoryMock],
      ["axa", this.ERC20Mock, [getBigNumber(1000)]],
      ["bara", this.ERC20Mock, [getBigNumber(1000)]],
      ["ceta", this.ERC20Mock, [getBigNumber(1000)]],
      ["oracleMock", this.OracleMock, [getBigNumber(1)]],
    ])

    const pairCodeHash = await this.factory.pairCodeHash()

    await deploy(this, [
      ["stopLimit", this.StopLimitOrder, ["100000", this.bentoBox.address]],
      ["limitReceiver", this.SushiSwapLimitOrderReceiver, [this.factory.address, this.bentoBox.address, pairCodeHash]],
    ])

    await this.stopLimit.whiteListReceiver(this.limitReceiver.address)

    await this.bentoBox.whitelistMasterContract(this.stopLimit.address, true)

    await createSLP(this, "axaBara", this.axa, this.bara, getBigNumber(100))

    await this.axa.approve(this.bentoBox.address, getBigNumber(10))

    await this.bentoBox.deposit(this.axa.address, this.alice.address, this.carol.address, getBigNumber(10), 0)

    await this.bentoBox.connect(this.carol).setMasterContractApproval(this.carol.address, this.stopLimit.address, true, 0, BYTES_ZERO, BYTES_ZERO)

    this.oracleData = await this.oracleMock.getDataParameter()

  })

  it("Should allow the execution of a stopLimit through SushiSwap", async function () {
    expect(await this.bentoBox.balanceOf(this.bara.address, this.bob.address)).to.be.equal(0)

    const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
    const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
    
    const orderArg = [...order, ...[getBigNumber(9), v,r,s]]

    const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.dev.address)

    let digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

    await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)).to.emit(this.stopLimit, "LogFillOrder")
    .withArgs(this.carol.address, digest, this.limitReceiver.address, getBigNumber(9))

    expect(await this.bentoBox.toAmount(this.bara.address, await this.bentoBox.balanceOf(this.bara.address, this.bob.address), false)).to.be.equal(getBigNumber(8))

    expect(await this.bentoBox.balanceOf(this.bara.address, this.dev.address)).to.be.equal("234149743514448533")
  });
});
