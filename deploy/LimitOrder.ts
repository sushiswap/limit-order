import { LimitOrder } from "../typechain";

export default async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address }: LimitOrder = await deploy("LimitOrder", {
    from: deployer,
    args: ["Hello, world!"],
  });

  console.log(`LimitOrder deployed to ${address}`);
};
