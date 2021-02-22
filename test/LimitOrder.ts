import { ethers } from "hardhat";
import { expect } from "chai";

describe("LimitOrder", function () {
  it("Should return the new greeting once it's changed", async function () {
    const LimitOrder = await ethers.getContractFactory("LimitOrder");
    const limitOrder = await LimitOrder.deploy("Hello, world!");

    await limitOrder.deployed();
  });
});
