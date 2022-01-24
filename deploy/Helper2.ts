import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  BENTOBOX_ADDRESS,
  FACTORY_ADDRESS,
  INIT_CODE_HASH,
} from "@sushiswap/core-sdk";
import { DeployFunction } from "hardhat-deploy/dist/types";

const func: DeployFunction = async function ({
  getNamedAccounts,
  network,
  deployments,
  getChainId,
  ethers: { getContract },
}: HardhatRuntimeEnvironment) {
  const { dev } = await getNamedAccounts();

  const chainId = Number(await getChainId());

  if (!(chainId in FACTORY_ADDRESS)) {
    throw Error("No factory address");
  }

  if (!(chainId in BENTOBOX_ADDRESS)) {
    throw Error("No bentobox address");
  }

  if (!(chainId in INIT_CODE_HASH)) {
    throw Error("No init code hash");
  }

  const bentoBoxAddress = BENTOBOX_ADDRESS[chainId];
  const factory = FACTORY_ADDRESS[chainId];
  const pairCodeHash = INIT_CODE_HASH[chainId];

  const { address: stopLimitOrderAddress } = await getContract(
    "StopLimitOrder"
  );

  const { address, transactionHash } = await deployments.deploy("Helper2", {
    from: dev,
    args: [stopLimitOrderAddress, bentoBoxAddress, factory, pairCodeHash],
  });

  console.log(
    `Helper2 deployed to ${address} on ${network.name}. Tx hash: ${transactionHash}`
  );
};

func.dependencies = ["StopLimitOrder"];

func.tags = ["Helper2"];

export default func;
