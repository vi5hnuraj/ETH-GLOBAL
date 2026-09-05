import React, { useState, useEffect } from "react";
import { FaUserCircle, FaEdit, FaCheckCircle, FaSignOutAlt, FaShieldAlt, FaUniversity } from "react-icons/fa";
import { Link } from "react-router-dom";
import api from "../utils/api";

const UserProfile = () => {
  const [name, setName] = useState("User");
  const [email, setEmail] = useState("");
  const [mob, setMob] = useState("..");
  const [dob, setDob] = useState("..");
  const [bankName, setBankName] = useState("..");
  const [kyc, setKyc] = useState(false);
  const [box, setBox] = useState(false);

  const token = localStorage.getItem("token");

  const fetchUser = async () => {
    if (!token) return;
    try {
      const res = await api.get("/auth/fetchdetail");
      const details = res.data;
      if (!details) return;

      setEmail(details.email || "..");
      setName(details.username || details.email?.split('@')[0] || "User");
      setMob(details.mobile || "..");
      setDob(details.dob || "..");
      const bName = details.bankDetails?.bankName;
      setBankName(bName && bName.trim() !== "" ? bName : (details.kyc ? "Verified Account" : "Not Linked"));
      setKyc(details.kyc || false);
    } catch (err) {
      console.error("Failed to fetch user details:", err);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [token]);

  const logoutHandler = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userRole");
    sessionStorage.removeItem("wallet_session_key");
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
    window.location.href = "/";
  };

  const toggleBox = () => setBox(!box);

  const updateProfile = async () => {
    try {
      await api.put("/auth/update", { name, mob, dob });
      setBox(false);
      fetchUser();
    } catch (err) {
      console.error("Update failed:", err);
    }
  };

  return (
    <div className="h-full flex flex-col relative bg-zinc-900/40 p-6 rounded-3xl border border-zinc-800 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-zinc-500 uppercase text-[10px] font-black tracking-[0.2em]">Verified Identity</h3>
        <button
          onClick={toggleBox}
          className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-amber-500 transition-all border border-zinc-700/50"
        >
          <FaEdit size={16} />
        </button>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col items-center mb-10">
        <div className="relative mb-6">
          <div className="w-24 h-24 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-full flex items-center justify-center border-4 border-zinc-800/50 shadow-2xl overflow-hidden">
            <FaUserCircle className="text-zinc-700 text-7xl" />
          </div>
          {kyc && (
            <div className="absolute -bottom-1 -right-1 bg-amber-500 p-1.5 rounded-full border-4 border-zinc-900 text-zinc-900 shadow-xl">
              <FaCheckCircle size={12} />
            </div>
          )}
        </div>
        <h2 className="text-2xl font-black text-white tracking-tight text-center">{name}</h2>
        <p className="text-zinc-500 text-sm font-medium mt-1">{email}</p>
      </div>

      {/* Essential Info List */}
      <div className="space-y-6 flex-1">
        <div className="bg-black/20 p-5 rounded-2xl border border-zinc-800/50">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-zinc-800 rounded-xl text-amber-500">
              <FaUniversity size={20} />
            </div>
            <div>
              <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] mb-0.5">Primary Bank</p>
              <div className="flex items-center gap-2">
                <p className="text-zinc-200 font-bold">{bankName}</p>
                {kyc && <FaCheckCircle className="text-amber-500 text-[10px]" />}
              </div>
            </div>
          </div>
        </div>

        <div className="px-2 space-y-5">
          <div className="flex justify-between items-center group">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Mobile</span>
            <span className="text-zinc-300 font-semibold">{mob}</span>
          </div>

          <div className="flex justify-between items-center group">
            <span className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Birth Date</span>
            <span className="text-zinc-300 font-semibold">{dob}</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-10 space-y-3">
        <Link to="/KYC" className="w-full flex items-center justify-between bg-zinc-800/30 hover:bg-zinc-800 p-4 rounded-2xl border border-zinc-700/30 transition-all group">
          <div className="flex items-center gap-3">
            <FaShieldAlt className={kyc ? "text-emerald-500" : "text-amber-500"} />
            <span className="text-xs font-black uppercase text-zinc-400 group-hover:text-white transition-colors">
              {kyc ? "KYC Verified" : "Pending Verification"}
            </span>
          </div>
          <span className="text-zinc-600 text-[10px]">DETAILS</span>
        </Link>

        <button
          onClick={logoutHandler}
          className="w-full flex items-center justify-center gap-3 bg-red-500/5 hover:bg-red-500 text-red-500 hover:text-white p-5 rounded-2xl border border-red-500/10 hover:border-red-500 transition-all font-black text-xs uppercase tracking-widest mt-4"
        >
          <FaSignOutAlt />
          Sign Out
        </button>
      </div>

      {/* Simplified Edit Overlay */}
      {box && (
        <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-xl z-50 flex flex-col p-8 rounded-3xl border border-zinc-800 shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="flex justify-between items-center mb-10">
            <h4 className="text-white font-black uppercase tracking-widest text-sm">Update Details</h4>
            <button onClick={toggleBox} className="text-zinc-500 hover:text-white">✕</button>
          </div>

          <div className="space-y-6 flex-1">
            <div className="space-y-2">
              <label className="text-[9px] text-zinc-600 font-black uppercase tracking-widest ml-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full py-4 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-white text-sm font-semibold outline-none focus:border-amber-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] text-zinc-600 font-black uppercase tracking-widest ml-1">Mobile Number</label>
              <input
                type="text"
                value={mob}
                onChange={(e) => setMob(e.target.value)}
                className="w-full py-4 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-white text-sm font-semibold outline-none focus:border-amber-500 transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[9px] text-zinc-600 font-black uppercase tracking-widest ml-1">Date of Birth</label>
              <input
                type="text"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full py-4 px-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-white text-sm font-semibold outline-none focus:border-amber-500 transition-all"
              />
            </div>
          </div>

          <button
            onClick={updateProfile}
            className="w-full bg-amber-500 text-zinc-950 py-5 rounded-2xl font-black uppercase tracking-widest mt-8 shadow-2xl shadow-amber-500/20 active:scale-95 transition-all"
          >
            Save Information
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
