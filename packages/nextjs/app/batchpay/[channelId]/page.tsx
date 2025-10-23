"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import BatchSettlement from "../_components/BatchSettlement";
import ExpenseForm from "../_components/ExpenseForm";
import Navigation from "../_components/Navigation";
import { useAccount } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useExpenseStateChannel } from "~~/hooks/scaffold-eth/useExpenseStateChannel";
import { notification } from "~~/utils/scaffold-eth";
import { PYUSD_CONSTANTS, SUPPORTED_TOKENS, isPYUSD } from "~~/utils/tokens";

const ChannelDetailPage = () => {
  const params = useParams();
  const channelId = params.channelId as string;
  const { address, isConnected } = useAccount();
  const [selectedToken, setSelectedToken] = useState<string>(PYUSD_CONSTANTS.ETHEREUM_ADDRESS);
  const [preferredChainId, setPreferredChainId] = useState(1);
  const [usePYUSD, setUsePYUSD] = useState(true);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  // Use expense state channel integration
  const {
    expenses,
    addExpense,
    clearExpenses,
    isLoading: isLoadingExpenses,
    error: expenseError,
    isConnected: clearNodeConnected,
    isAuthenticated: clearNodeAuthenticated,
  } = useExpenseStateChannel(channelId);

  // Get channel information
  const { data: channelInfo, isLoading: isLoadingChannel } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getChannel",
    args: [channelId as `0x${string}`],
  });

  // Get user preferences
  const { data: userPreference, isLoading: isLoadingPreference } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getUserPreference",
    args: [channelId as `0x${string}`, address as `0x${string}`],
  });

  // Get channel settlements
  const { data: settlements, isLoading: isLoadingSettlements } = useScaffoldReadContract({
    contractName: "BatchPayChannel",
    functionName: "getChannelSettlements",
    args: [channelId as `0x${string}`],
  });

  const { writeContractAsync: writeBatchPayChannelAsync, isPending: isSettingPreference } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const handleSetPreference = async () => {
    if (!isConnected || !address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      await writeBatchPayChannelAsync({
        functionName: "setUserPreference",
        args: [
          channelId as `0x${string}`,
          selectedToken,
          BigInt(preferredChainId),
          usePYUSD,
          0, // BridgePreference.AUTO
          paypalEmail,
        ],
      });

      notification.success("User preference updated successfully!");
    } catch (error) {
      console.error("Error setting preference:", error);
      notification.error("Failed to set user preference");
    }
  };

  const handleAddExpense = async (expense: any) => {
    await addExpense(expense);
    setShowExpenseForm(false);
  };

  const handleClearExpenses = async () => {
    await clearExpenses();
  };

  const handleOpenExpenseForm = () => {
    if (!isConnected || !address) {
      notification.error("Please connect your wallet");
      return;
    }
    setShowExpenseForm(true);
  };

  if (isLoadingChannel) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!channelInfo) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">Channel Not Found</h2>
            <p>This channel does not exist or you don&apos;t have access to it.</p>
            <Link href="/batchpay" className="btn btn-primary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [participants, , , , isOpen, inDispute, chainId] = channelInfo;

  return (
    <div className="min-h-screen bg-base-200">
      <Navigation />
      <div className="flex items-center space-y-4 flex-col flex-grow pt-10">
        <div className="px-5 mb-8 flex flex-col items-center max-w-5xl space-y-4">
          <h1 className="text-center my-0">
            <span className="block text-4xl font-bold">Channel Details</span>
            <span className="block text-xl text-base-content/60 mt-2">Channel {channelId.slice(0, 8)}...</span>
          </h1>
        </div>

        <div className="w-full max-w-6xl space-y-6">
          {/* Channel Status */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Channel Status</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="stat">
                  <div className="stat-title">Status</div>
                  <div className="stat-value text-lg">
                    {isOpen ? (
                      <span className="badge badge-success">Open</span>
                    ) : (
                      <span className="badge badge-error">Closed</span>
                    )}
                    {inDispute && <span className="badge badge-warning ml-2">In Dispute</span>}
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-title">Participants</div>
                  <div className="stat-value text-lg">{participants.length}</div>
                </div>
                <div className="stat">
                  <div className="stat-title">Chain ID</div>
                  <div className="stat-value text-lg">{chainId.toString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Participants List */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Participants</h2>
              <div className="space-y-2">
                {participants.map((participant: string, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-base-200 p-3 rounded">
                    <div className="flex items-center space-x-2">
                      <Address address={participant} />
                      {participant.toLowerCase() === address?.toLowerCase() && (
                        <span className="badge badge-primary">You</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PYUSD Token Selector */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Settlement Preferences</h2>
              <p className="text-base-content/60 mb-4">
                Choose your preferred token and chain for settlements. PYUSD provides stable value tracking.
              </p>

              <div className="space-y-4">
                {/* Token Selection */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Preferred Token</span>
                  </label>
                  <select
                    value={selectedToken}
                    onChange={e => {
                      const value = e.target.value;
                      setSelectedToken(value);
                      setUsePYUSD(isPYUSD(value));
                    }}
                    className="select select-bordered w-full"
                  >
                    {SUPPORTED_TOKENS.map(token => (
                      <option key={token.symbol} value={token.address}>
                        {token.symbol} {token.isStablecoin ? "(Stable)" : ""}{" "}
                        {token.paypalBridgeSupported ? "(PayPal Bridge)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chain Selection */}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Preferred Chain</span>
                  </label>
                  <select
                    value={preferredChainId}
                    onChange={e => setPreferredChainId(Number(e.target.value))}
                    className="select select-bordered w-full"
                  >
                    <option value={1}>Ethereum</option>
                    <option value={42161}>Arbitrum</option>
                    <option value={10}>Optimism</option>
                    <option value={8453}>Base</option>
                    <option value={137}>Polygon</option>
                  </select>
                </div>

                {/* PYUSD Options */}
                {usePYUSD && (
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
                      <h3 className="font-bold">PYUSD Selected</h3>
                      <div className="text-xs">
                        PayPal USD provides stable 1:1 USD tracking. Use PayPal bridge for cross-chain transfers.
                      </div>
                    </div>
                  </div>
                )}

                {/* PayPal Email (for PYUSD bridge) */}
                {usePYUSD && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">PayPal Email (for cross-chain bridge)</span>
                    </label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={e => setPaypalEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="input input-bordered w-full"
                    />
                    <label className="label">
                      <span className="label-text-alt">Optional: Used for PayPal bridge cross-chain transfers</span>
                    </label>
                  </div>
                )}

                {/* Save Preferences */}
                <div className="card-actions justify-end">
                  <button className="btn btn-primary" onClick={handleSetPreference} disabled={isSettingPreference}>
                    {isSettingPreference ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Saving...
                      </>
                    ) : (
                      "Save Preferences"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Current User Preferences */}
          {!isLoadingPreference && userPreference && (
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Your Current Preferences</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-base-content/60">Preferred Token</div>
                    <div className="font-mono text-sm">
                      {userPreference[0] === PYUSD_CONSTANTS.ETHEREUM_ADDRESS ? "PYUSD" : userPreference[0]}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">Preferred Chain</div>
                    <div className="font-mono text-sm">{userPreference[1].toString()}</div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">Use PYUSD</div>
                    <div className="font-mono text-sm">{userPreference[2] ? "Yes" : "No"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-base-content/60">Bridge Preference</div>
                    <div className="font-mono text-sm">{userPreference[3].toString()}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Expenses List */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="card-title">Expenses {expenses.length > 0 && `(${expenses.length})`}</h2>
                  <div className="flex items-center gap-2">
                    <div className={`badge ${clearNodeConnected ? "badge-success" : "badge-error"}`}>
                      {clearNodeConnected ? "ClearNode Connected" : "ClearNode Disconnected"}
                    </div>
                    {clearNodeAuthenticated && <div className="badge badge-info">Authenticated</div>}
                  </div>
                </div>
                {expenses.length > 0 && (
                  <button className="btn btn-sm btn-outline btn-error" onClick={handleClearExpenses}>
                    Clear All
                  </button>
                )}
              </div>

              {!clearNodeConnected && (
                <div className="alert alert-warning mb-4">
                  <span>
                    ⚠️ ClearNode not connected. Expenses will only be stored locally and won&apos;t sync with other
                    participants.
                  </span>
                </div>
              )}

              {expenseError && (
                <div className="alert alert-error mb-4">
                  <span>Error loading expenses: {expenseError}</span>
                </div>
              )}

              {isLoadingExpenses ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-lg"></span>
                </div>
              ) : expenses.length > 0 ? (
                <div className="space-y-3">
                  {expenses.map((expense, index) => (
                    <div key={expense.id || index} className="bg-base-200 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold">{expense.description}</h3>
                          <p className="text-sm text-base-content/60">
                            ${expense.amount} • Paid by{" "}
                            {expense.paidBy === address
                              ? "You"
                              : expense.paidBy.slice(0, 6) + "..." + expense.paidBy.slice(-4)}
                          </p>
                          <p className="text-xs text-base-content/50">
                            Split between {expense.participants.length} participant
                            {expense.participants.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">${expense.amount}</div>
                          <div className="text-xs text-base-content/50">
                            {new Date(expense.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-base-content/60">
                  <p>No expenses added yet.</p>
                  <p className="text-sm">Click &quot;Add Expense&quot; to get started.</p>
                </div>
              )}
            </div>
          </div>

          {/* Settlements */}
          {!isLoadingSettlements && settlements && settlements.length > 0 && (
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Settlements</h2>
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Amount</th>
                        <th>Token</th>
                        <th>Chain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.map((settlement: any, index: number) => (
                        <tr key={index}>
                          <td>
                            <Address address={settlement.from} />
                          </td>
                          <td>
                            <Address address={settlement.to} />
                          </td>
                          <td>{settlement.amount.toString()}</td>
                          <td>
                            <Address address={settlement.fromToken} />
                          </td>
                          <td>{settlement.fromChainId.toString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Batch Settlement Component */}
          {!isOpen && settlements && settlements.length > 0 && (
            <BatchSettlement
              channelId={channelId}
              settlements={settlements.map((s: any) => ({
                from: s.from,
                to: s.to,
                amount: s.amount.toString(),
                token: s.fromToken,
                chainId: Number(s.fromChainId),
              }))}
              onSettlementComplete={success => {
                if (success) {
                  notification.success("Batch settlement completed successfully!");
                } else {
                  notification.error("Batch settlement failed");
                }
              }}
            />
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <Link href="/batchpay" className="btn btn-outline">
              Back to Dashboard
            </Link>
            {isOpen && (
              <button className="btn btn-primary" onClick={handleOpenExpenseForm} disabled={!isConnected}>
                Add Expense
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <ExpenseForm
          channelId={channelId}
          participants={[...participants]}
          onExpenseAdded={handleAddExpense}
          onClose={() => setShowExpenseForm(false)}
        />
      )}
    </div>
  );
};

export default ChannelDetailPage;
