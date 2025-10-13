"use client";

import Link from "next/link";
import Navigation from "./_components/Navigation";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const BatchPayDashboard = () => {
  const { address, isConnected } = useAccount();

  // Get user's channels using Scaffold-ETH 2 hooks
  const { data: userChannels, isLoading: isLoadingChannels } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getUserChannels",
    args: [address as `0x${string}`],
  });

  return (
    <div className="min-h-screen bg-base-200">
      <Navigation />
      <div className="flex items-center space-y-4 flex-col flex-grow pt-10">
        <div className="px-5 mb-8 flex flex-col items-center max-w-5xl space-y-4">
          <h1 className="text-center my-0">
            <span className="block text-4xl font-bold">BatchPay</span>
            <span className="block text-xl text-base-content/60 mt-2">Cross-Chain Expense Splitting with PYUSD</span>
          </h1>
          <p className="my-0 text-center max-w-2xl">
            Split expenses with friends across any chain. Track in stable USD value with PYUSD, settle with any token
            via Yellow Network or PayPal bridge.
          </p>
        </div>

        {!isConnected ? (
          <div className="card w-96 bg-base-100 shadow-xl">
            <div className="card-body text-center">
              <h2 className="card-title justify-center">Connect Wallet</h2>
              <p>Connect your wallet to start using BatchPay</p>
              <div className="card-actions justify-center">
                <button className="btn btn-primary">Connect Wallet</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-6xl space-y-6">
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/batchpay/create" className="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
                <div className="card-body text-center">
                  <h3 className="card-title justify-center">Create Channel</h3>
                  <p>Start a new expense splitting channel</p>
                  <div className="card-actions justify-center">
                    <button className="btn btn-primary">Create</button>
                  </div>
                </div>
              </Link>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body text-center">
                  <h3 className="card-title justify-center">PYUSD Bridge</h3>
                  <p>Cross-chain PYUSD transfers via PayPal</p>
                  <div className="card-actions justify-center">
                    <button className="btn btn-secondary">Bridge</button>
                  </div>
                </div>
              </div>

              <div className="card bg-base-100 shadow-xl">
                <div className="card-body text-center">
                  <h3 className="card-title justify-center">Yellow Network</h3>
                  <p>Any token to any token swaps</p>
                  <div className="card-actions justify-center">
                    <button className="btn btn-accent">Swap</button>
                  </div>
                </div>
              </div>
            </div>

            {/* User's Channels */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Your Channels</h2>

                {isLoadingChannels ? (
                  <div className="flex justify-center">
                    <span className="loading loading-spinner loading-lg"></span>
                  </div>
                ) : userChannels && userChannels.length > 0 ? (
                  <div className="space-y-4">
                    {userChannels.map((channelId: string, index: number) => (
                      <ChannelCard key={index} channelId={channelId} />
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

            {/* PYUSD Integration Info */}
            <div className="card bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-white">PYUSD Integration</h2>
                <p className="text-white/90">
                  BatchPay supports PayPal USD (PYUSD) for stable expense tracking and cross-chain settlements. Use
                  PayPal bridge for instant Ethereum ↔ Solana transfers.
                </p>
                <div className="card-actions">
                  <button className="btn btn-white">Learn More</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Channel Card Component
const ChannelCard = ({ channelId }: { channelId: string }) => {
  const { data: channelInfo, isLoading } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getChannel",
    args: [channelId as `0x${string}`],
  });

  if (isLoading) {
    return (
      <div className="card bg-base-200 shadow">
        <div className="card-body">
          <div className="flex justify-center">
            <span className="loading loading-spinner"></span>
          </div>
        </div>
      </div>
    );
  }

  if (!channelInfo) {
    return null;
  }

  const [participants, , , , isOpen, inDispute, chainId] = channelInfo;

  return (
    <div className="card bg-base-200 shadow hover:shadow-lg transition-shadow">
      <div className="card-body">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="card-title text-sm">Channel {channelId.slice(0, 8)}...</h3>
            <div className="text-sm text-base-content/60 space-y-1">
              <p>Participants: {participants.length}</p>
              <p>Status: {isOpen ? "Open" : "Closed"}</p>
              {inDispute && <p className="text-warning">In Dispute</p>}
              <p>Chain ID: {chainId.toString()}</p>
            </div>
          </div>
          <div className="card-actions">
            <Link href={`/batchpay/${channelId}`} className="btn btn-primary btn-sm">
              View Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchPayDashboard;
