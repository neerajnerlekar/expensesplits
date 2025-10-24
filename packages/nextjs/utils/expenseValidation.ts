/**
 * Expense Validation Utilities
 * Ensures expense data integrity and consistency across participants
 */

export interface Expense {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
  participants: string[];
  timestamp: number;
}

export interface ExpenseValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a single expense
 */
export function validateExpense(expense: Expense): ExpenseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields validation
  if (!expense.id || typeof expense.id !== "string") {
    errors.push("Expense ID is required and must be a string");
  }

  if (!expense.description || typeof expense.description !== "string" || expense.description.trim().length === 0) {
    errors.push("Description is required and cannot be empty");
  }

  if (!expense.amount || typeof expense.amount !== "string") {
    errors.push("Amount is required and must be a string");
  } else {
    const amount = parseFloat(expense.amount);
    if (isNaN(amount) || amount <= 0) {
      errors.push("Amount must be a positive number");
    }
    if (amount > 1000000) {
      warnings.push("Amount is very large, please verify");
    }
  }

  if (!expense.paidBy || typeof expense.paidBy !== "string") {
    errors.push("PaidBy is required and must be a string");
  }

  if (!expense.participants || !Array.isArray(expense.participants)) {
    errors.push("Participants must be an array");
  } else if (expense.participants.length === 0) {
    errors.push("At least one participant is required");
  }

  if (!expense.timestamp || typeof expense.timestamp !== "number") {
    errors.push("Timestamp is required and must be a number");
  } else {
    const now = Date.now();
    const expenseTime = expense.timestamp;
    if (expenseTime > now + 60000) {
      // 1 minute in future
      warnings.push("Expense timestamp is in the future");
    }
    if (expenseTime < now - 86400000 * 30) {
      // 30 days ago
      warnings.push("Expense timestamp is very old");
    }
  }

  // Address validation
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  if (expense.paidBy && !addressRegex.test(expense.paidBy)) {
    errors.push("PaidBy must be a valid Ethereum address");
  }

  expense.participants.forEach((participant, index) => {
    if (!addressRegex.test(participant)) {
      errors.push(`Participant ${index + 1} must be a valid Ethereum address`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates an array of expenses
 */
export function validateExpenses(expenses: Expense[]): ExpenseValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(expenses)) {
    errors.push("Expenses must be an array");
    return { isValid: false, errors, warnings };
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  expenses.forEach((expense, index) => {
    if (ids.has(expense.id)) {
      errors.push(`Duplicate expense ID found at index ${index}: ${expense.id}`);
    }
    ids.add(expense.id);

    // Validate individual expense
    const validation = validateExpense(expense);
    if (!validation.isValid) {
      errors.push(`Expense at index ${index} is invalid: ${validation.errors.join(", ")}`);
    }
    warnings.push(...validation.warnings.map(w => `Expense at index ${index}: ${w}`));
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Compares two expense arrays for consistency
 */
export function compareExpenseArrays(
  expenses1: Expense[],
  expenses2: Expense[],
): {
  areConsistent: boolean;
  differences: string[];
} {
  const differences: string[] = [];

  if (expenses1.length !== expenses2.length) {
    differences.push(`Different number of expenses: ${expenses1.length} vs ${expenses2.length}`);
  }

  // Create maps for easier comparison
  const map1 = new Map(expenses1.map(e => [e.id, e]));
  const map2 = new Map(expenses2.map(e => [e.id, e]));

  // Check for missing expenses
  for (const [id, expense] of map1) {
    if (!map2.has(id)) {
      differences.push(`Expense ${id} missing in second array`);
    } else {
      const expense2 = map2.get(id)!;
      if (JSON.stringify(expense) !== JSON.stringify(expense2)) {
        differences.push(`Expense ${id} has different data`);
      }
    }
  }

  for (const [id] of map2) {
    if (!map1.has(id)) {
      differences.push(`Expense ${id} missing in first array`);
    }
  }

  return {
    areConsistent: differences.length === 0,
    differences,
  };
}

/**
 * Sanitizes expense data to prevent XSS and other security issues
 */
export function sanitizeExpense(expense: Expense): Expense {
  return {
    ...expense,
    description: expense.description.trim().slice(0, 500), // Limit length and trim
    amount: parseFloat(expense.amount).toString(), // Ensure numeric format
    paidBy: expense.paidBy.toLowerCase(), // Normalize address
    participants: expense.participants.map(p => p.toLowerCase()), // Normalize addresses
  };
}
