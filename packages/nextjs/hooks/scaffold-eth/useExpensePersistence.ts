/**
 * Expense Persistence Hook
 * Manages expense storage and retrieval using state channel integration only
 */
import { useCallback, useState } from "react";

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
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  const addExpense = useCallback(
    (expenseData: Omit<Expense, "id" | "timestamp">) => {
      const newExpense: Expense = {
        ...expenseData,
        id: `${channelId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      };

      setExpenses(prev => [...prev, newExpense]);
    },
    [channelId],
  );

  const removeExpense = useCallback((expenseId: string) => {
    setExpenses(prev => prev.filter(expense => expense.id !== expenseId));
  }, []);

  const clearExpenses = useCallback(() => {
    setExpenses([]);
  }, []);

  return {
    expenses,
    addExpense,
    removeExpense,
    clearExpenses,
    isLoading,
    error,
  };
};
