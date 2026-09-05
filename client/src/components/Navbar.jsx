import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { close, menu } from "../assets";
import logoImg from "../assets/logo.jpeg";
import { navLinks } from "../constants";
import { FaUserCircle } from "react-icons/fa";
import Cookies from "js-cookie";
import api, { getCachedUserDetail, refreshUserCache, invalidateUserCache } from "../utils/api";
import QRScannerModal from "./QRScannerModal";
import QRPaymentModal from "./QRPaymentModal";

const Navbar = () => {
  const [active, setActive] = useState("Home");
  const [toggle, setToggle] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannedQRData, setScannedQRData] = useState(null);
  const [userData, setUserData] = useState({
    username: "",
    email: "",
  });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const userRole = localStorage.getItem('userRole');
  const isAdmin = userRole === 'super_admin';
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const location = useLocation();
  const isDevConsole = location.pathname.startsWith('/developer');

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) setIsLoggedIn(true);
  }, []);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const user = await getCachedUserDetail();
        setUserData(user || {});
        refreshUserCache().then(fresh => { if (fresh) setUserData(fresh); });
      } catch (error) {
        invalidateUserCache();
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("userRole");
          setIsLoggedIn(false);
          navigate("/");
        }
      }
    };
    if (isLoggedIn) fetchUser();
  }, [isLoggedIn]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userRole");
    sessionStorage.removeItem("wallet_session_key");
    Cookies.remove("token");
    Cookies.remove("refreshToken");
    Cookies.remove("userEmail");
    setIsLoggedIn(false);
    navigate("/");
  };

  const mainNavLinks = [
    { title: 'Overview', redirect: '/' },
    { title: 'Payments', redirect: '/payments' },
    { title: 'Transfers', redirect: '/transfers' },
    { title: 'Profile', redirect: '/profile' },
  ];

  return (
    <div className="w-full">
      {/* ─── Layer 1: Main GlobalPay Nav ─── */}
      <nav className="w-full grid grid-cols-[auto_1fr_auto] items-center h-14 px-6 bg-zinc-950 border-b border-zinc-800/60">
        {/* Left: Logo + Developer */}
        <div className="flex items-center gap-4 shrink-0">
          <img
            src={logoImg}
            alt="GlobalPay"
            onClick={() => (window.location.href = "/")}
            className="h-8 w-8 object-contain cursor-pointer rounded-lg"
          />
          <div className="w-px h-5 bg-zinc-700/50" />
          <a
            href="/developer"
            className="hidden md:inline-flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
          >
            <span className="text-emerald-400 font-mono">{'>_ '}</span>
            <span>Developer</span>
          </a>
        </div>

        {/* Center: nav links — perfectly centered */}
        <div className="hidden md:flex items-center justify-center gap-1">
          {isLoggedIn && mainNavLinks.map((nav) => (
            <Link
              key={nav.redirect}
              to={nav.redirect}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                location.pathname === nav.redirect
                  ? 'text-white bg-zinc-800/60'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
              }`}
            >
              {nav.title}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {isLoggedIn && (
            <>
              {/* Scan QR — green */}
              <button
                onClick={() => setIsScannerOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors"
              >
                Scan QR 📷
              </button>

            </>
          )}

          {/* Auth Buttons or User Dropdown */}
          {!isLoggedIn ? (
            <>
              <Link
                to="/login"
                className="text-white border border-zinc-500 px-4 py-2 rounded-md font-medium text-sm"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="text-white border border-zinc-500 px-4 py-2 rounded-md font-medium text-sm"
              >
                Register
              </Link>
            </>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <div
                className="flex items-center gap-3 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-zinc-800/40 transition-colors"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {(userData.username || userData.email || 'U')[0].toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col items-start">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white font-semibold text-sm leading-tight">
                      {userData.username || userData.email?.split('@')[0] || "User"}
                    </span>
                    {isAdmin && <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/60 border border-amber-800/50 rounded px-1 py-0.5">Admin</span>}
                  </div>
                  <span className="text-zinc-500 text-[10px] truncate max-w-[120px]">
                    {userData.email || ""}
                  </span>
                </div>
                <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>

              {isDropdownOpen && (
                <div className="absolute top-full right-0 mt-3 w-44 bg-zinc-800/90 backdrop-blur-md border border-zinc-700 rounded-xl shadow-2xl overflow-hidden z-50">
                  {isAdmin && (
                    <a
                      href="/admin"
                      className="block w-full text-left px-4 py-2.5 text-amber-400 font-medium hover:bg-zinc-700/50 hover:text-amber-300 transition-colors text-sm border-b border-zinc-700"
                    >
                      🛡️ Admin Panel
                    </a>
                  )}
                  <button
                    onClick={handleLogout}
                    className="block w-full text-center px-4 py-2.5 text-red-400 font-semibold hover:bg-zinc-700/50 hover:text-red-300 transition-colors text-sm border-t border-zinc-700"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden flex flex-1 justify-end items-center">
          <img
            src={toggle ? close : menu}
            alt="menu"
            className="w-[24px] h-[24px] object-contain"
            onClick={() => setToggle(!toggle)}
          />
          <div
            className={`${!toggle ? "hidden" : "flex"} p-6 bg-black-gradient absolute top-16 right-0 mx-4 my-2 min-w-[140px] rounded-xl sidebar z-50`}
          >
            <ul className="list-none flex justify-end items-start flex-1 flex-col">
              {isLoggedIn && mainNavLinks.map((nav) => (
                <li key={nav.redirect} className="mb-2">
                  <Link to={nav.redirect} className="text-zinc-300 hover:text-blue-400 text-sm" onClick={() => setToggle(false)}>
                    {nav.title}
                  </Link>
                </li>
              ))}
              {!isLoggedIn ? (
                <>
                  <li className="mb-2">
                    <Link to="/login" className="text-white border border-zinc-500 px-4 py-2 rounded-md font-medium text-sm">Login</Link>
                  </li>
                  <li>
                    <Link to="/register" className="text-white border border-zinc-500 px-4 py-2 rounded-md font-medium text-sm">Register</Link>
                  </li>
                </>
              ) : (
                <>
                  <li className="mb-2 text-white text-sm">{userData.username}</li>
                  <li><button onClick={handleLogout} className="text-red-400 hover:text-red-600 text-sm">Logout</button></li>
                </>
              )}
            </ul>
          </div>
        </div>
      </nav>

      {/* Camera Live Scanner Modal */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(decodedData) => setScannedQRData(decodedData)}
      />
      <QRPaymentModal
        isOpen={Boolean(scannedQRData)}
        onClose={() => setScannedQRData(null)}
        qrData={scannedQRData}
        user={userData}
      />
    </div>
  );
};

export default Navbar;
