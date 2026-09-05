import React from 'react';

const UserInfo = ({ userData, transactions }) => {
  if (!userData) return <div className="h-80 w-full bg-zinc-800 animate-pulse rounded-2xl"></div>;

  const name = userData.username || userData.name || userData.email?.split('@')[0] || 'User';
  const payTag = userData.globalPayTag || userData.internalWalletAddress || 'Not Assigned';

  let totalVolume = 0;
  if (transactions) {
    transactions.forEach(t => {
      totalVolume += Number(t.botAmount || t.amount || 0);
    });
  }

  return (
    /* ─── Box 3: User Profile & GlobalPay Tag ─── */
    <div className="bg-zinc-900 border border-zinc-800 p-5 sm:p-6 rounded-2xl shadow-xl font-mono w-full flex flex-col justify-between overflow-hidden">
      <div>
        <h2 className="text-xl font-bold text-amber-500 mb-2 truncate">👋🏻 Hello, {name}!</h2>
        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
          Your Blockchain wallet is active. Send and receive tokens instantly on-chain.
        </p>

        <div className="bg-zinc-950/80 p-3 rounded-xl border border-zinc-800">
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider mb-1">Your GlobalPay Tag</p>
          <p className="text-xs font-black text-amber-400 truncate">{payTag}</p>
        </div>
      </div>

      <div className="flex justify-between items-end pt-3 border-t border-zinc-800/80">
        <div>
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Total Volume</p>
          <p className="text-sm font-extrabold text-white mt-0.5">{totalVolume.toFixed(4)} ETH</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-zinc-500 uppercase font-bold tracking-widest">Network</p>
          <p className="text-xs font-bold text-amber-400 mt-0.5">Blockchain</p>
        </div>
      </div>
    </div>
  );
};

export default UserInfo;