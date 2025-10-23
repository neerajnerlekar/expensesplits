/**
 * Expense State Channel Integration
 * Properly integrates expenses with ERC-7824 state channels via ClearNode
 */
import { useCallback, useEffect, useState } from "react";
import type { Expense } from "./useExpensePersistence";
import { useStateChannel } from "./useStateChannel";
import { useAccount } from "wagmi";
import { stateChannelClient } from "~~/services/stateChannelClient";
import { notification } from "~~/utils/scaffold-eth";

export interface ExpenseStateChannelReturn {
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, "id" | "timestamp">) => Promise<void>;
  removeExpense: (expenseId: string) => Promise<void>;
  clearExpenses: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
  isAuthenticated: boolean;
}

export const useExpenseStateChannel = (channelId: string): ExpenseStateChannelReturn => {
  const { address } = useAccount();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use the existing state channel hook for connection status
  const { isConnected, isAuthenticated, connect } = useStateChannel();

  // Auto-connect to ClearNode when component mounts (with debouncing)
  useEffect(() => {
    if (address && !isConnected && !isLoading) {
      // Add a small delay to prevent multiple simultaneous connections
      const timer = setTimeout(() => {
        connect().catch(console.error);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [address, isConnected, isLoading, connect]);

  // Load the channel when component mounts
  useEffect(() => {
    const loadChannel = async () => {
      if (channelId && address) {
        try {
          console.log(`🔄 Loading channel ${channelId} for address ${address}`);

          // For now, we'll use a simple approach with the current user and a placeholder participant
          // In a real app, you'd fetch the actual participants from the blockchain or API
          const participants = [
            address as `0x${string}`,
            "0x239897464D9B3C40b8EF695A0E1236e220B2a311" as `0x${string}`, // From the URL you provided
          ];

          await stateChannelClient.loadChannel(channelId, participants);
          console.log("✅ Channel loaded successfully");
        } catch (error) {
          console.error("Failed to load channel:", error);
          setError("Failed to load channel");
        }
      }
    };

    loadChannel();
  }, [channelId, address]);

  // Load expenses from localStorage on mount
  useEffect(() => {
    const loadExpenses = () => {
      try {
        const savedExpenses = localStorage.getItem(`expenses_${channelId}`);
        if (savedExpenses) {
          const parsedExpenses = JSON.parse(savedExpenses);
          setExpenses(parsedExpenses);
        }
      } catch (err) {
        console.error("Error loading expenses:", err);
      }
    };

    loadExpenses();
  }, [channelId]);

  // Calculate new balances based on expenses
  const calculateBalances = useCallback((participants: string[], expenses: Expense[]): bigint[] => {
    const balances = new Array(participants.length).fill(0n);

    expenses.forEach(expense => {
      const paidByIndex = participants.indexOf(expense.paidBy);
      const splitAmount = BigInt(Math.floor(parseFloat(expense.amount) * 100)) / BigInt(expense.participants.length);

      // Add to payer's balance (they paid)
      if (paidByIndex !== -1) {
        balances[paidByIndex] += BigInt(Math.floor(parseFloat(expense.amount) * 100));
      }

      // Subtract from all participants (they owe)
      expense.participants.forEach(participant => {
        const participantIndex = participants.indexOf(participant);
        if (participantIndex !== -1) {
          balances[participantIndex] -= splitAmount;
        }
      });
    });

    return balances;
  }, []);

  // Add expense with ERC-7824 state channel integration
  const addExpense = useCallback(
    async (expenseData: Omit<Expense, "id" | "timestamp">) => {
      // Check both connection and authentication status
      if (!isConnected) {
        const errorMessage = "Not connected to ClearNode. Please connect first.";
        setError(errorMessage);
        notification.error(errorMessage);
        return;
      }

      if (!isAuthenticated) {
        const errorMessage = "Not authenticated with ClearNode. Please wait for authentication to complete.";
        setError(errorMessage);
        notification.error(errorMessage);
        return;
      }

      // Check if channel is loaded
      const currentChannel = stateChannelClient.getCurrentChannel();
      if (!currentChannel) {
        const errorMessage = "No active channel found. Please ensure you're on the correct channel page.";
        setError(errorMessage);
        notification.error(errorMessage);
        return;
      }

      if (!address) {
        const errorMessage = "Wallet not connected";
        setError(errorMessage);
        notification.error(errorMessage);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const newExpense: Expense = {
          ...expenseData,
          id: `${channelId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
        };

        // Update local state first
        const updatedExpenses = [...expenses, newExpense];
        setExpenses(updatedExpenses);

        // Save to localStorage as backup
        localStorage.setItem(`expenses_${channelId}`, JSON.stringify(updatedExpenses));

        // Get current channel participants
        const currentChannel = stateChannelClient.getCurrentChannel();
        if (!currentChannel) {
          throw new Error("No active channel found");
        }

        const participants = currentChannel.participants.map(p => p.address);

        // Calculate new balances
        const newBalances = calculateBalances(participants, updatedExpenses);

        // Broadcast state update via ERC-7824
        await stateChannelClient.updateChannelState(newBalances);

        notification.success("Expense added and broadcast to all participants!");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to add expense";
        setError(errorMessage);
        notification.error(errorMessage);

        // Revert local state on error
        setExpenses(expenses);
      } finally {
        setIsLoading(false);
      }
    },
    [expenses, channelId, address, isAuthenticated, calculateBalances],
  );

  // Remove expense with state channel integration
  const removeExpense = useCallback(
    async (expenseId: string) => {
      if (!isAuthenticated) {
        notification.error("Not connected to ClearNode");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const updatedExpenses = expenses.filter(expense => expense.id !== expenseId);
        setExpenses(updatedExpenses);

        // Save to localStorage
        if (updatedExpenses.length > 0) {
          localStorage.setItem(`expenses_${channelId}`, JSON.stringify(updatedExpenses));
        } else {
          localStorage.removeItem(`expenses_${channelId}`);
        }

        // Get current channel participants
        const currentChannel = stateChannelClient.getCurrentChannel();
        if (!currentChannel) {
          throw new Error("No active channel found");
        }

        const participants = currentChannel.participants.map(p => p.address);

        // Recalculate balances
        const newBalances = calculateBalances(participants, updatedExpenses);

        // Broadcast state update
        await stateChannelClient.updateChannelState(newBalances);

        notification.success("Expense removed and state updated!");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to remove expense";
        setError(errorMessage);
        notification.error(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [expenses, channelId, isAuthenticated, calculateBalances],
  );

  // Clear all expenses
  const clearExpenses = useCallback(async () => {
    if (!isAuthenticated) {
      notification.error("Not connected to ClearNode");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setExpenses([]);
      localStorage.removeItem(`expenses_${channelId}`);

      // Get current channel participants
      const currentChannel = stateChannelClient.getCurrentChannel();
      if (!currentChannel) {
        throw new Error("No active channel found");
      }

      const participants = currentChannel.participants.map(p => p.address);

      // Reset balances to initial state
      const initialBalances = new Array(participants.length).fill(0n);
      await stateChannelClient.updateChannelState(initialBalances);

      notification.success("All expenses cleared and state reset!");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to clear expenses";
      setError(errorMessage);
      notification.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [channelId, isAuthenticated]);

  return {
    expenses,
    addExpense,
    removeExpense,
    clearExpenses,
    isLoading,
    error,
    isConnected,
    isAuthenticated,
  };
};
