import { ethers } from "hardhat";
import { expect, assert } from "chai";
import { advanceBlockTo, advanceBlock, prepare, deploy, getBigNumber, ADDRESS_ZERO, createSLP, getSignedLimitApprovalData, getSushiLimitReceiverData, getLimitApprovalDigest } from "../test/utilities"
import { BigNumber } from "@ethersproject/bignumber";
import { describe } from "mocha";

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


    await this.axa.transfer(this.carol.address, getBigNumber(10))

    await this.axa.approve(this.bentoBox.address, getBigNumber(10))

    await this.bentoBox.deposit(this.axa.address, this.alice.address, this.carol.address, getBigNumber(10), 0)

    await this.bentoBox.connect(this.carol).setMasterContractApproval(this.carol.address, this.stopLimit.address, true, 0, BYTES_ZERO, BYTES_ZERO)

    this.oracleData = await this.oracleMock.getDataParameter()

  })

  it("Should allow the execution of a stopLimit through SushiSwap", async function () {
    const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
    const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
    
    const orderArg = [...order, ...[getBigNumber(9), v,r,s]]

    const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

    await this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)
  });

  describe('Fill Order', async function () {

    it('Should revert when receiver is not whitelisted', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.bob.address, data))
      .to.be.revertedWith(
        "LimitOrder: not whitelisted"
      )
    })

    it('Should revert when stop price not reached', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(2), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)
  
      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "Stop price not reached"
      )
    })

    it('Should revert when order is cancelled', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order, this.carol.provider._network.chainId)

      await expect(this.stopLimit.connect(this.carol).cancelOrder(digest))
      .to.emit(this.stopLimit, 'LogOrderCancelled')
      .withArgs(this.carol.address, digest)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "LimitOrder: Cancelled"
      )
    })

    it('Should revert when order is expired', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 1616937263, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "order-expired"
      )
    })
    
    it('Should revert when order is not by maker', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.bobPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)
  
      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "Limit: not maker"
      )
    })

    it('Should revert when order is filled over 100%', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "Order: don't go over 100%"
      )
    })

    it('Should allow execution of stopLimit through SushiSwap', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)
  
      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
    })

  })

  describe('Order Cancellation', async function () {
    it('Should cancel order', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order, this.carol.provider._network.chainId)

      await expect(this.stopLimit.connect(this.carol).cancelOrder(digest))
      .to.emit(this.stopLimit, 'LogOrderCancelled')
      .withArgs(this.carol.address, digest)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "LimitOrder: Cancelled"
      )
    })
  })

  describe('Set Fees', async function () {
    it('Should revert as caller is not owner', async function () {
      await expect(this.stopLimit.connect(this.bob).setFees(this.bob.address, getBigNumber(1)))
      .to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it('Should set the feeTo and externalOrderFee', async function () {
      await expect(this.stopLimit.setFees(this.bob.address, getBigNumber(1)))
      .to.emit(this.stopLimit, "LogSetFees")
      .withArgs(this.bob.address, getBigNumber(1).toString())
      assert.equal(await this.stopLimit.feeTo(), this.bob.address, "feeTo verified")
      assert.equal((await this.stopLimit.externalOrderFee()).toString(), getBigNumber(1).toString(), "externalOrderFee verified")
    })
  })

  describe('Set Whitelist Receiver', async function () {
    it('Should revert as caller is not owner', async function () {
      await expect(this.stopLimit.connect(this.bob).whiteListReceiver(this.bob.address))
      .to.be.revertedWith(
        "Ownable: caller is not the owner"
      )
    })

    it('Should whitelist the receiver', async function () {
      await expect(this.stopLimit.whiteListReceiver(this.bob.address))
      .to.emit(this.stopLimit, "LogWhiteListReceiver")
      .withArgs(this.bob.address)
    })
  })

  // describe('Swipe Fees', async function ()  {
  //   it('Should swipe fees', async function () {
  //     await expect(this.stopLimit.swipeFees(this.bara.address))
  //     .to.emit(this.stopLimit, 'LogFeesCollected')
  //   })
  // })

  describe('Fill Order Open', async function () {
    it('Fill Open Order', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const {v,r,s} = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      
      const orderArg = [...order, ...[getBigNumber(9), v,r,s]]
  
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)
  
      // await expect(this.stopLimit.fillOrderOpen(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      console.log(await this.bentoBox.balanceOf(this.bara.address, this.stopLimit.address))
      console.log(await this.bentoBox.balanceOf(this.axa.address, this.stopLimit.address))

      // console.log((await this.bara.balanceOf(this.stopLimit.address)).toString())
      // console.log((await this.axa.balanceOf(this.stopLimit.address)).toString())

    })
  })
  
});
