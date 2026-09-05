import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiSend, FiDollarSign, FiInbox } from 'react-icons/fi';
import Pay from '../components/Pay';
import Request from './Request';
import RequestForm from '../components/RequestForm';

const quickActions = [
  { key: 'pay', label: 'Pay', desc: 'Send ETH to anyone', icon: FiSend },
  { key: 'send-request', label: 'Request', desc: 'Create an invoice', icon: FiDollarSign },
  { key: 'reqpay', label: 'Inbox', desc: 'View pending requests', icon: FiInbox },
];

const cardColors = {
  pay: { gradient: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/25', iconBg: 'bg-amber-500/10 text-amber-400' },
  'send-request': { gradient: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/25', iconBg: 'bg-blue-500/10 text-blue-400' },
  reqpay: { gradient: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/25', iconBg: 'bg-emerald-500/10 text-emerald-400' },
};

const Payements = () => {
    const [searchParams] = useSearchParams();
    const [active, setActive] = useState(searchParams.get("tab") || (searchParams.get("prefillFromRequest") ? "pay" : "pay"));

    useEffect(() => {
        if (searchParams.get("tab")) {
            setActive(searchParams.get("tab"));
        } else if (searchParams.get("prefillFromRequest") === "true") {
            setActive("pay");
        }
    }, [searchParams]);

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 lg:py-12">

                <div className="mb-8 sm:mb-10">
                    <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">Payments</h1>
                    <p className="text-zinc-500 text-sm sm:text-base mt-1.5">Send, request, and manage your ETH payments on-chain</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-8 sm:mb-10">
                    {quickActions.map(({ key, label, desc, icon: Icon }) => {
                        const isActive = active === key;
                        const colors = cardColors[key];
                        return (
                            <button
                                key={key}
                                onClick={() => setActive(key)}
                                className={`relative w-full text-left p-4 sm:p-5 rounded-2xl border transition-all duration-300 ${
                                    isActive
                                        ? `bg-gradient-to-br ${colors.gradient} ${colors.border} shadow-lg`
                                        : 'bg-zinc-900/30 border-zinc-800/40 hover:border-zinc-700/60 hover:bg-zinc-900/50'
                                }`}
                            >
                                <div className="flex items-start gap-3 sm:gap-4">
                                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center border shrink-0 ${
                                        isActive
                                            ? `${colors.iconBg} ${colors.border}`
                                            : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50'
                                    }`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm sm:text-base">{label}</div>
                                        <div className="text-zinc-500 text-xs sm:text-sm mt-0.5">{desc}</div>
                                    </div>
                                </div>
                                {isActive && (
                                    <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06] pointer-events-none" />
                                )}
                            </button>
                        );
                    })}
                </div>

                <div>
                    {active === "pay" && <Pay />}
                    {active === "send-request" && <RequestForm />}
                    {active === "reqpay" && <Request />}
                </div>

            </div>
        </div>
    );
};

export default Payements;
