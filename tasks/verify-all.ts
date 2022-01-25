import {
  BENTOBOX_ADDRESS,
  FACTORY_ADDRESS,
  INIT_CODE_HASH,
} from "@sushiswap/core-sdk";
import { task } from "hardhat/config";
import { NomicLabsHardhatPluginError } from "hardhat/plugins";

task(
  "verify-all",
  "Verify all contracts",
  async (_, { ethers, tenderly, run, getChainId }) => {
    const chainId = parseInt(await getChainId());

    const helper = await ethers.getContract("Helper");
    const helper2 = await ethers.getContract("Helper2");
    const stopLimitOrder = await ethers.getContract("StopLimitOrder");
    const sushiSwapLimitOrderReceiver = await ethers.getContract(
      "SushiSwapLimitOrderReceiver"
    );
    const sushiSwapLimitOrderReceiver2 = await ethers.getContract(
      "SushiSwapLimitOrderReceiver2"
    );
    const sushiSwapLimitOrderReceiver3 = await ethers.getContract(
      "SushiSwapLimitOrderReceiver3"
    );
    const contracts: {
      name: string;
      address: string;
      constructorArguments?: string[];
    }[] = [
      {
        name: "Helper",
        address: helper.address,
        constructorArguments: [BENTOBOX_ADDRESS[chainId]],
      },
      {
        name: "Helper2",
        address: helper2.address,
        constructorArguments: [
          stopLimitOrder.address,
          BENTOBOX_ADDRESS[chainId],
          FACTORY_ADDRESS[chainId],
          INIT_CODE_HASH[chainId],
        ],
      },
      {
        name: "StopLimitOrder",
        address: stopLimitOrder.address,
        constructorArguments: ["100", BENTOBOX_ADDRESS[chainId]],
      },
      {
        name: "SushiSwapLimitOrderReceiver",
        address: sushiSwapLimitOrderReceiver.address,
        constructorArguments: [
          FACTORY_ADDRESS[chainId],
          BENTOBOX_ADDRESS[chainId],
          INIT_CODE_HASH[chainId],
        ],
      },
      {
        name: "SushiSwapLimitOrderReceiver2",
        address: sushiSwapLimitOrderReceiver2.address,
        constructorArguments: [
          FACTORY_ADDRESS[chainId],
          BENTOBOX_ADDRESS[chainId],
          INIT_CODE_HASH[chainId],
        ],
      },
      {
        name: "SushiSwapLimitOrderReceiver3",
        address: sushiSwapLimitOrderReceiver3.address,
        constructorArguments: [
          FACTORY_ADDRESS[chainId],
          BENTOBOX_ADDRESS[chainId],
          INIT_CODE_HASH[chainId],
        ],
      },
    ];

    for (const { address, constructorArguments } of contracts) {
      try {
        await run("verify:verify", {
          address,
          constructorArguments,
        });
      } catch (error) {
        if (error instanceof NomicLabsHardhatPluginError) {
          console.debug(error.message);
        }
      }
    }
    await tenderly.verify(contracts);
  }
);
