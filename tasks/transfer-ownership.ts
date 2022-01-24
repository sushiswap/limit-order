import { task } from "hardhat/config";

task("transfer-ownership", "Transfer ownership")
  .addParam("address", "New owner")
  .setAction(async function (
    { address },
    { ethers: { getNamedSigner, getContract } }
  ) {
    const stopLimitOrder = await getContract("StopLimitOrder");

    await stopLimitOrder.transferOwnership(address, true, false);

    console.log("Ownership tranfered!");
  });
