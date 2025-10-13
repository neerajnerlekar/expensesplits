"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";

const Navigation = () => {
  const pathname = usePathname();
  const { isConnected } = useAccount();

  const navItems = [
    {
      href: "/batchpay",
      label: "Dashboard",
      icon: "🏠",
      description: "View all your channels",
    },
    {
      href: "/batchpay/create",
      label: "Create Channel",
      icon: "➕",
      description: "Start a new expense channel",
    },
    {
      href: "/batchpay/settlements",
      label: "Settlements",
      icon: "💰",
      description: "Manage batch settlements",
    },
    {
      href: "/batchpay/preferences",
      label: "Preferences",
      icon: "⚙️",
      description: "PYUSD and bridge settings",
    },
  ];

  const isActive = (href: string) => {
    if (href === "/batchpay") {
      return pathname === "/batchpay";
    }
    return pathname.startsWith(href);
  };

  if (!isConnected) {
    return (
      <div className="navbar bg-base-100 shadow-lg">
        <div className="navbar-start">
          <Link href="/batchpay" className="btn btn-ghost text-xl">
            BatchPay
          </Link>
        </div>
        <div className="navbar-end">
          <div className="text-sm text-base-content/60">Connect wallet to continue</div>
        </div>
      </div>
    );
  }

  return (
    <div className="navbar bg-base-100 shadow-lg">
      <div className="navbar-start">
        <Link href="/batchpay" className="btn btn-ghost text-xl">
          BatchPay
        </Link>
      </div>

      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1">
          {navItems.map(item => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center gap-2 ${isActive(item.href) ? "active" : ""}`}
                title={item.description}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="navbar-end">
        <div className="dropdown dropdown-end lg:hidden">
          <div tabIndex={0} role="button" className="btn btn-ghost">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </div>
          <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52">
            {navItems.map(item => (
              <li key={item.href}>
                <Link href={item.href} className={`flex items-center gap-2 ${isActive(item.href) ? "active" : ""}`}>
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <div className="font-semibold">{item.label}</div>
                    <div className="text-xs text-base-content/60">{item.description}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Navigation;
