import { expect, assert } from "chai";
import { prepare, deploy, getBigNumber, ADDRESS_ZERO, createSLP, getSignedLimitApprovalData, getSushiLimitReceiverData, getLimitApprovalDigest, getSushiLimitReceiverData2 } from "../test/utilities"
import { describe } from "mocha";

const BYTES_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000"
describe("LimitOrder", function () {

  before(async function () {
    await prepare(this, ['BentoBoxMock', 'SushiSwapFactoryMock', 'SushiSwapPairMock', 'WETH9Mock', 'StopLimitOrder', 'SushiSwapLimitOrderReceiver', 'SushiSwapLimitOrderReceiver2', 'ERC20Mock', 'OracleMock', 'MaliciousSushiSwapLimitOrderReceiver'])
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
      ["oracleMock", this.OracleMock, [getBigNumber(1)]],    ])

    const pairCodeHash = await this.factory.pairCodeHash()

    await deploy(this, [
      ["stopLimit", this.StopLimitOrder, ["10000", this.bentoBox.address]],
      ["limitReceiver", this.SushiSwapLimitOrderReceiver, [this.factory.address, this.bentoBox.address, pairCodeHash]],
      ["limitReceiver2", this.SushiSwapLimitOrderReceiver2, [this.factory.address, this.bentoBox.address, pairCodeHash]],
      ["malLimitReceiver", this.MaliciousSushiSwapLimitOrderReceiver, [this.factory.address, this.bentoBox.address, pairCodeHash]]
    ])

    await this.stopLimit.whiteListReceiver(this.limitReceiver.address);

    await this.stopLimit.whiteListReceiver(this.limitReceiver2.address);

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
    const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

    const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

    const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.dev.address)

    let digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

    await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)).to.emit(this.stopLimit, "LogFillOrder")
      .withArgs(this.carol.address, digest, this.limitReceiver.address, getBigNumber(9))

    expect(await this.bentoBox.toAmount(this.bara.address, await this.bentoBox.balanceOf(this.bara.address, this.bob.address), false)).to.be.equal(getBigNumber(8))
    expect(await this.bentoBox.balanceOf(this.bara.address, this.dev.address)).to.be.equal("234149743514448533")
    assert.equal((await this.stopLimit.orderStatus(digest)).toString(), getBigNumber(9).toString(), "Order status (filled amount) wasn't updated to the correct value")
  });

  describe('Fill Order', async function () {

    it('Should revert when receiver is not whitelisted', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.bob.address, data))
        .to.be.revertedWith(
          "LimitOrder: not whitelisted"
        )
    })

    it('Should revert when stop price not reached', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(2), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
        .to.be.revertedWith(
          "Stop price not reached"
        )
    })

    it('Should execute with Oracel Address 0x0', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(2), ADDRESS_ZERO, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
        .to.emit(this.stopLimit, "LogFillOrder")
        .withArgs(this.carol.address, digest, this.limitReceiver.address, getBigNumber(9))

    })

    it('Should take profit in tokenIn', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(2), ADDRESS_ZERO, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

      const data = getSushiLimitReceiverData2([this.axa.address, this.bara.address], getBigNumber(9), this.bob.address, true)

      const oldBalance = await this.bentoBox.balanceOf(this.axa.address, this.bob.address);

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver2.address, data))
        .to.emit(this.stopLimit, "LogFillOrder")
        .withArgs(this.carol.address, digest, this.limitReceiver2.address, getBigNumber(9));

      expect(oldBalance.lt(await this.bentoBox.balanceOf(this.axa.address, this.bob.address))).to.be.eq(true, "Relayer did not take profit in token in")
    })

    it('Should revert when order is cancelled', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

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
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
        .to.be.revertedWith(
          "order-expired"
        )
    })

    it('Should revert when order is not by maker', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.bobPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
        .to.be.revertedWith(
          "Limit: not maker"
        )
    })

    it('Should revert when order is filled over 100%', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)

      await expect(this.stopLimit.fillOrder(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
      .to.be.revertedWith(
        "UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT"
      )
    })

  })

  describe('Order Cancellation', async function () {
    it('Should cancel order', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)

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

  describe('Swipe Fees', async function () {

    it('Should revert with underflow', async function () {
      await expect(this.stopLimit.swipeFees(this.bara.address))
        .to.be.revertedWith(
          "BoringMath: Underflow"
        )
    })

    it('Should swipe fees', async function () {
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await this.stopLimit.fillOrderOpen(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data)

      const feeAmount = (await this.bentoBox.balanceOf(this.bara.address, this.stopLimit.address)).sub(1);

      await expect(this.stopLimit.swipeFees(this.bara.address))
        .to.emit(this.stopLimit, 'LogFeesCollected')

      assert.equal(await this.bentoBox.balanceOf(this.bara.address, this.stopLimit.address), 1, "Fees weren't swiped");
      assert.equal(feeAmount.toString(), (await this.bentoBox.balanceOf(this.bara.address, await this.stopLimit.feeTo())).toString(), "Fees weren't received");
    })
  })

  describe('Swipe', async function () {
    it('Should swipe balance', async function () {
      await this.axa.transfer(this.stopLimit.address, 1);
      await this.stopLimit.swipe(this.axa.address);
      assert.equal(0, await this.axa.balanceOf(this.stopLimit.address), "Tokens weren't swiped weren't received");
    })
  })

  describe('Fill Order Open', async function () {

    it('Should revert if the contract does not receive the required fee', async function () {
      expect(await this.bentoBox.balanceOf(this.bara.address, this.bob.address)).to.be.equal(0)

      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order)
      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.fillOrderOpen(orderArg, this.axa.address, this.bara.address, this.malLimitReceiver.address, data))
        .to.be.revertedWith(
          "Limit: not enough"
        )
    })

    it('Should fill an open order', async function () {
      const inAmount = getBigNumber(9);
      const outAmount = getBigNumber(8);
      const fillAmount = getBigNumber(9);
      const fee = await this.stopLimit.externalOrderFee();
      const feeDivisor = await this.stopLimit.FEE_DIVISOR();
      const minFeeAmount = fillAmount.mul(outAmount).div(inAmount).mul(fee).div(feeDivisor);

      const order = [this.carol.address, inAmount, outAmount, this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData];

      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order);

      const orderArg = [...order, ...[fillAmount, v, r, s]];

      const digest = getLimitApprovalDigest(this.stopLimit, this.carol, this.axa.address, this.bara.address, order);

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address);

      await expect(this.stopLimit.fillOrderOpen(orderArg, this.axa.address, this.bara.address, this.limitReceiver.address, data))
        .to.emit(this.stopLimit, "LogFillOrder").withArgs(this.carol.address, digest, this.limitReceiver.address, getBigNumber(9));

      const bentoBalance = await this.bentoBox.balanceOf(this.bara.address, this.stopLimit.address);

      assert.isAtLeast(bentoBalance, minFeeAmount, "Not enough fees were received");
    })
  })

  describe('Batch Fill Order', async function () {
    it('Should revert when receiver is not whitelisted', async function () {
      await this.axa.approve(this.bentoBox.address, getBigNumber(20))
      await this.bentoBox.deposit(this.axa.address, this.alice.address, this.carol.address, getBigNumber(20), 0)
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const order2 = [this.carol.address, getBigNumber(9), getBigNumber(7), this.bob.address, 0, 4078384251, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      const { v: v2, r: r2, s: s2 } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order2)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const orderArg2 = [...order2, ...[getBigNumber(9), v2, r2, s2]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await expect(this.stopLimit.batchFillOrder([orderArg, orderArg2], this.axa.address, this.bara.address, this.bob.address, data))
        .to.be.revertedWith(
          "LimitOrder: not whitelisted"
        )
    })

    it('Should execute Batch fill order', async function () {
      await this.axa.approve(this.bentoBox.address, getBigNumber(20))
      await this.bentoBox.deposit(this.axa.address, this.alice.address, this.carol.address, getBigNumber(20), 0)
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const order2 = [this.carol.address, getBigNumber(9), getBigNumber(7), this.bob.address, 0, 4078384251, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      const { v: v2, r: r2, s: s2 } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order2)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const orderArg2 = [...order2, ...[getBigNumber(9), v2, r2, s2]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await this.stopLimit.batchFillOrder([orderArg, orderArg2], this.axa.address, this.bara.address, this.limitReceiver.address, data)
    })
  })

  describe('Batch Fill Order Open', async function () {

    it('Should execute Batch fill order', async function () {
      await this.axa.approve(this.bentoBox.address, getBigNumber(20))
      await this.bentoBox.deposit(this.axa.address, this.alice.address, this.carol.address, getBigNumber(20), 0)
      const order = [this.carol.address, getBigNumber(9), getBigNumber(8), this.bob.address, 0, 4078384250, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const order2 = [this.carol.address, getBigNumber(9), getBigNumber(7), this.bob.address, 0, 4078384251, getBigNumber(1, 17), this.oracleMock.address, this.oracleData]
      const { v, r, s } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order)
      const { v: v2, r: r2, s: s2 } = getSignedLimitApprovalData(this.stopLimit, this.carol, this.carolPrivateKey, this.axa.address, this.bara.address, order2)

      const orderArg = [...order, ...[getBigNumber(9), v, r, s]]
      const orderArg2 = [...order2, ...[getBigNumber(9), v2, r2, s2]]

      const data = getSushiLimitReceiverData([this.axa.address, this.bara.address], getBigNumber(1), this.bob.address)

      await this.stopLimit.batchFillOrderOpen([orderArg, orderArg2], this.axa.address, this.bara.address, this.limitReceiver.address, data)
    })
  })
});
