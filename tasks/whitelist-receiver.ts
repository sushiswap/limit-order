import { task } from "hardhat/config";

task("whitelist-receiver", "Whitelist receiver")
  .addParam("address", "New receiver")
  .setAction(async function (
    { address },
    { ethers: { getNamedSigner, getContract } }
  ) {
    const dev = await getNamedSigner("dev");
    const stopLimitOrder = await getContract("StopLimitOrder");

    await stopLimitOrder.connect(dev).whiteListReceiver(address);

    console.log("Receiver whitelisted!");
  });
