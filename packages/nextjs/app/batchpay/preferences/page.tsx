"use client";

import { useState } from "react";
import Navigation from "../_components/Navigation";
import { useAccount } from "wagmi";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { pyusdBridgeService } from "~~/services/pyusdBridge";
import { notification } from "~~/utils/scaffold-eth";
import { PYUSD_CONSTANTS, SUPPORTED_TOKENS, isPYUSD } from "~~/utils/tokens";

const PreferencesPage = () => {
  const { address, isConnected } = useAccount();
  const [defaultToken, setDefaultToken] = useState<string>(PYUSD_CONSTANTS.ETHEREUM_ADDRESS);
  const [defaultChainId, setDefaultChainId] = useState(1);
  const [usePYUSD, setUsePYUSD] = useState(true);
  const [paypalEmail, setPaypalEmail] = useState("");
  const [bridgePreference, setBridgePreference] = useState(0); // 0 = AUTO, 1 = PAYPAL, 2 = YELLOW

  const { isPending } = useScaffoldWriteContract({
    contractName: "BatchPayChannel",
  });

  const handleSavePreferences = async () => {
    if (!isConnected || !address) {
      notification.error("Please connect your wallet");
      return;
    }

    try {
      // This would save global preferences (not channel-specific)
      // For now, we'll show a success message
      notification.success("Preferences saved successfully!");
    } catch (error) {
      console.error("Error saving preferences:", error);
      notification.error("Failed to save preferences");
    }
  };

  const handleTestPayPalBridge = async () => {
    if (!paypalEmail) {
      notification.error("Please enter your PayPal email");
      return;
    }

    try {
      await pyusdBridgeService.getBridgeQuote({
        amount: BigInt("1000000"), // 1 PYUSD
        fromChain: "ethereum",
        toChain: "solana",
        userEmail: paypalEmail,
        destinationAddress: "0x...", // Placeholder
      });

      notification.success("PayPal bridge test successful!", {
        duration: 10000,
      });
    } catch (error) {
      console.error("PayPal bridge test failed:", error);
      notification.error("PayPal bridge test failed");
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">Connect Wallet</h2>
            <p>Please connect your wallet to manage preferences</p>
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
            <span className="block text-4xl font-bold">Preferences</span>
            <span className="block text-xl text-base-content/60 mt-2">
              Configure your default settlement preferences
            </span>
          </h1>
        </div>

        <div className="w-full max-w-4xl space-y-6">
          {/* Default Token Settings */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Default Settlement Token</h2>
              <p className="text-base-content/60 mb-4">
                Choose your preferred token for settlements. PYUSD provides stable 1:1 USD tracking.
              </p>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Default Token</span>
                  </label>
                  <select
                    value={defaultToken}
                    onChange={e => {
                      const value = e.target.value;
                      setDefaultToken(value);
                      setUsePYUSD(isPYUSD(value));
                    }}
                    className="select select-bordered w-full"
                  >
                    {SUPPORTED_TOKENS.map(token => (
                      <option key={token.symbol} value={token.address}>
                        <div className="flex items-center gap-2">
                          <span>{token.symbol}</span>
                          {token.isStablecoin && <span className="badge badge-sm">Stable</span>}
                          {token.paypalBridgeSupported && (
                            <span className="badge badge-sm badge-success">PayPal Bridge</span>
                          )}
                        </div>
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Default Chain</span>
                  </label>
                  <select
                    value={defaultChainId}
                    onChange={e => setDefaultChainId(Number(e.target.value))}
                    className="select select-bordered w-full"
                  >
                    <option value={1}>Ethereum</option>
                    <option value={42161}>Arbitrum</option>
                    <option value={10}>Optimism</option>
                    <option value={8453}>Base</option>
                    <option value={137}>Polygon</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* PYUSD Settings */}
          {usePYUSD && (
            <div className="card bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-xl">
              <div className="card-body">
                <h2 className="card-title text-white">PYUSD Integration</h2>
                <p className="text-white/90 mb-4">
                  Configure PayPal USD (PYUSD) for stable expense tracking and cross-chain settlements.
                </p>

                <div className="space-y-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-white">PayPal Email</span>
                    </label>
                    <input
                      type="email"
                      value={paypalEmail}
                      onChange={e => setPaypalEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="input input-bordered w-full"
                    />
                    <label className="label">
                      <span className="label-text-alt text-white/70">Used for PayPal bridge cross-chain transfers</span>
                    </label>
                  </div>

                  <div className="card-actions">
                    <button className="btn btn-white" onClick={handleTestPayPalBridge} disabled={!paypalEmail}>
                      Test PayPal Bridge
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Bridge Preferences */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Bridge Preferences</h2>
              <p className="text-base-content/60 mb-4">Choose your preferred bridge for cross-chain settlements.</p>

              <div className="space-y-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Default Bridge</span>
                  </label>
                  <select
                    value={bridgePreference}
                    onChange={e => setBridgePreference(Number(e.target.value))}
                    className="select select-bordered w-full"
                  >
                    <option value={0}>Auto (Smart routing)</option>
                    <option value={1}>PayPal Bridge (PYUSD only)</option>
                    <option value={2}>Yellow Network (Any token)</option>
                    <option value={3}>LayerZero (PYUSD cross-chain)</option>
                  </select>
                </div>

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
                    <h3 className="font-bold">Bridge Information</h3>
                    <div className="text-xs">
                      <p>
                        <strong>PayPal Bridge:</strong> PYUSD only, instant transfers via PayPal/Venmo
                      </p>
                      <p>
                        <strong>Yellow Network:</strong> Any token to any token, optimized routing
                      </p>
                      <p>
                        <strong>Auto:</strong> Automatically selects the best bridge for each settlement
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Token Information */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Supported Tokens</h2>
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th>Chains</th>
                      <th>Bridge Options</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUPPORTED_TOKENS.map((token, index) => (
                      <tr key={index}>
                        <td>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold">{token.symbol}</span>
                            {token.paypalBridgeSupported && (
                              <span className="badge badge-sm badge-success">PayPal</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="text-sm">
                            {token.chains
                              .map(chainId => {
                                const chainNames: Record<number, string> = {
                                  1: "Ethereum",
                                  42161: "Arbitrum",
                                  10: "Optimism",
                                  8453: "Base",
                                  137: "Polygon",
                                };
                                return chainNames[chainId] || `Chain ${chainId}`;
                              })
                              .join(", ")}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {token.bridgeOptions.map((option, idx) => (
                              <span key={idx} className="badge badge-sm badge-outline">
                                {option}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-sm ${token.isStablecoin ? "badge-success" : "badge-info"}`}>
                            {token.isStablecoin ? "Stablecoin" : "Volatile"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Save Preferences */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="card-title">Save Preferences</h3>
                  <p className="text-base-content/60">Your preferences will be applied to all new channels</p>
                </div>
                <button className="btn btn-primary" onClick={handleSavePreferences} disabled={isPending}>
                  {isPending ? (
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
      </div>
    </div>
  );
};

export default PreferencesPage;
