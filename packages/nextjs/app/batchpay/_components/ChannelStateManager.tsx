"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useScaffoldEventHistory, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { stateChannelClient } from "~~/services/stateChannelClient";
import { createViemMessageSigner } from "~~/utils/messageSigning";
import { notification } from "~~/utils/scaffold-eth";

interface ChannelStateManagerProps {
  channelId: string;
  participants: string[];
  onStateUpdate?: (newState: any) => void;
}

const ChannelStateManager = ({ channelId, participants, onStateUpdate }: ChannelStateManagerProps) => {
  const { address } = useAccount();
  const [newState, setNewState] = useState({
    balances: [] as string[],
    description: "",
  });
  const [isConnected, setIsConnected] = useState(false);
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  const { writeContractAsync: updateStateAsync, isPending: isUpdatingState } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const { writeContractAsync: closeChannelAsync, isPending: isClosingChannel } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const { writeContractAsync: challengeStateAsync, isPending: isChallengingState } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  // Initialize state channel client
  useEffect(() => {
    if (address) {
      const messageSigner = createViemMessageSigner();
      stateChannelClient.setMessageSigner(messageSigner);
      setIsConnected(true);
    }
  }, [address]);

  // Watch for state updates
  const { data: stateEvents } = useScaffoldEventHistory({
    contractName: "BatchPayChannel",
    eventName: "ChannelStateUpdated",
    watch: true,
  });

  // Collect signatures from participants
  const collectSignatures = async (stateData: any) => {
    if (!address) return {};

    const newSignatures: Record<string, string> = {};

    // For now, we'll simulate signature collection
    // In a real implementation, each participant would sign the state
    try {
      const messageSigner = createViemMessageSigner();
      const signature = await messageSigner(stateData);
      newSignatures[address] = signature;

      // In production, you'd collect signatures from all participants
      // This would involve sending the state to each participant for signing
      notification.success("State signed successfully");
    } catch (error) {
      console.error("Error signing state:", error);
      notification.error("Failed to sign state");
    }

    return newSignatures;
  };

  const handleUpdateState = async () => {
    if (!address || !isConnected) {
      notification.error("Please connect your wallet and ensure state channel is connected");
      return;
    }

    try {
      // Convert balances to bigint array
      const balances = newState.balances.map(b => BigInt(parseInt(b) || 0));

      // Create state update data
      const stateData = {
        channelId,
        balances,
        description: newState.description,
        timestamp: Date.now(),
      };

      // Collect signatures
      const collectedSignatures = await collectSignatures(stateData);
      setSignatures(collectedSignatures);

      // Use state channel client to update state
      await stateChannelClient.updateChannelState(balances);

      // Also update the smart contract for tracking
      const stateHash = `0x${Buffer.from(JSON.stringify(stateData)).toString("hex")}`;
      const signaturesArray = Object.values(collectedSignatures) as `0x${string}`[];

      await updateStateAsync({
        functionName: "updateState",
        args: [
          channelId as `0x${string}`,
          {
            channelId: channelId as `0x${string}`,
            stateHash: stateHash as `0x${string}`,
            nonce: BigInt(Date.now()),
            balances: balances,
          },
          signaturesArray,
        ],
      });

      notification.success("Channel state updated successfully!");
      onStateUpdate?.(stateData);
    } catch (error) {
      console.error("Error updating state:", error);
      notification.error("Failed to update channel state");
    }
  };

  const handleCloseChannel = async () => {
    if (!address || !isConnected) {
      notification.error("Please connect your wallet and ensure state channel is connected");
      return;
    }

    try {
      // Use state channel client to close channel
      await stateChannelClient.closeChannel();

      // Also update the smart contract for tracking
      const balances = newState.balances.map(b => BigInt(parseInt(b) || 0));
      const stateData = {
        channelId,
        balances,
        description: newState.description,
        timestamp: Date.now(),
      };
      const stateHash = `0x${Buffer.from(JSON.stringify(stateData)).toString("hex")}`;
      const signaturesArray = Object.values(signatures) as `0x${string}`[];

      await closeChannelAsync({
        functionName: "closeChannel",
        args: [
          channelId as `0x${string}`,
          {
            channelId: channelId as `0x${string}`,
            stateHash: stateHash as `0x${string}`,
            nonce: BigInt(Date.now()),
            balances: balances,
          },
          signaturesArray,
        ],
      });

      notification.success("Channel closed successfully!");
    } catch (error) {
      console.error("Error closing channel:", error);
      notification.error("Failed to close channel");
    }
  };

  const handleChallengeState = async () => {
    if (!address || !isConnected) {
      notification.error("Please connect your wallet and ensure state channel is connected");
      return;
    }

    try {
      const balances = newState.balances.map(b => BigInt(parseInt(b) || 0));
      const stateData = {
        channelId,
        balances,
        description: newState.description,
        timestamp: Date.now(),
      };
      const stateHash = `0x${Buffer.from(JSON.stringify(stateData)).toString("hex")}`;
      const signaturesArray = Object.values(signatures) as `0x${string}`[];

      await challengeStateAsync({
        functionName: "challengeState",
        args: [
          channelId as `0x${string}`,
          {
            channelId: channelId as `0x${string}`,
            stateHash: stateHash as `0x${string}`,
            nonce: BigInt(Date.now()),
            balances: balances,
          },
          signaturesArray,
        ],
      });

      notification.success("State challenge initiated!");
    } catch (error) {
      console.error("Error challenging state:", error);
      notification.error("Failed to challenge state");
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Channel State Management</h2>

        {/* Connection Status */}
        <div className={`alert ${isConnected ? "alert-success" : "alert-warning"} mb-4`}>
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
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>
            State Channel: {isConnected ? "Connected" : "Disconnected"}
            {isConnected && ` (${Object.keys(signatures).length} signature(s) collected)`}
          </span>
        </div>

        {/* State Update Form */}
        <div className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">New Balances</span>
            </label>
            <div className="space-y-2">
              {participants.map((participant, index) => (
                <div key={participant} className="flex items-center space-x-2">
                  <span className="text-sm font-mono w-32 truncate">{participant}</span>
                  <input
                    type="number"
                    placeholder="Balance"
                    className="input input-bordered flex-1"
                    value={newState.balances[index] || ""}
                    onChange={e => {
                      const newBalances = [...newState.balances];
                      newBalances[index] = e.target.value;
                      setNewState({ ...newState, balances: newBalances });
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text">Description</span>
            </label>
            <input
              type="text"
              placeholder="State update description"
              className="input input-bordered"
              value={newState.description}
              onChange={e => setNewState({ ...newState, description: e.target.value })}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <button className="btn btn-primary" onClick={handleUpdateState} disabled={isUpdatingState}>
              {isUpdatingState ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Updating...
                </>
              ) : (
                "Update State"
              )}
            </button>

            <button className="btn btn-warning" onClick={handleChallengeState} disabled={isChallengingState}>
              {isChallengingState ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Challenging...
                </>
              ) : (
                "Challenge State"
              )}
            </button>

            <button className="btn btn-error" onClick={handleCloseChannel} disabled={isClosingChannel}>
              {isClosingChannel ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Closing...
                </>
              ) : (
                "Close Channel"
              )}
            </button>
          </div>
        </div>

        {/* Recent State Events */}
        {stateEvents && stateEvents.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">Recent State Updates</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {stateEvents.slice(0, 5).map((event, index) => (
                <div key={index} className="text-xs bg-base-200 p-2 rounded">
                  <div>Nonce: {event.args.nonce?.toString()}</div>
                  <div>Updated by: {event.args.updatedBy}</div>
                  <div>Hash: {event.args.stateHash?.slice(0, 10)}...</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChannelStateManager;
