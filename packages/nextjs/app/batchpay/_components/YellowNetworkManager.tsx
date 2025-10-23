"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { yellowNetworkService } from "~~/services/yellowNetwork";
import type { QuoteParams, SwapIntentRequest, YellowNetworkSwapIntent } from "~~/types/nitrolite";
import { notification } from "~~/utils/scaffold-eth";

interface YellowNetworkManagerProps {
  onSwapComplete?: (intentId: string) => void;
  onIntentCreated?: (intent: YellowNetworkSwapIntent) => void;
  onIntentUpdated?: (intent: YellowNetworkSwapIntent) => void;
}

const YellowNetworkManager = ({ onSwapComplete, onIntentCreated, onIntentUpdated }: YellowNetworkManagerProps) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [swapData, setSwapData] = useState({
    fromToken: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", // PYUSD address
    toToken: "0xA0b86a33E6441b8C4C8C0C4C8C0C4C8C0C4C8C0C", // USDC address placeholder
    fromAmount: "",
    toAmount: "",
    recipient: "",
    deadline: "",
  });

  const [channelData, setChannelData] = useState({
    participants: [""],
    initialLiquidity: "",
  });

  const [intents, setIntents] = useState<YellowNetworkSwapIntent[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState<string>("");
  const [quote, setQuote] = useState<any>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Load user intents on component mount
  useEffect(() => {
    const loadIntents = async () => {
      if (!address) return;

      try {
        const userIntents = await yellowNetworkService.getUserIntents(address);
        setIntents(userIntents);
      } catch (error) {
        console.error("Failed to load intents:", error);
        notification.error("Failed to load intents");
      }
    };

    loadIntents();
  }, [address]);

  const { isPending: isCreatingIntent } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: confirmSwapIntentAsync, isPending: isConfirmingIntent } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: completeSwapSettlementAsync, isPending: isCompletingSettlement } =
    useScaffoldWriteContract({
      contractName: "YellowNetworkAdapter",
    });

  const { writeContractAsync: openYellowChannelAsync, isPending: isOpeningChannel } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  const { writeContractAsync: closeYellowChannelAsync, isPending: isClosingChannel } = useScaffoldWriteContract({
    contractName: "YellowNetworkAdapter",
  });

  // Read functions
  const { data: yellowNetworkConfig } = useScaffoldReadContract({
    contractName: "YellowNetworkAdapter",
    functionName: "getYellowNetworkConfig",
  });

  const { data: userIntents } = useScaffoldReadContract({
    contractName: "YellowNetworkAdapter",
    functionName: "getUserIntents",
    args: [address as `0x${string}` | undefined],
  });

  // Event watchers
  const { data: swapIntentEvents } = useScaffoldEventHistory({
    contractName: "YellowNetworkAdapter",
    eventName: "SwapIntentCreated",
    watch: true,
  });

  // Event monitoring for swap confirmations and completions
  useScaffoldEventHistory({
    contractName: "YellowNetworkAdapter",
    eventName: "SwapIntentConfirmed",
    watch: true,
  });

  useScaffoldEventHistory({
    contractName: "YellowNetworkAdapter",
    eventName: "SwapIntentSettled",
    watch: true,
  });

  const handleGetQuote = async () => {
    if (!swapData.fromAmount || !swapData.fromToken || !swapData.toToken) {
      notification.error("Please fill in from amount and token addresses");
      return;
    }

    setIsLoadingQuote(true);
    try {
      const quoteParams: QuoteParams = {
        fromToken: swapData.fromToken as `0x${string}`,
        toToken: swapData.toToken as `0x${string}`,
        fromAmount: BigInt(parseFloat(swapData.fromAmount) * 1e6), // Assuming 6 decimals
        fromChainId: chainId || 1,
        toChainId: 42161, // Arbitrum as example
        slippageTolerance: 0.5,
      };

      const quoteResult = await yellowNetworkService.getQuote(quoteParams);
      setQuote(quoteResult);
      setSwapData(prev => ({ ...prev, toAmount: quoteResult.toAmount.toString() }));
      notification.success("Quote received from Yellow Network");
    } catch (error) {
      console.error("Error getting quote:", error);
      notification.error("Failed to get quote");
    } finally {
      setIsLoadingQuote(false);
    }
  };

  const handleCreateSwapIntent = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!swapData.fromAmount || !swapData.recipient) {
      notification.error("Please fill in all required fields");
      return;
    }

    if (!quote) {
      notification.error("Please get a quote first");
      return;
    }

    try {
      const swapRequest: SwapIntentRequest = {
        from: address,
        to: swapData.recipient as `0x${string}`,
        fromAmount: BigInt(parseFloat(swapData.fromAmount) * 1e6),
        fromToken: swapData.fromToken as `0x${string}`,
        toToken: swapData.toToken as `0x${string}`,
        fromChainId: chainId || 1,
        toChainId: 42161, // Arbitrum as example
        quoteId: quote.quoteId,
        deadline: swapData.deadline
          ? Math.floor(new Date(swapData.deadline).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 3600,
      };

      const intent = await yellowNetworkService.submitSwapIntent(swapRequest);
      setIntents(prev => [...prev, intent]);
      setSelectedIntentId(intent.intentId);
      onIntentCreated?.(intent);
      onSwapComplete?.(intent.intentId);
      notification.success("Swap intent created successfully!");
    } catch (error) {
      console.error("Error creating swap intent:", error);
      notification.error("Failed to create swap intent");
    }
  };

  const handleConfirmSwapIntent = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!selectedIntentId) {
      notification.error("Please select an intent to confirm");
      return;
    }

    try {
      const intent = intents.find(i => i.intentId === selectedIntentId);
      if (!intent) {
        notification.error("Intent not found");
        return;
      }

      const yellowChannelId = intent.yellowChannelId || "0xabcdef1234567890"; // Use from intent or placeholder
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await confirmSwapIntentAsync({
        functionName: "confirmSwapIntent",
        args: [selectedIntentId as `0x${string}`, yellowChannelId as `0x${string}`, BigInt(deadline)],
      });

      // Update intent status
      const updatedIntent: YellowNetworkSwapIntent = { ...intent, status: "confirmed" };
      setIntents(prev => prev.map(i => (i.intentId === selectedIntentId ? updatedIntent : i)));
      onIntentUpdated?.(updatedIntent);
      notification.success("Swap intent confirmed!");
    } catch (error) {
      console.error("Error confirming swap intent:", error);
      notification.error("Failed to confirm swap intent");
    }
  };

  const handleCompleteSwapSettlement = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!selectedIntentId) {
      notification.error("Please select an intent to complete");
      return;
    }

    try {
      const intent = intents.find(i => i.intentId === selectedIntentId);
      if (!intent) {
        notification.error("Intent not found");
        return;
      }

      const toAmount = BigInt(parseFloat(swapData.toAmount) * 1e6);
      const success = true; // Would be determined by actual swap result

      await completeSwapSettlementAsync({
        functionName: "completeSwapSettlement",
        args: [selectedIntentId as `0x${string}`, toAmount, success],
      });

      // Update intent status
      const updatedIntent: YellowNetworkSwapIntent = { ...intent, status: "settled" };
      setIntents(prev => prev.map(i => (i.intentId === selectedIntentId ? updatedIntent : i)));
      onIntentUpdated?.(updatedIntent);
      notification.success("Swap settlement completed!");
    } catch (error) {
      console.error("Error completing swap settlement:", error);
      notification.error("Failed to complete swap settlement");
    }
  };

  const handleOpenYellowChannel = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    const participants = channelData.participants.filter(p => p.trim() !== "");
    if (participants.length < 2) {
      notification.error("Please add at least 2 participants");
      return;
    }

    try {
      const initialLiquidityWei = BigInt(parseFloat(channelData.initialLiquidity) * 1e18); // Assuming 18 decimals for ETH

      await openYellowChannelAsync({
        functionName: "openYellowChannel",
        args: [participants as `0x${string}`[], initialLiquidityWei],
      });

      notification.success("Yellow Network channel opened!");
    } catch (error) {
      console.error("Error opening Yellow channel:", error);
      notification.error("Failed to open Yellow Network channel");
    }
  };

  const handleCloseYellowChannel = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    const channelId = "0xabcdef1234567890"; // Placeholder - would come from UI selection
    const finalLiquidity = BigInt(parseFloat(channelData.initialLiquidity) * 1e18);

    try {
      await closeYellowChannelAsync({
        functionName: "closeYellowChannel",
        args: [channelId as `0x${string}`, finalLiquidity],
      });

      notification.success("Yellow Network channel closed!");
    } catch (error) {
      console.error("Error closing Yellow channel:", error);
      notification.error("Failed to close Yellow Network channel");
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Yellow Network Manager</h2>
        <p className="text-base-content/60 mb-4">
          Manage cross-chain swaps and Yellow Network channels for multi-chain operations.
        </p>

        {/* Yellow Network Config */}
        {yellowNetworkConfig && (
          <div className="alert alert-info mb-4">
            <div>
              <h3 className="font-semibold">Yellow Network Config</h3>
              <p>
                Endpoint: <Address address={yellowNetworkConfig[0]} />
              </p>
              <p>Chain ID: {yellowNetworkConfig[1]?.toString()}</p>
              <p>Enabled: {yellowNetworkConfig[2] ? "✅" : "❌"}</p>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Swap Intent Creation */}
          <div className="border border-base-300 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Create Swap Intent</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">From Token</span>
                </label>
                <select
                  className="select select-bordered"
                  value={swapData.fromToken}
                  onChange={e => setSwapData({ ...swapData, fromToken: e.target.value })}
                >
                  <option value="PYUSD">PYUSD</option>
                  <option value="USDC">USDC</option>
                  <option value="USDT">USDT</option>
                  <option value="ETH">ETH</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">To Token</span>
                </label>
                <select
                  className="select select-bordered"
                  value={swapData.toToken}
                  onChange={e => setSwapData({ ...swapData, toToken: e.target.value })}
                >
                  <option value="USDC">USDC</option>
                  <option value="PYUSD">PYUSD</option>
                  <option value="USDT">USDT</option>
                  <option value="ETH">ETH</option>
                </select>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">From Amount</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  className="input input-bordered"
                  value={swapData.fromAmount}
                  onChange={e => setSwapData({ ...swapData, fromAmount: e.target.value })}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">To Amount</span>
                </label>
                <input
                  type="number"
                  step="0.000001"
                  placeholder="0.00"
                  className="input input-bordered"
                  value={swapData.toAmount}
                  onChange={e => setSwapData({ ...swapData, toAmount: e.target.value })}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Recipient</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  className="input input-bordered"
                  value={swapData.recipient}
                  onChange={e => setSwapData({ ...swapData, recipient: e.target.value })}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Deadline</span>
                </label>
                <input
                  type="datetime-local"
                  className="input input-bordered"
                  value={swapData.deadline}
                  onChange={e => setSwapData({ ...swapData, deadline: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-3">
              <button className="btn btn-secondary" onClick={handleGetQuote} disabled={isLoadingQuote}>
                {isLoadingQuote ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Getting Quote...
                  </>
                ) : (
                  "Get Quote"
                )}
              </button>

              <button
                className="btn btn-primary"
                onClick={handleCreateSwapIntent}
                disabled={isCreatingIntent || !quote}
              >
                {isCreatingIntent ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Creating...
                  </>
                ) : (
                  "Create Swap Intent"
                )}
              </button>
            </div>

            {/* Quote Display */}
            {quote && (
              <div className="alert alert-info mt-3">
                <div>
                  <h4 className="font-semibold">Quote Details</h4>
                  <p>
                    From: {quote.fromAmount.toString()} → To: {quote.toAmount.toString()}
                  </p>
                  <p>Fee: {quote.fee.toString()}</p>
                  <p>Estimated Time: {quote.estimatedTime}</p>
                  <p>Route: {quote.route.join(" → ")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Channel Management */}
          <div className="border border-base-300 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Yellow Network Channel</h3>
            <div className="space-y-3">
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Participants</span>
                </label>
                <div className="space-y-2">
                  {channelData.participants.map((participant, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="0x..."
                        className="input input-bordered flex-1"
                        value={participant}
                        onChange={e => {
                          const newParticipants = [...channelData.participants];
                          newParticipants[index] = e.target.value;
                          setChannelData({ ...channelData, participants: newParticipants });
                        }}
                      />
                      {channelData.participants.length > 1 && (
                        <button
                          className="btn btn-sm btn-error"
                          onClick={() => {
                            const newParticipants = channelData.participants.filter((_, i) => i !== index);
                            setChannelData({ ...channelData, participants: newParticipants });
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => setChannelData({ ...channelData, participants: [...channelData.participants, ""] })}
                  >
                    + Add Participant
                  </button>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text">Initial Liquidity (ETH)</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.00"
                  className="input input-bordered"
                  value={channelData.initialLiquidity}
                  onChange={e => setChannelData({ ...channelData, initialLiquidity: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={handleOpenYellowChannel} disabled={isOpeningChannel}>
                  {isOpeningChannel ? (
                    <>
                      <span className="loading loading-spinner loading-sm"></span>
                      Opening...
                    </>
                  ) : (
                    "Open Channel"
                  )}
                </button>

                <button className="btn btn-error" onClick={handleCloseYellowChannel} disabled={isClosingChannel}>
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
          </div>

          {/* Intent Management */}
          <div className="border border-base-300 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Intent Management</h3>

            {/* Intent Selection */}
            {intents.length > 0 && (
              <div className="form-control mb-3">
                <label className="label">
                  <span className="label-text">Select Intent</span>
                </label>
                <select
                  className="select select-bordered"
                  value={selectedIntentId}
                  onChange={e => setSelectedIntentId(e.target.value)}
                >
                  <option value="">Select an intent...</option>
                  {intents.map(intent => (
                    <option key={intent.intentId} value={intent.intentId}>
                      {intent.intentId.slice(0, 10)}... - {intent.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                className="btn btn-secondary"
                onClick={handleConfirmSwapIntent}
                disabled={isConfirmingIntent || !selectedIntentId}
              >
                {isConfirmingIntent ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Confirming...
                  </>
                ) : (
                  "Confirm Intent"
                )}
              </button>

              <button
                className="btn btn-accent"
                onClick={handleCompleteSwapSettlement}
                disabled={isCompletingSettlement || !selectedIntentId}
              >
                {isCompletingSettlement ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Completing...
                  </>
                ) : (
                  "Complete Settlement"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Events Display */}
        <div className="mt-6 space-y-4">
          {/* Swap Intent Events */}
          {swapIntentEvents && swapIntentEvents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recent Swap Intents</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {swapIntentEvents.slice(0, 3).map((event, index) => (
                  <div key={index} className="text-xs bg-base-200 p-2 rounded">
                    <div>Intent ID: {event.args.intentId?.slice(0, 10)}...</div>
                    <div>
                      From: {event.args.fromToken} → To: {event.args.toToken}
                    </div>
                    <div>Amount: {event.args.fromAmount?.toString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Intents */}
          {userIntents && userIntents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Your Intents</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {userIntents.slice(0, 5).map((intentId, index) => (
                  <div key={index} className="text-xs bg-base-200 p-2 rounded">
                    Intent: {intentId.slice(0, 10)}...
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default YellowNetworkManager;
