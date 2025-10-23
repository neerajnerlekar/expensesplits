"use client";

import { useEffect, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { type PYUSDBalance, pyusdBridgeService } from "~~/services/pyusdBridge";
import { notification } from "~~/utils/scaffold-eth";

interface PYUSDSettlementProps {
  channelId: string;
  onSettlementComplete?: (settlementId: string) => void;
}

const PYUSDSettlement = ({ channelId, onSettlementComplete }: PYUSDSettlementProps) => {
  const { address } = useAccount();
  const chainId = useChainId();
  const [settlementData, setSettlementData] = useState({
    recipient: "",
    amount: "",
  });
  const [pyusdBalance, setPyusdBalance] = useState<PYUSDBalance | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const { writeContractAsync: settleDirectAsync, isPending: isDirectSettling } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  // Load PYUSD balance on component mount and when address/chain changes
  useEffect(() => {
    const loadBalance = async () => {
      if (!address || !chainId) return;

      setIsLoadingBalance(true);
      try {
        const balance = await pyusdBridgeService.getPYUSDBalance(address, chainId);
        setPyusdBalance(balance);
      } catch (error) {
        console.error("Failed to load PYUSD balance:", error);
        notification.error("Failed to load PYUSD balance");
      } finally {
        setIsLoadingBalance(false);
      }
    };

    loadBalance();
  }, [address, chainId]);

  // Watch for PYUSD settlement events
  const { data: directTransferEvents } = useScaffoldEventHistory({
    contractName: "BatchPayChannel",
    eventName: "PYUSDDirectTransfer",
    watch: true,
  });

  const handleDirectSettlement = async () => {
    if (!address || !chainId) {
      notification.error("Please connect your wallet");
      return;
    }

    if (!settlementData.recipient || !settlementData.amount) {
      notification.error("Please fill in recipient and amount");
      return;
    }

    try {
      // Parse amount using PYUSD bridge service
      const amountWei = pyusdBridgeService.parsePYUSDAmount(settlementData.amount, chainId);

      // Check if user has sufficient balance
      if (pyusdBalance && amountWei > pyusdBalance.balance) {
        notification.error("Insufficient PYUSD balance");
        return;
      }

      // Validate recipient address
      if (!settlementData.recipient) {
        notification.error("Recipient address is required");
        return;
      }

      // Use PYUSD bridge service for same-chain transfer
      const transfer = await pyusdBridgeService.transferPYUSD(
        address,
        settlementData.recipient as `0x${string}`,
        amountWei,
        chainId,
      );

      // Also call the smart contract for settlement tracking
      await settleDirectAsync({
        functionName: "settlePYUSDDirect",
        args: [channelId as `0x${string}`, settlementData.recipient as `0x${string}`, amountWei],
      });

      notification.success(`PYUSD transfer initiated: ${transfer.transactionHash}`);
      if (transfer.transactionHash) {
        onSettlementComplete?.(transfer.transactionHash);
      }

      // Refresh balance after transfer
      const newBalance = await pyusdBridgeService.getPYUSDBalance(address, chainId);
      setPyusdBalance(newBalance);
    } catch (error) {
      console.error("Error in direct settlement:", error);
      notification.error("Failed to initiate direct settlement");
    }
  };

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <h2 className="card-title">PYUSD Settlement</h2>
        <p className="text-base-content/60 mb-4">
          Settle PYUSD directly on the same chain. Cross-chain transfers are not supported.
        </p>

        {/* PYUSD Balance Display */}
        <div className="bg-base-200 p-4 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">Your PYUSD Balance</h3>
          {isLoadingBalance ? (
            <div className="flex items-center gap-2">
              <span className="loading loading-spinner loading-sm"></span>
              <span>Loading balance...</span>
            </div>
          ) : pyusdBalance ? (
            <div>
              <div className="text-2xl font-bold">
                {pyusdBridgeService.formatPYUSDAmount(pyusdBalance.balance, chainId)}
              </div>
              <div className="text-sm text-base-content/60">
                Last updated: {new Date(pyusdBalance.lastUpdated).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div className="text-base-content/60">Balance not available</div>
          )}
        </div>

        <div className="space-y-4">
          {/* Recipient Address */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Recipient Address</span>
            </label>
            <input
              type="text"
              placeholder="0x..."
              className="input input-bordered"
              value={settlementData.recipient}
              onChange={e => setSettlementData({ ...settlementData, recipient: e.target.value })}
            />
          </div>

          {/* Amount */}
          <div className="form-control">
            <label className="label">
              <span className="label-text">Amount (PYUSD)</span>
            </label>
            <input
              type="number"
              step="0.000001"
              placeholder="0.00"
              className="input input-bordered"
              value={settlementData.amount}
              onChange={e => setSettlementData({ ...settlementData, amount: e.target.value })}
            />
            {pyusdBalance && (
              <label className="label">
                <span className="label-text-alt">
                  Available: {pyusdBridgeService.formatPYUSDAmount(pyusdBalance.balance, chainId)}
                </span>
              </label>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              className="btn btn-primary flex-1"
              onClick={handleDirectSettlement}
              disabled={isDirectSettling || !settlementData.recipient || !settlementData.amount}
            >
              {isDirectSettling ? (
                <>
                  <span className="loading loading-spinner loading-sm"></span>
                  Transferring...
                </>
              ) : (
                "Transfer PYUSD"
              )}
            </button>
          </div>
        </div>

        {/* Transfer Events */}
        <div className="mt-6 space-y-4">
          {/* Direct Transfer Events */}
          {directTransferEvents && directTransferEvents.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recent PYUSD Transfers</h3>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {directTransferEvents.slice(0, 3).map((event, index) => (
                  <div key={index} className="text-xs bg-base-200 p-2 rounded">
                    <div>
                      From: <Address address={event.args.from} />
                    </div>
                    <div>
                      To: <Address address={event.args.to} />
                    </div>
                    <div>Amount: {pyusdBridgeService.formatPYUSDAmount(event.args.amount || 0n, chainId)}</div>
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

export default PYUSDSettlement;
