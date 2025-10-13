import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deploys YellowNetworkAdapter contract
 *
 * @param hre HardhatRuntimeEnvironment object.
 */
const deployYellowNetworkAdapter: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // Yellow Network configuration
  // These would be real addresses in production
  const YELLOW_NETWORK_ENDPOINT = "0x0000000000000000000000000000000000000000"; // Placeholder
  const YELLOW_NETWORK_CHAIN_ID = 1; // Ethereum mainnet

  await deploy("YellowNetworkAdapter", {
    from: deployer,
    args: [YELLOW_NETWORK_ENDPOINT, YELLOW_NETWORK_CHAIN_ID],
    log: true,
    autoMine: true,
  });
};

export default deployYellowNetworkAdapter;

// Tags are useful if you have multiple deploy files and only want to run one of them.
// e.g. yarn deploy --tags YellowNetworkAdapter
deployYellowNetworkAdapter.tags = ["YellowNetworkAdapter"];
