import { HardhatRuntimeEnvironment } from "hardhat/types";
import { BENTOBOX_ADDRESS } from "@sushiswap/core-sdk";
import { DeployFunction } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function ({
  getNamedAccounts,
  network,
  deployments,
  getChainId,
}: HardhatRuntimeEnvironment) {
  const { dev } = await getNamedAccounts();

  const chainId = Number(await getChainId());

  if (!(chainId in BENTOBOX_ADDRESS)) {
    throw Error("No bentobox address");
  }

  const bentoBoxAddress = BENTOBOX_ADDRESS[chainId];

  const { address, transactionHash } = await deployments.deploy("Helper", {
    from: dev,
    args: [bentoBoxAddress],
  });

  console.log(
    `Helper deployed to ${address} on ${network.name}. Tx hash: ${transactionHash}`
  );
};

func.dependencies = [];

func.tags = ["Helper"];

export default func;
