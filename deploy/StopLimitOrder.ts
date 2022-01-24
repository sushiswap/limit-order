import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BENTOBOX_ADDRESS } from "@sushiswap/core-sdk";
import { DeployFunction } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function ({
  getNamedAccounts,
  network,
  ethers,
  deployments,
  getChainId,
}: HardhatRuntimeEnvironment) {
  const { deployer, dev } = await getNamedAccounts();

  const chainId = Number(await getChainId());

  const fee = 100; // 0.1% fee for open orders

  if (!(chainId in BENTOBOX_ADDRESS)) {
    throw Error("No bentobox address");
  }

  const bentoBoxAddress = BENTOBOX_ADDRESS[chainId];

  console.log(
    "Account balance:",
    (await ethers.provider.getBalance(deployer)).toString()
  );

  const { address, transactionHash } = await deployments.deploy(
    "StopLimitOrder",
    {
      from: deployer,
      args: [fee, bentoBoxAddress],
    }
  );

  //   const stopLimitOrder = await ethers.getContract<StopLimitOrder>("StopLimitOrder");

  //   const owner = await stopLimitOrder.owner();

  //   if (owner !== dev) {
  //     await stopLimitOrder.transferOwnership(dev, true, false);
  //   }

  console.log(
    `StopLimitOrder deployed to ${address} on ${network.name}. Tx hash: ${transactionHash}`
  );
};

func.dependencies = [];

func.tags = ["StopLimitOrder"];

export default func;
