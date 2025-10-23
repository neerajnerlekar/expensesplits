/**
 * Expense Persistence Hook
 * Manages expense storage and retrieval using localStorage and state channel integration
 */
import { useCallback, useEffect, useState } from "react";

export interface Expense {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
  participants: string[];
  timestamp: number;
}

export interface UseExpensePersistenceReturn {
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, "id" | "timestamp">) => void;
  removeExpense: (expenseId: string) => void;
  clearExpenses: () => void;
  isLoading: boolean;
  error: string | null;
}

export const useExpensePersistence = (channelId: string): UseExpensePersistenceReturn => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load expenses from localStorage on mount
  useEffect(() => {
    const loadExpenses = () => {
      try {
        setIsLoading(true);
        setError(null);

        const savedExpenses = localStorage.getItem(`expenses_${channelId}`);
        if (savedExpenses) {
          const parsedExpenses = JSON.parse(savedExpenses);
          setExpenses(parsedExpenses);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load expenses";
        setError(errorMessage);
        console.error("Error loading expenses from localStorage:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadExpenses();
  }, [channelId]);

  // Save expenses to localStorage whenever expenses change
  useEffect(() => {
    if (expenses.length > 0) {
      try {
        localStorage.setItem(`expenses_${channelId}`, JSON.stringify(expenses));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to save expenses";
        setError(errorMessage);
        console.error("Error saving expenses to localStorage:", err);
      }
    }
  }, [expenses, channelId]);

  const addExpense = useCallback(
    (expenseData: Omit<Expense, "id" | "timestamp">) => {
      const newExpense: Expense = {
        ...expenseData,
        id: `${channelId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      setExpenses(prev => {
        const updated = [...prev, newExpense];
        // Save immediately to localStorage
        try {
          localStorage.setItem(`expenses_${channelId}`, JSON.stringify(updated));
        } catch (err) {
          console.error("Error saving expenses:", err);
        }
        return updated;
      });
    },
    [channelId],
  );

  const removeExpense = useCallback(
    (expenseId: string) => {
      setExpenses(prev => {
        const updated = prev.filter(expense => expense.id !== expenseId);
        // Save immediately to localStorage
        try {
          if (updated.length > 0) {
            localStorage.setItem(`expenses_${channelId}`, JSON.stringify(updated));
          } else {
            localStorage.removeItem(`expenses_${channelId}`);
          }
        } catch (err) {
          console.error("Error saving expenses:", err);
        }
        return updated;
      });
    },
    [channelId],
  );

  const clearExpenses = useCallback(() => {
    setExpenses([]);
    try {
      localStorage.removeItem(`expenses_${channelId}`);
    } catch (err) {
      console.error("Error clearing expenses:", err);
    }
  }, [channelId]);

  return {
    expenses,
    addExpense,
    removeExpense,
    clearExpenses,
    isLoading,
    error,
  };
};
