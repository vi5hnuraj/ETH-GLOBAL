import React, { useEffect, useState } from 'react';
import BankCard from '../components/Bank/BankCard';
import UserInfo from '../components/Bank/UserInfo';
import TransactionForm from '../components/Bank/TransactionForm';
import TransactionHistory from '../components/Bank/TransactionHistory';
import BarGraph from '../components/Bank/BarGraph';
import BridgePanel from '../components/Bank/BridgePanel';
import api, { getCachedUserDetail, refreshUserCache } from '../utils/api';
import ScannerComponent from '../components/Bank/ScannerComponent';

function MainTransaction() {
  const [userData, setUserData] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const fetchUserData = async () => {
    try {
      const user = await getCachedUserDetail();
      setUserData(user);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTransactions = async () => {
    try {
      const res = await api.get(`/money-transfer`);
      const mtData = Array.isArray(res.data) ? res.data : [];

      const uniqueMap = new Map();
      mtData.forEach(item => {
        const key = (item.txHash && String(item.txHash).startsWith('0x'))
          ? String(item.txHash).toLowerCase()
          : (item._id ? String(item._id) : JSON.stringify(item));

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else {
          const existing = uniqueMap.get(key);
          const existingDate = existing.timestamp || existing.date || existing.createdAt;
          const itemDate = item.timestamp || item.date || item.createdAt;
          if (!existingDate && itemDate) {
            uniqueMap.set(key, item);
          }
        }
      });

      const sorted = Array.from(uniqueMap.values()).sort((a, b) =>
        new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0)
      );

      const filtered = sorted.filter(t => {
        if (t.status === 'FAILED') return false;
        if (t.status === 'PENDING' && !(typeof t.txHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(t.txHash.trim()))) return false;
        return true;
      });

      setTransactions(filtered);
    } catch (err) {
      console.error("fetchTransactions error:", err);
    }
  };

  useEffect(() => {
    fetchUserData();
    fetchTransactions();
  }, []);

  const refreshData = () => {
    refreshUserCache().then(() => fetchUserData());
    fetchTransactions();
  };

  return (
    <div className="bg-black text-zinc-200 min-h-screen p-4 md:p-6 font-sans">
      <div className="max-w-[1600px] mx-auto">
        {/* ─── 4 BOXES IN A SINGLE ROW ─── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {userData && (
            <>
              <BankCard userData={userData} />
              <UserInfo userData={userData} transactions={transactions} />
              <ScannerComponent userData={userData} />
            </>
          )}
        </div>

        {/* ─── Quick Actions (was Two-Way Bridge) ─── */}
        {userData && (
          <BridgePanel userData={userData} onSuccess={refreshData} />
        )}

        {/* ─── Quick Transfer + Activity Log ─── */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch mb-6">
          <TransactionForm onTransactionSuccess={refreshData} userData={userData} />
          <TransactionHistory transactions={transactions} userData={userData} onSuccess={refreshData} />
        </div>

        {/* ─── Bar Graphs ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarGraph title="Amount Sent" transactions={transactions} type="sent" userData={userData} />
          <BarGraph title="Amount Received" transactions={transactions} type="received" userData={userData} />
        </div>
      </div>
    </div>
  );
}

export default MainTransaction;