"use client";

import { useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { useScaffoldEventHistory, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { yellowNetworkService } from "~~/services/yellowNetwork";
import type { QuoteParams, SwapIntentRequest, YellowNetworkQuote } from "~~/types/nitrolite";
import { notification } from "~~/utils/scaffold-eth";

interface Settlement {
  recipient: string;
  amount: string;
  token: string;
}

interface YellowNetworkSettlementProps {
  channelId: string;
  onSettlementComplete?: (intentId: string) => void;
}

const YellowNetworkSettlement = ({ onSettlementComplete }: YellowNetworkSettlementProps) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [settlements, setSettlements] = useState<Settlement[]>([{ recipient: "", amount: "", token: "PYUSD" }]);
  const [quotes, setQuotes] = useState<YellowNetworkQuote[]>([]);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<YellowNetworkQuote | null>(null);

  const { isPending: isInitiatingSettlement } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  // Watch for Yellow Network events
  const { data: yellowSettlementEvents } = useScaffoldEventHistory({
    contractName: "BatchPayChannel",
    eventName: "YellowSettlementInitiated",
    watch: true,
  });

  const { data: yellowSettlementCompletedEvents } = useScaffoldEventHistory({
    contractName: "BatchPayChannel",
    eventName: "YellowSettlementCompleted",
    watch: true,
  });

  const addSettlement = () => {
    setSettlements([...settlements, { recipient: "", amount: "", token: "PYUSD" }]);
  };

  const removeSettlement = (index: number) => {
    if (settlements.length > 1) {
      setSettlements(settlements.filter((_, i) => i !== index));
    }
  };

  const updateSettlement = (index: number, field: keyof Settlement, value: string) => {
    const newSettlements = [...settlements];
    newSettlements[index] = { ...newSettlements[index], [field]: value };
    setSettlements(newSettlements);
  };

  const handleGetQuotes = async () => {
    if (!address || !chainId) {
      notification.error("Please connect your wallet");
      return;
    }

    const validSettlements = settlements.filter(s => s.recipient && s.amount);
    if (validSettlements.length === 0) {
      notification.error("Please add at least one valid settlement");
      return;
    }

    setIsLoadingQuotes(true);
    try {
      const quotePromises = validSettlements.map(async settlement => {
        const quoteParams: QuoteParams = {
          fromToken: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", // PYUSD address
          toToken: "0xA0b86a33E6441b8C4C8C0C4C8C0C4C8C0C4C8C0C", // USDC placeholder
          fromAmount: BigInt(parseFloat(settlement.amount) * 1e6),
          fromChainId: chainId,
          toChainId: 42161, // Arbitrum as example
          slippageTolerance: 0.5,
        };

        return await yellowNetworkService.getQuote(quoteParams);
      });

      const quotesResult = await Promise.all(quotePromises);
      setQuotes(quotesResult);
      notification.success(`Received ${quotesResult.length} quotes from Yellow Network`);
    } catch (error) {
      console.error("Error getting quotes:", error);
      notification.error("Failed to get quotes from Yellow Network");
    } finally {
      setIsLoadingQuotes(false);
    }
  };

  const handleInitiateYellowSettlement = async () => {
    if (!address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!selectedQuote) {
      notification.error("Please select a quote first");
      return;
    }

    const validSettlements = settlements.filter(s => s.recipient && s.amount);
    if (validSettlements.length === 0) {
      notification.error("Please add at least one valid settlement");
      return;
    }

    try {
      // Create swap intent for each settlement
      const swapPromises = validSettlements.map(async settlement => {
        const swapRequest: SwapIntentRequest = {
          from: address,
          to: settlement.recipient as `0x${string}`,
          fromAmount: BigInt(parseFloat(settlement.amount) * 1e6),
          fromToken: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", // PYUSD
          toToken: "0xA0b86a33E6441b8C4C8C0C4C8C0C4C8C0C4C8C0C", // USDC placeholder
          fromChainId: chainId || 1,
          toChainId: 42161, // Arbitrum
          quoteId: selectedQuote.quoteId,
          deadline: Math.floor(Date.now() / 1000) + 3600,
        };

        return await yellowNetworkService.submitSwapIntent(swapRequest);
      });

      const swapIntents = await Promise.all(swapPromises);
      notification.success(`Initiated ${swapIntents.length} Yellow Network settlements!`);
      onSettlementComplete?.(swapIntents[0]?.intentId || "yellow-settlement");
    } catch (error) {
      console.error("Error initiating Yellow settlement:", error);
      notification.error("Failed to initiate Yellow Network settlement");
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Yellow Network Settlement</h2>
        <p className="text-base-content/60 mb-4">
          Initiate cross-chain settlements through Yellow Network for multi-token support.
        </p>

        <div className="space-y-4">
          {/* Settlements List */}
          <div className="space-y-3">
            {settlements.map((settlement, index) => (
              <div key={index} className="border border-base-300 rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Settlement #{index + 1}</h3>
                  {settlements.length > 1 && (
                    <button className="btn btn-sm btn-error" onClick={() => removeSettlement(index)}>
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Recipient</span>
                    </label>
                    <input
                      type="text"
                      placeholder="0x..."
                      className="input input-bordered input-sm"
                      value={settlement.recipient}
                      onChange={e => updateSettlement(index, "recipient", e.target.value)}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Amount</span>
                    </label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="0.00"
                      className="input input-bordered input-sm"
                      value={settlement.amount}
                      onChange={e => updateSettlement(index, "amount", e.target.value)}
                    />
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Token</span>
                    </label>
                    <select
                      className="select select-bordered select-sm"
                      value={settlement.token}
                      onChange={e => updateSettlement(index, "token", e.target.value)}
                    >
                      <option value="PYUSD">PYUSD</option>
                      <option value="USDC">USDC</option>
                      <option value="USDT">USDT</option>
                      <option value="ETH">ETH</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Settlement Button */}
          <button className="btn btn-outline btn-sm w-full" onClick={addSettlement}>
            + Add Settlement
          </button>

          {/* Quote Section */}
          <div className="border border-base-300 rounded-lg p-4">
            <h3 className="font-semibold mb-3">Yellow Network Quotes</h3>

            <div className="flex gap-2 mb-3">
              <button className="btn btn-secondary" onClick={handleGetQuotes} disabled={isLoadingQuotes}>
                {isLoadingQuotes ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Getting Quotes...
                  </>
                ) : (
                  "Get Quotes"
                )}
              </button>
            </div>

            {/* Quote Selection */}
            {quotes.length > 0 && (
              <div className="form-control mb-3">
                <label className="label">
                  <span className="label-text">Select Quote</span>
                </label>
                <select
                  className="select select-bordered"
                  value={selectedQuote?.quoteId || ""}
                  onChange={e => {
                    const quote = quotes.find(q => q.quoteId === e.target.value);
                    setSelectedQuote(quote || null);
                  }}
                >
                  <option value="">Select a quote...</option>
                  {quotes.map((quote, index) => (
                    <option key={quote.quoteId} value={quote.quoteId}>
                      Quote {index + 1}: {quote.fromAmount.toString()} → {quote.toAmount.toString()}
                      (Fee: {quote.fee.toString()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Selected Quote Details */}
            {selectedQuote && (
              <div className="alert alert-info">
                <div>
                  <h4 className="font-semibold">Selected Quote Details</h4>
                  <p>
                    From: {selectedQuote.fromAmount.toString()} → To: {selectedQuote.toAmount.toString()}
                  </p>
                  <p>Fee: {selectedQuote.fee.toString()}</p>
                  <p>Estimated Time: {selectedQuote.estimatedTime}</p>
                  <p>Route: {selectedQuote.route.join(" → ")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <button
            className="btn btn-primary w-full"
            onClick={handleInitiateYellowSettlement}
            disabled={isInitiatingSettlement || !selectedQuote}
          >
            {isInitiatingSettlement ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Initiating Settlement...
              </>
            ) : (
              "Initiate Yellow Network Settlement"
            )}
          </button>
        </div>

        {/* Yellow Network Events */}
        <div className="mt-6 space-y-4">
          {/* Settlement Initiated Events */}
          {yellowSettlementEvents && yellowSettlementEvents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recent Yellow Settlements</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {yellowSettlementEvents.slice(0, 3).map((event, index) => (
                  <div key={index} className="text-xs bg-base-200 p-2 rounded">
                    <div>Event: Yellow Settlement Initiated</div>
                    <div>Block: {event.blockNumber?.toString()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settlement Completed Events */}
          {yellowSettlementCompletedEvents && yellowSettlementCompletedEvents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Completed Yellow Settlements</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {yellowSettlementCompletedEvents.slice(0, 3).map((event, index) => (
                  <div key={index} className="text-xs bg-base-200 p-2 rounded">
                    <div>Event: Settlement Completed</div>
                    <div>Block: {event.blockNumber?.toString()}</div>
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

export default YellowNetworkSettlement;
