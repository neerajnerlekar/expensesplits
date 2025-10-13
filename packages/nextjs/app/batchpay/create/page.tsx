"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useChainId } from "wagmi";
import { AddressInput } from "~~/components/scaffold-eth";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const CreateChannelPage = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [participants, setParticipants] = useState<string[]>([]);
  const [newParticipant, setNewParticipant] = useState("");
  const [deposit, setDeposit] = useState("0.01");

  const { writeContractAsync: writeBatchPayChannelAsync, isPending } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const handleAddParticipant = () => {
    if (newParticipant && !participants.includes(newParticipant) && newParticipant !== address) {
      setParticipants([...participants, newParticipant]);
      setNewParticipant("");
    }
  };

  const handleRemoveParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const handleCreateChannel = async () => {
    if (!isConnected || !address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (participants.length < 1) {
      notification.error("Please add at least one participant");
      return;
    }

    try {
      // Convert deposit to wei (assuming ETH deposit)
      const depositWei = BigInt(Math.floor(parseFloat(deposit) * 1e18));

      await writeBatchPayChannelAsync({
        functionName: "openChannel",
        args: [[...participants, address], BigInt(chainId || 1)],
        value: depositWei,
      });

      notification.success("Channel created successfully!");
    } catch (error) {
      console.error("Error creating channel:", error);
      notification.error("Failed to create channel");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">Connect Wallet</h2>
            <p>Please connect your wallet to create a channel</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center space-y-4 flex-col flex-grow pt-10">
      <div className="px-5 mb-8 flex flex-col items-center max-w-5xl space-y-4">
        <h1 className="text-center my-0">
          <span className="block text-4xl font-bold">Create Channel</span>
          <span className="block text-xl text-base-content/60 mt-2">Start a new expense splitting channel</span>
        </h1>
      </div>

      <div className="w-full max-w-2xl space-y-6">
        {/* Channel Configuration */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Channel Configuration</h2>

            {/* Participants */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Participants</span>
              </label>
              <div className="flex gap-2">
                <AddressInput
                  value={newParticipant}
                  onChange={setNewParticipant}
                  placeholder="Enter participant address"
                />
                <button className="btn btn-primary" onClick={handleAddParticipant} disabled={!newParticipant}>
                  Add
                </button>
              </div>
            </div>

            {/* Participant List */}
            {participants.length > 0 && (
              <div className="space-y-2">
                <label className="label">
                  <span className="label-text">Added Participants</span>
                </label>
                {participants.map((participant, index) => (
                  <div key={index} className="flex items-center justify-between bg-base-200 p-3 rounded">
                    <span className="font-mono text-sm">{participant}</span>
                    <button className="btn btn-sm btn-error" onClick={() => handleRemoveParticipant(index)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Deposit Amount */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Initial Deposit (ETH)</span>
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={deposit}
                onChange={e => setDeposit(e.target.value)}
                className="input input-bordered w-full"
                placeholder="0.01"
              />
            </div>

            {/* Chain Info */}
            <div className="alert alert-info">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                className="stroke-current shrink-0 w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <span>Creating channel on Chain ID: {chainId}</span>
            </div>
          </div>
        </div>

        {/* PYUSD Integration Info */}
        <div className="card bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-white">PYUSD Integration</h2>
            <p className="text-white/90">
              After creating the channel, you can set PYUSD as your preferred settlement token for stable expense
              tracking and cross-chain settlements via PayPal bridge.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <Link href="/batchpay" className="btn btn-outline flex-1">
            Cancel
          </Link>
          <button
            className="btn btn-primary flex-1"
            onClick={handleCreateChannel}
            disabled={isPending || participants.length < 1}
          >
            {isPending ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Creating...
              </>
            ) : (
              "Create Channel"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateChannelPage;
