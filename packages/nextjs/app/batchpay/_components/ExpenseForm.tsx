"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { notification } from "~~/utils/scaffold-eth";

interface Expense {
  id: string;
  description: string;
  amount: string;
  paidBy: string;
  participants: string[];
  timestamp: number;
}

interface ExpenseFormProps {
  channelId: string;
  participants: string[];
  onExpenseAdded: (expense: Expense) => void;
  onClose: () => void;
}

const ExpenseForm = ({ channelId, participants, onExpenseAdded, onClose }: ExpenseFormProps) => {
  const { address } = useAccount();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(address || "");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleParticipantToggle = (participant: string) => {
    if (selectedParticipants.includes(participant)) {
      setSelectedParticipants(selectedParticipants.filter(p => p !== participant));
    } else {
      setSelectedParticipants([...selectedParticipants, participant]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!description.trim()) {
      notification.error("Please enter a description");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      notification.error("Please enter a valid amount");
      return;
    }

    if (!paidBy) {
      notification.error("Please select who paid");
      return;
    }

    if (selectedParticipants.length === 0) {
      notification.error("Please select at least one participant");
      return;
    }

    setIsSubmitting(true);

    try {
      const expense: Expense = {
        id: `${channelId}-${Date.now()}`,
        description: description.trim(),
        amount,
        paidBy,
        participants: selectedParticipants,
        timestamp: Date.now(),
      };

      onExpenseAdded(expense);
      notification.success("Expense added successfully!");

      // Reset form
      setDescription("");
      setAmount("");
      setPaidBy(address || "");
      setSelectedParticipants([]);
      onClose();
    } catch (error) {
      console.error("Error adding expense:", error);
      notification.error("Failed to add expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-base-100 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Add New Expense</h2>
            <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost" disabled={isSubmitting}>
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Description */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Description</span>
              </label>
              <input
                type="text"
                placeholder="e.g., Dinner at restaurant"
                className="input input-bordered w-full"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Amount */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Amount (USD)</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="input input-bordered w-full"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isSubmitting}
                required
              />
            </div>

            {/* Paid By */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Paid By</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={paidBy}
                onChange={e => setPaidBy(e.target.value)}
                disabled={isSubmitting}
                required
              >
                <option value="">Select who paid</option>
                {participants.map(participant => (
                  <option key={participant} value={participant}>
                    {participant === address ? "You" : participant.slice(0, 6) + "..." + participant.slice(-4)}
                  </option>
                ))}
              </select>
            </div>

            {/* Participants */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Split Between</span>
              </label>
              <div className="space-y-2">
                {participants.map(participant => (
                  <label key={participant} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selectedParticipants.includes(participant)}
                      onChange={() => handleParticipantToggle(participant)}
                      disabled={isSubmitting}
                    />
                    <span className="flex items-center space-x-2">
                      <span className="font-mono text-sm">
                        {participant === address ? "You" : participant.slice(0, 6) + "..." + participant.slice(-4)}
                      </span>
                      {participant === address && <span className="badge badge-primary badge-sm">You</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="btn btn-outline flex-1" disabled={isSubmitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary flex-1" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Adding...
                  </>
                ) : (
                  "Add Expense"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ExpenseForm;
