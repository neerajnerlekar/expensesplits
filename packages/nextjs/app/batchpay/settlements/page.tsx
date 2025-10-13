"use client";

import { useState } from "react";
import Link from "next/link";
import Navigation from "../_components/Navigation";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";
import { SUPPORTED_TOKENS } from "~~/utils/tokens";

const SettlementsPage = () => {
  const { address, isConnected } = useAccount();
  const [selectedSettlements, setSelectedSettlements] = useState<Set<string>>(new Set());

  // Get user's channels to find settlements
  const { data: userChannels, isLoading: isLoadingChannels } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getUserChannels",
    args: [address as `0x${string}`],
  });

  // Settlement selection handler (for future use)
  // const handleSettlementSelection = (settlementId: string) => {
  //   const newSelection = new Set(selectedSettlements);
  //   if (newSelection.has(settlementId)) {
  //     newSelection.delete(settlementId);
  //   } else {
  //     newSelection.add(settlementId);
  //   }
  //   setSelectedSettlements(newSelection);
  // };

  const handleBatchSettlement = async () => {
    if (selectedSettlements.size === 0) {
      notification.error("Please select at least one settlement");
      return;
    }

    // TODO: Implement batch settlement logic
    notification.success(`Processing ${selectedSettlements.size} settlement(s)...`);
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">Connect Wallet</h2>
            <p>Please connect your wallet to view settlements</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <Navigation />
      <div className="flex items-center space-y-4 flex-col flex-grow pt-10">
        <div className="px-5 mb-8 flex flex-col items-center max-w-5xl space-y-4">
          <h1 className="text-center my-0">
            <span className="block text-4xl font-bold">Settlements</span>
            <span className="block text-xl text-base-content/60 mt-2">
              Manage batch settlements across all channels
            </span>
          </h1>
        </div>

        <div className="w-full max-w-6xl space-y-6">
          {/* Settlement Summary */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Settlement Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat">
                  <div className="stat-title">Pending Settlements</div>
                  <div className="stat-value text-primary">0</div>
                  <div className="stat-desc">Across all channels</div>
                </div>
                <div className="stat">
                  <div className="stat-title">PYUSD Settlements</div>
                  <div className="stat-value text-success">0</div>
                  <div className="stat-desc">PayPal bridge ready</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Yellow Network</div>
                  <div className="stat-value text-warning">0</div>
                  <div className="stat-desc">Cross-chain swaps</div>
                </div>
              </div>
            </div>
          </div>

          {/* Settlement Actions */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Batch Settlement Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card bg-base-200 shadow">
                  <div className="card-body">
                    <h3 className="card-title text-lg">PYUSD Bridge</h3>
                    <p className="text-sm text-base-content/60">Use PayPal bridge for PYUSD cross-chain transfers</p>
                    <div className="card-actions justify-end">
                      <button className="btn btn-primary btn-sm" disabled>
                        Bridge PYUSD
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card bg-base-200 shadow">
                  <div className="card-body">
                    <h3 className="card-title text-lg">Yellow Network</h3>
                    <p className="text-sm text-base-content/60">Any token to any token cross-chain swaps</p>
                    <div className="card-actions justify-end">
                      <button className="btn btn-secondary btn-sm" disabled>
                        Yellow Swap
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Settlement History */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Settlement History</h2>

              {isLoadingChannels ? (
                <div className="flex justify-center">
                  <span className="loading loading-spinner loading-lg"></span>
                </div>
              ) : userChannels && userChannels.length > 0 ? (
                <div className="space-y-4">
                  {userChannels.map((channelId: string, index: number) => (
                    <ChannelSettlements key={index} channelId={channelId} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-base-content/60 mb-4">No channels found</p>
                  <Link href="/batchpay/create" className="btn btn-primary">
                    Create Your First Channel
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Batch Actions */}
          {selectedSettlements.size > 0 && (
            <div className="card bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-white">Batch Settlement Ready</h2>
                <p className="text-white/90">{selectedSettlements.size} settlement(s) selected for batch processing</p>
                <div className="card-actions">
                  <button className="btn btn-white" onClick={handleBatchSettlement}>
                    Process Batch Settlement
                  </button>
                  <button className="btn btn-outline btn-white" onClick={() => setSelectedSettlements(new Set())}>
                    Clear Selection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Channel Settlements Component
const ChannelSettlements = ({ channelId }: { channelId: string }) => {
  const { data: channelInfo } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getChannel",
    args: [channelId as `0x${string}`],
  });

  const { data: settlements } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getChannelSettlements",
    args: [channelId as `0x${string}`],
  });

  if (!channelInfo || !settlements) {
    return null;
  }

  const [participants, , , , isOpen] = channelInfo;

  return (
    <div className="card bg-base-200 shadow">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="card-title text-sm">Channel {channelId.slice(0, 8)}...</h3>
            <div className="text-sm text-base-content/60">
              <p>Status: {isOpen ? "Open" : "Closed"}</p>
              <p>Participants: {participants.length}</p>
              <p>Settlements: {settlements.length}</p>
            </div>
          </div>
          <div className="card-actions">
            <Link href={`/batchpay/${channelId}`} className="btn btn-primary btn-sm">
              View Details
            </Link>
          </div>
        </div>

        {settlements.length > 0 && (
          <div className="mt-4">
            <div className="text-sm font-semibold mb-2">Recent Settlements:</div>
            <div className="space-y-2">
              {settlements.slice(0, 3).map((settlement: any, index: number) => {
                const token = SUPPORTED_TOKENS.find(
                  t => t.address.toLowerCase() === settlement.fromToken?.toLowerCase(),
                );

                return (
                  <div key={index} className="flex items-center justify-between bg-base-100 p-2 rounded">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm">
                        {settlement.amount?.toString() || "0"} {token?.symbol || "Unknown"}
                      </span>
                      <span className="text-xs text-base-content/60">
                        <Address address={settlement.from} /> → <Address address={settlement.to} />
                      </span>
                    </div>
                    <span className="badge badge-sm">
                      {settlement.bridgeType === 1 ? "PayPal" : settlement.bridgeType === 2 ? "Yellow" : "Direct"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettlementsPage;
