import { StopLimitOrder } from '../typechain/StopLimitOrder';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export default async (hre: HardhatRuntimeEnvironment) => {

  const { deployer } = await hre.getNamedAccounts();

  const fee = 100; // 0.1% fee for open orders
  const bentoBoxAddress = getBentoBox(hre.network.name);
  const factory = getSushiFactory(hre.network.name);
  const pairCodeHash = "0xe18a34eb0e04b04f7a0ac29a6e80748dca96319b42c54d679cb821dca90c6303";

  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer)).toString());

  const deployedStopLimitOrder = await hre.deployments.deploy("StopLimitOrder", {
    from: deployer,
    args: [fee, bentoBoxAddress],
  });

  const stopLimitOrder = new hre.ethers.Contract(deployedStopLimitOrder.address, deployedStopLimitOrder.abi, await hre.ethers.getSigner(deployer)) as StopLimitOrder;

  const deployedReceiver = await hre.deployments.deploy("SushiSwapLimitOrderReceiver", {
    from: deployer,
    args: [factory, bentoBoxAddress, pairCodeHash]
  });

  await stopLimitOrder.whiteListReceiver(deployedReceiver.address);

  const owner = await stopLimitOrder.owner();

  if (owner !== process.env.NEW_OWNER) await stopLimitOrder.transferOwnership(process.env.NEW_OWNER, true, false);

  console.log(`LimitOrder deployed to ${deployedStopLimitOrder.address} on ${hre.network.name}. Tx hash: ${deployedStopLimitOrder.transactionHash}`);
  console.log(`Receiver deployed to ${deployedReceiver.address} on ${hre.network.name}. Tx hash: ${deployedReceiver.transactionHash}`);

};


function getBentoBox(network: string) {

  if (network === 'polygon') {
    return "0x0319000133d3AdA02600f0875d2cf03D442C3367";
  } else {
    throw new Error(`Couldn't find BentoBox address for network: ${network}`);
  }

}

function getSushiFactory(network: string) {

  if (network === 'polygon') {
    return "0xc35DADB65012eC5796536bD9864eD8773aBc74C4";
  } else {
    throw new Error(`Couldn't find Sushi Factory address for network: ${network}`);
  }

}