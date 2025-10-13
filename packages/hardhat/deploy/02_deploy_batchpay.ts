import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys BatchPayChannel contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployBatchPayChannel: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  await deploy("BatchPayChannel", {
    from: deployer,
    log: true,
    autoMine: true,
  });
};

export default deployBatchPayChannel;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags BatchPayChannel
deployBatchPayChannel.tags = ["BatchPayChannel"];
