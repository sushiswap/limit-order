import { ethers } from "hardhat"
const {
  BigNumber,
  utils: { keccak256, defaultAbiCoder, toUtf8Bytes, solidityPack },
} = require("ethers")

const { ecsign } = require("ethereumjs-util")


export const BASE_TEN = 10
export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

const LIMIT_TYPEHASH = keccak256(
  toUtf8Bytes("LimitOrder(address maker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut,address recipient,uint256 startTime,uint256 endTime,uint256 stopPrice,address oracleAddress,bytes32 oracleData)")
)

function getLimitDomainSeparator(tokenAddress, chainId) {
  return keccak256(
      defaultAbiCoder.encode(
          ["bytes32", "bytes32", "uint256", "address"],
          [keccak256(toUtf8Bytes("EIP712Domain(string name,uint256 chainId,address verifyingContract)")), keccak256(toUtf8Bytes("LimitOrder")), chainId, tokenAddress]
      )
  )
}

export function getSushiLimitReceiverData(path, minimumOut, to) {
  return defaultAbiCoder.encode(
      ["address[]", "uint256", "address"],
      [path, minimumOut, to]
  )
}


export function getLimitApprovalDigest(limitOrder, user, tokenIn, tokenOut, order) {
  let chainId = user.provider._network.chainId;
  const DOMAIN_SEPARATOR = getLimitDomainSeparator(limitOrder.address, chainId)
  const msg = defaultAbiCoder.encode(
      ["bytes32", "address", "address", "address", "uint256", "uint256", "address", "uint256", "uint256", "uint256", "address", "bytes32"],
      [
          LIMIT_TYPEHASH,
          order[0],
          tokenIn,
          tokenOut,
          order[1],
          order[2],
          order[3],
          order[4],
          order[5],
          order[6],
          order[7],
          keccak256(order[8]),
      ]
  )
  
  const pack = solidityPack(["bytes1", "bytes1", "bytes32", "bytes32"], ["0x19", "0x01", DOMAIN_SEPARATOR, keccak256(msg)])
  return keccak256(pack)
}

export function getSignedLimitApprovalData(limitOrder, user, privateKey, tokenIn, tokenOut, order) {
  const digest = getLimitApprovalDigest(limitOrder, user, tokenIn, tokenOut, order)
  const { v, r, s } = ecsign(Buffer.from(digest.slice(2), "hex"), Buffer.from(privateKey.replace("0x", ""), "hex"))
  return { v, r, s }
}

export function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder()
  return abi.encode(types, values)
}

export async function prepare(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract] = await ethers.getContractFactory(contract)
  }
  thisObject.signers = await ethers.getSigners()
  thisObject.alice = thisObject.signers[0]
  thisObject.bob = thisObject.signers[1]
  thisObject.carol = thisObject.signers[2]
  thisObject.dev = thisObject.signers[3]
  thisObject.alicePrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  thisObject.bobPrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  thisObject.carolPrivateKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
}

export async function deploy(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract[0]] = await contract[1].deploy(...(contract[2] || []))
    await thisObject[contract[0]].deployed()
  }
}

export async function createSLP(thisObject, name, tokenA, tokenB, amount) {
  const createPairTx = await thisObject.factory.createPair(tokenA.address, tokenB.address)

  const _pair = (await createPairTx.wait()).events[0].args.pair

  thisObject[name] = await thisObject.SushiSwapPairMock.attach(_pair)

  await tokenA.transfer(thisObject[name].address, amount)
  await tokenB.transfer(thisObject[name].address, amount)

  await thisObject[name].mint(thisObject.alice.address)
}
// Defaults to e18 using amount * 10^18
export function getBigNumber(amount, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(BASE_TEN).pow(decimals))
}

export * from "./time"