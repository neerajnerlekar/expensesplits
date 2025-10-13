"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { useWriteContracts } from "wagmi/experimental";
import { Address } from "~~/components/scaffold-eth";
import { pyusdBridgeService } from "~~/services/pyusdBridge";
import { notification } from "~~/utils/scaffold-eth";
import { SUPPORTED_TOKENS, isPYUSD } from "~~/utils/tokens";

interface Settlement {
  from: string;
  to: string;
  amount: string;
  token: string;
  chainId: number;
}

interface BatchSettlementProps {
  channelId: string;
  settlements: Settlement[];
  onSettlementComplete?: (success: boolean) => void;
}

const BatchSettlement = ({ channelId, settlements, onSettlementComplete }: BatchSettlementProps) => {
  const { address, isConnected } = useAccount();
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedSettlements, setSelectedSettlements] = useState<Set<number>>(new Set());
  const [pyusdBridgeQuotes, setPyusdBridgeQuotes] = useState<Record<string, any>>({});

  const { writeContractsAsync, isPending } = useWriteContracts();

  // Note: Channel info could be used for additional validation if needed

  const handleSettlementSelection = (index: number) => {
    const newSelection = new Set(selectedSettlements);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedSettlements(newSelection);
  };

  const getBridgeQuote = async (settlement: Settlement) => {
    if (!isPYUSD(settlement.token)) return null;

    try {
      const quote = await pyusdBridgeService.getBridgeQuote({
        amount: BigInt(settlement.amount),
        fromChain: "ethereum",
        toChain: "solana",
        userEmail: "user@example.com", // In production, get from user profile
        destinationAddress: settlement.to,
      });
      return quote;
    } catch (error) {
      console.error("Error getting bridge quote:", error);
      return null;
    }
  };

  const handleGetPyusdQuote = async (settlement: Settlement) => {
    const quote = await getBridgeQuote(settlement);
    if (quote) {
      setPyusdBridgeQuotes(prev => ({
        ...prev,
        [settlement.from + settlement.to + settlement.amount]: quote,
      }));
    }
  };

  const determineSettlementRoute = (settlement: Settlement) => {
    const token = SUPPORTED_TOKENS.find(t => t.address.toLowerCase() === settlement.token.toLowerCase());

    if (!token) return "direct";

    // PYUSD with PayPal bridge support
    if (isPYUSD(settlement.token) && token.paypalBridgeSupported) {
      return "paypal";
    }

    // Yellow Network for other tokens
    if (token.hasCrossChainBridge && settlement.chainId !== 1) {
      return "yellow";
    }

    return "direct";
  };

  const handleBatchSettlement = async () => {
    if (!isConnected || !address) {
      notification.error("Please connect your wallet");
      return;
    }

    if (selectedSettlements.size === 0) {
      notification.error("Please select at least one settlement");
      return;
    }

    setIsProcessing(true);

    try {
      const selectedSettlementData = Array.from(selectedSettlements).map(index => settlements[index]);

      // Group settlements by route type
      const directSettlements = [];
      const pyusdSettlements = [];
      const yellowSettlements = [];

      for (const settlement of selectedSettlementData) {
        const route = determineSettlementRoute(settlement);

        switch (route) {
          case "paypal":
            pyusdSettlements.push(settlement);
            break;
          case "yellow":
            yellowSettlements.push(settlement);
            break;
          default:
            directSettlements.push(settlement);
        }
      }

      // Prepare batch contract calls
      const contractCalls = [];

      // Direct settlements
      for (const settlement of directSettlements) {
        contractCalls.push({
          address: "BatchPayChannel", // This would be the actual contract address
          abi: [], // Contract ABI
          functionName: "settlePYUSDDirect",
          args: [channelId, settlement.to, BigInt(settlement.amount)],
        });
      }

      // PYUSD PayPal bridge settlements
      for (const settlement of pyusdSettlements) {
        const quote = pyusdBridgeQuotes[settlement.from + settlement.to + settlement.amount];
        if (quote) {
          contractCalls.push({
            address: "BatchPayChannel",
            abi: [],
            functionName: "settlePYUSDViaPayPal",
            args: [channelId, settlement.to, BigInt(settlement.amount), quote.depositAddress],
          });
        }
      }

      // Yellow Network settlements
      if (yellowSettlements.length > 0) {
        contractCalls.push({
          address: "BatchPayChannel",
          abi: [],
          functionName: "initiateYellowSettlement",
          args: [channelId, yellowSettlements],
        });
      }

      // Execute batch settlement using EIP-5792
      const result = await writeContractsAsync({
        contracts: contractCalls,
      });

      notification.success(`Batch settlement completed! Transaction ID: ${result.id}`, { duration: 10000 });

      onSettlementComplete?.(true);
    } catch (error) {
      console.error("Error in batch settlement:", error);
      notification.error("Failed to complete batch settlement");
      onSettlementComplete?.(false);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body text-center">
          <h2 className="card-title justify-center">Connect Wallet</h2>
          <p>Please connect your wallet to perform batch settlements</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">Batch Settlement</h2>
        <p className="text-base-content/60 mb-4">
          Select settlements to process in a single transaction. PYUSD settlements can use PayPal bridge for cross-chain
          transfers.
        </p>

        <div className="space-y-4">
          {/* Settlement List */}
          <div className="space-y-2">
            {settlements.map((settlement, index) => {
              const token = SUPPORTED_TOKENS.find(t => t.address.toLowerCase() === settlement.token.toLowerCase());
              const route = determineSettlementRoute(settlement);
              const isSelected = selectedSettlements.has(index);
              const quote = pyusdBridgeQuotes[settlement.from + settlement.to + settlement.amount];

              return (
                <div key={index} className="card bg-base-200 shadow">
                  <div className="card-body p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSettlementSelection(index)}
                          className="checkbox checkbox-primary"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold">
                              {settlement.amount} {token?.symbol || "Unknown"}
                            </span>
                            <span className="badge badge-sm">
                              {route === "paypal" ? "PayPal Bridge" : route === "yellow" ? "Yellow Network" : "Direct"}
                            </span>
                          </div>
                          <div className="text-sm text-base-content/60">
                            <Address address={settlement.from} /> → <Address address={settlement.to} />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {route === "paypal" && (
                          <button className="btn btn-sm btn-outline" onClick={() => handleGetPyusdQuote(settlement)}>
                            Get Quote
                          </button>
                        )}
                        {quote && (
                          <div className="text-xs text-success">
                            <div>Time: {quote.estimatedTime}</div>
                            <div>Fee: {quote.fee}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Settlement Summary */}
          {selectedSettlements.size > 0 && (
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
              <div>
                <h3 className="font-bold">Batch Settlement Summary</h3>
                <div className="text-xs">
                  {selectedSettlements.size} settlement(s) selected
                  <br />
                  EIP-5792 batch transaction will be used for gas optimization
                  <br />
                  PYUSD settlements will use PayPal bridge for cross-chain transfers
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button
              className="btn btn-outline"
              onClick={() => setSelectedSettlements(new Set())}
              disabled={selectedSettlements.size === 0}
            >
              Clear Selection
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={handleBatchSettlement}
              disabled={isPending || isProcessing || selectedSettlements.size === 0}
            >
              {isPending || isProcessing ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Processing...
                </>
              ) : (
                `Process ${selectedSettlements.size} Settlement(s)`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchSettlement;
