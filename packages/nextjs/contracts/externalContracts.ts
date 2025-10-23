import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * PYUSD Token Contract ABI (ERC-20 standard)
 */
const PYUSD_ABI = [
  {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "from", type: "address" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "address", name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "spender", type: "address" },
      { indexed: false, internalType: "uint256", name: "value", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
] as const;

/**
 * External contracts configuration
 * Includes PYUSD token contract for supported chains
 */
const externalContracts = {
  // Ethereum Mainnet
  1: {
    PYUSD: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as `0x${string}`,
      abi: PYUSD_ABI,
    },
  },
  // Arbitrum One
  42161: {
    PYUSD: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as `0x${string}`,
      abi: PYUSD_ABI,
    },
  },
  // Optimism
  10: {
    PYUSD: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as `0x${string}`,
      abi: PYUSD_ABI,
    },
  },
  // Base
  8453: {
    PYUSD: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as `0x${string}`,
      abi: PYUSD_ABI,
    },
  },
  // Polygon
  137: {
    PYUSD: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8" as `0x${string}`,
      abi: PYUSD_ABI,
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
