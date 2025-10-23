"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const AdminDashboard = () => {
  const { address } = useAccount();
  const [adminData, setAdminData] = useState({
    newEndpoint: "",
    newBroker: "",
    pauseReason: "",
  });

  // Yellow Network Adapter Admin Functions
  const { writeContractAsync: updateEndpointAsync, isPending: isUpdatingEndpoint } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: setEnabledAsync, isPending: isSettingEnabled } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: pauseAdapterAsync, isPending: isPausingAdapter } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: unpauseAdapterAsync, isPending: isUnpausingAdapter } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: grantBrokerAsync, isPending: isGrantingBroker } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: revokeBrokerAsync, isPending: isRevokingBroker } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  // BatchPayChannel Admin Functions
  const { writeContractAsync: pauseBatchPayAsync, isPending: isPausingBatchPay } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const { writeContractAsync: unpauseBatchPayAsync, isPending: isUnpausingBatchPay } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  // Read functions
  const { data: yellowNetworkConfig } = useScaffoldReadContract({
    contractName: "YellowNetworkAdapter",
    functionName: "getYellowNetworkConfig",
  });

  const { data: isAdapterPaused } = useScaffoldReadContract({
    contractName: "YellowNetworkAdapter",
    functionName: "paused",
  });

  const { data: isBatchPayPaused } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "paused",
  });

  const handleUpdateEndpoint = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!adminData.newEndpoint) {
      notification.error("Please enter a new endpoint");
      return;
    }

    try {
      await updateEndpointAsync({
        functionName: "updateYellowNetworkEndpoint",
        args: [adminData.newEndpoint as `0x${string}`],
      });

      notification.success("Yellow Network endpoint updated successfully!");
      setAdminData({ ...adminData, newEndpoint: "" });
    } catch (error) {
      console.error("Error updating endpoint:", error);
      notification.error("Failed to update endpoint");
    }
  };

  const handleToggleNetwork = async (enabled: boolean) => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await setEnabledAsync({
        functionName: "setYellowNetworkEnabled",
        args: [enabled],
      });

      notification.success(`Yellow Network ${enabled ? "enabled" : "disabled"} successfully!`);
    } catch (error) {
      console.error("Error toggling network:", error);
      notification.error("Failed to toggle network");
    }
  };

  const handlePauseAdapter = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await pauseAdapterAsync({
        functionName: "pause",
      });

      notification.success("Yellow Network Adapter paused successfully!");
    } catch (error) {
      console.error("Error pausing adapter:", error);
      notification.error("Failed to pause adapter");
    }
  };

  const handleUnpauseAdapter = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await unpauseAdapterAsync({
        functionName: "unpause",
      });

      notification.success("Yellow Network Adapter unpaused successfully!");
    } catch (error) {
      console.error("Error unpausing adapter:", error);
      notification.error("Failed to unpause adapter");
    }
  };

  const handlePauseBatchPay = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await pauseBatchPayAsync({
        functionName: "pause",
      });

      notification.success("BatchPay Channel paused successfully!");
    } catch (error) {
      console.error("Error pausing BatchPay:", error);
      notification.error("Failed to pause BatchPay");
    }
  };

  const handleUnpauseBatchPay = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await unpauseBatchPayAsync({
        functionName: "unpause",
      });

      notification.success("BatchPay Channel unpaused successfully!");
    } catch (error) {
      console.error("Error unpausing BatchPay:", error);
      notification.error("Failed to unpause BatchPay");
    }
  };

  const handleGrantBroker = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!adminData.newBroker) {
      notification.error("Please enter a broker address");
      return;
    }

    try {
      await grantBrokerAsync({
        functionName: "grantBrokerRole",
        args: [adminData.newBroker as `0x${string}`],
      });

      notification.success("Broker role granted successfully!");
      setAdminData({ ...adminData, newBroker: "" });
    } catch (error) {
      console.error("Error granting broker role:", error);
      notification.error("Failed to grant broker role");
    }
  };

  const handleRevokeBroker = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!adminData.newBroker) {
      notification.error("Please enter a broker address");
      return;
    }

    try {
      await revokeBrokerAsync({
        functionName: "revokeBrokerRole",
        args: [adminData.newBroker as `0x${string}`],
      });

      notification.success("Broker role revoked successfully!");
      setAdminData({ ...adminData, newBroker: "" });
    } catch (error) {
      console.error("Error revoking broker role:", error);
      notification.error("Failed to revoke broker role");
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
        <p className="text-base-content/60">Manage contract settings and network configuration</p>
      </div>

      {/* Current Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Yellow Network Status */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Yellow Network Status</h2>
            {yellowNetworkConfig && (
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Endpoint:</span>
                  <Address address={yellowNetworkConfig[0]} />
                </div>
                <div>
                  <span className="font-semibold">Chain ID:</span> {yellowNetworkConfig[1]?.toString()}
                </div>
                <div>
                  <span className="font-semibold">Enabled:</span> {yellowNetworkConfig[2] ? "✅" : "❌"}
                </div>
                <div>
                  <span className="font-semibold">Paused:</span> {isAdapterPaused ? "⏸️" : "▶️"}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BatchPay Status */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">BatchPay Status</h2>
            <div className="space-y-2">
              <div>
                <span className="font-semibold">Paused:</span> {isBatchPayPaused ? "⏸️" : "▶️"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Yellow Network Management */}
      <div className="card bg-base-100 shadow-xl mb-6">
        <div className="card-body">
          <h2 className="card-title">Yellow Network Management</h2>

          {/* Update Endpoint */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Update Endpoint</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x..."
                className="input input-bordered flex-1"
                value={adminData.newEndpoint}
                onChange={e => setAdminData({ ...adminData, newEndpoint: e.target.value })}
              />
              <button className="btn btn-primary" onClick={handleUpdateEndpoint} disabled={isUpdatingEndpoint}>
                {isUpdatingEndpoint ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Updating...
                  </>
                ) : (
                  "Update"
                )}
              </button>
            </div>
          </div>

          {/* Network Toggle */}
          <div className="flex gap-2 mb-4">
            <button className="btn btn-success" onClick={() => handleToggleNetwork(true)} disabled={isSettingEnabled}>
              {isSettingEnabled ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Enabling...
                </>
              ) : (
                "Enable Network"
              )}
            </button>

            <button className="btn btn-warning" onClick={() => handleToggleNetwork(false)} disabled={isSettingEnabled}>
              {isSettingEnabled ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Disabling...
                </>
              ) : (
                "Disable Network"
              )}
            </button>
          </div>

          {/* Pause/Unpause */}
          <div className="flex gap-2">
            <button className="btn btn-error" onClick={handlePauseAdapter} disabled={isPausingAdapter}>
              {isPausingAdapter ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Pausing...
                </>
              ) : (
                "Pause Adapter"
              )}
            </button>

            <button className="btn btn-success" onClick={handleUnpauseAdapter} disabled={isUnpausingAdapter}>
              {isUnpausingAdapter ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Unpausing...
                </>
              ) : (
                "Unpause Adapter"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* BatchPay Management */}
      <div className="card bg-base-100 shadow-xl mb-6">
        <div className="card-body">
          <h2 className="card-title">BatchPay Management</h2>

          <div className="flex gap-2">
            <button className="btn btn-error" onClick={handlePauseBatchPay} disabled={isPausingBatchPay}>
              {isPausingBatchPay ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Pausing...
                </>
              ) : (
                "Pause BatchPay"
              )}
            </button>

            <button className="btn btn-success" onClick={handleUnpauseBatchPay} disabled={isUnpausingBatchPay}>
              {isUnpausingBatchPay ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Unpausing...
                </>
              ) : (
                "Unpause BatchPay"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Role Management */}
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title">Role Management</h2>

          {/* Broker Role Management */}
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Broker Address</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="0x..."
                className="input input-bordered flex-1"
                value={adminData.newBroker}
                onChange={e => setAdminData({ ...adminData, newBroker: e.target.value })}
              />
              <button className="btn btn-success" onClick={handleGrantBroker} disabled={isGrantingBroker}>
                {isGrantingBroker ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Granting...
                  </>
                ) : (
                  "Grant Broker"
                )}
              </button>
              <button className="btn btn-error" onClick={handleRevokeBroker} disabled={isRevokingBroker}>
                {isRevokingBroker ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Revoking...
                  </>
                ) : (
                  "Revoke Broker"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="alert alert-warning mt-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <div>
          <h3 className="font-bold">Admin Warning</h3>
          <div className="text-xs">
            These functions require admin privileges. Use with caution as they can affect the entire system.
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
