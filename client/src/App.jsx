import React, { Suspense, useEffect, useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { Routes, Route } from 'react-router-dom';

// Core pages — eagerly imported for instant first-paint
import Home from './pages/Home';
import LoginPage from './components/Auth/LoginPage';
import RegisterPage from './components/Auth/RegisterPage';
import { Navbar } from './components';
import Loader from './components/Loader.jsx';
import ProtectedRoute from './PrivateRoute.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminRoute from './AdminRoute';

// Legal pages — eagerly loaded
import PrivacyPolicy from './pages/legal/PrivacyPolicy';
import TermsOfService from './pages/legal/TermsOfService';
import RefundPolicy from './pages/legal/RefundPolicy';
import CookiePolicy from './pages/legal/CookiePolicy';
import Disclaimer from './pages/legal/Disclaimer';
import SecurityPolicy from './pages/legal/SecurityPolicy';
import AcceptableUsePolicy from './pages/legal/AcceptableUsePolicy';
import HelpCenter from './pages/HelpCenter';

// Lazy-loaded pages — loaded on demand per route
const Profile = React.lazy(() => import('./pages/Profile'));
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const TransactionForm = React.lazy(() => import('./pages/AddTransaction.jsx'));
const CryptoTracker = React.lazy(() => import('./pages/Crypto.jsx'));
const Loan = React.lazy(() => import('./pages/Loans.jsx'));
const Bank = React.lazy(() => import('./pages/Bank.jsx'));
const MainTransaction = React.lazy(() => import('./pages/MainTransaction.jsx'));
const Payements = React.lazy(() => import('./pages/Payements.jsx'));
const Web3Identity = React.lazy(() => import('./pages/Web3Identity.jsx'));
const PaymentSuccess = React.lazy(() => import('./pages/PaymentSuccess.jsx'));
const AiAgent = React.lazy(() => import('./pages/AiAgent.jsx'));
const AiRemittanceAgent = React.lazy(() => import('./components/Bank/AiRemittanceAgent'));

// Developer Console — lazy loaded
const DevPlatform = React.lazy(() => import('./pages/developer/DevPlatform.jsx'));
const DevDashboard = React.lazy(() => import('./pages/developer/DevDashboard.jsx'));
const DevAgents = React.lazy(() => import('./pages/developer/DevAgents.jsx'));
const DevAgentDetail = React.lazy(() => import('./pages/developer/DevAgentDetail.jsx'));
const DevApi = React.lazy(() => import('./pages/developer/DevApi.jsx'));
const DevUsage = React.lazy(() => import('./pages/developer/DevUsage.jsx'));
const DevAnalytics = React.lazy(() => import('./pages/developer/DevAnalytics.jsx'));
const DevRevenue = React.lazy(() => import('./pages/developer/DevRevenue.jsx'));
const DevBilling = React.lazy(() => import('./pages/developer/DevBilling.jsx'));
const DevDocs = React.lazy(() => import('./pages/developer/DevDocs.jsx'));
const DevWebhooks = React.lazy(() => import('./pages/developer/DevWebhooks.jsx'));
const DevPlayground = React.lazy(() => import('./pages/developer/DevPlayground.jsx'));
const DevServiceStatus = React.lazy(() => import('./pages/developer/DevServiceStatus.jsx'));
const DevSettings = React.lazy(() => import('./pages/developer/DevSettings.jsx'));
const DevChangelog = React.lazy(() => import('./pages/developer/DevChangelog.jsx'));
const DevOrganizations = React.lazy(() => import('./pages/developer/DevOrganizations.jsx'));
const DevMembers = React.lazy(() => import('./pages/developer/DevMembers.jsx'));
const DevNotifications = React.lazy(() => import('./pages/developer/DevNotifications.jsx'));
const DevOrgSettings = React.lazy(() => import('./pages/developer/DevOrgSettings.jsx'));
const DevMarketplace = React.lazy(() => import('./pages/developer/DevMarketplace.jsx'));
const DevServices = React.lazy(() => import('./pages/developer/DevServices.jsx'));
const DevPublishService = React.lazy(() => import('./pages/developer/DevPublishService.jsx'));
const DevMarketInvoices = React.lazy(() => import('./pages/developer/DevMarketInvoices.jsx'));
const DevMarketplaceRevenue = React.lazy(() => import('./pages/developer/DevMarketplaceRevenue.jsx'));
const DevSessions = React.lazy(() => import('./pages/developer/DevSessions.jsx'));
const DevCommerceDashboard = React.lazy(() => import('./pages/developer/DevCommerceDashboard.jsx'));
const DevRecommendations = React.lazy(() => import('./pages/developer/DevRecommendations.jsx'));
const DevServiceDetail = React.lazy(() => import('./pages/developer/DevServiceDetail.jsx'));
const DevInvoiceDetail = React.lazy(() => import('./pages/developer/DevInvoiceDetail.jsx'));
const DevSessionDetail = React.lazy(() => import('./pages/developer/DevSessionDetail.jsx'));
const DevCompanyProfile = React.lazy(() => import('./pages/developer/DevCompanyProfile.jsx'));
const DevNetwork = React.lazy(() => import('./pages/developer/DevNetwork.jsx'));
const DevWorkflows = React.lazy(() => import('./pages/developer/DevWorkflows.jsx'));
const DevWorkflowRun = React.lazy(() => import('./pages/developer/DevWorkflowRun.jsx'));
const DevAgentMarketplace = React.lazy(() => import('./pages/developer/DevAgentMarketplace.jsx'));
const DevAgentListingDetail = React.lazy(() => import('./pages/developer/DevAgentListingDetail.jsx'));
const DevInstalledAgents = React.lazy(() => import('./pages/developer/DevInstalledAgents.jsx'));
const DevAgentStore = React.lazy(() => import('./pages/developer/DevAgentStore.jsx'));
const DevAgentConsumer = React.lazy(() => import('./pages/developer/DevAgentConsumer.jsx'));
const AcceptInvite = React.lazy(() => import('./pages/developer/AcceptInvite.jsx'));

// Auth pages — lazy loaded
const ForgotPassword = React.lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/auth/ResetPassword'));
const EmailVerification = React.lazy(() => import('./pages/auth/EmailVerification'));

// UX pages — lazy loaded
const PaymentFailed = React.lazy(() => import('./pages/PaymentFailed'));
const Forbidden = React.lazy(() => import('./pages/Forbidden'));
const ServerError = React.lazy(() => import('./pages/ServerError'));
const SessionExpired = React.lazy(() => import('./pages/SessionExpired'));
const CancelSubscription = React.lazy(() => import('./pages/CancelSubscription'));

// Admin Console — lazy loaded
const AdminPlatform = React.lazy(() => import('./pages/admin/AdminPlatform.jsx'));
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard.jsx'));
const AdminDevelopers = React.lazy(() => import('./pages/admin/AdminDevelopers.jsx'));
const AdminOrganizations = React.lazy(() => import('./pages/admin/AdminOrganizations.jsx'));
const AdminMarketplace = React.lazy(() => import('./pages/admin/AdminMarketplace.jsx'));
const AdminPayments = React.lazy(() => import('./pages/admin/AdminPayments.jsx'));
const AdminWallets = React.lazy(() => import('./pages/admin/AdminWallets.jsx'));
const AdminPlatformStatus = React.lazy(() => import('./pages/admin/AdminPlatformStatus.jsx'));
const AdminAuditLogs = React.lazy(() => import('./pages/admin/AdminAuditLogs.jsx'));
const AdminProfileApprovals = React.lazy(() => import('./pages/admin/AdminProfileApprovals.jsx'));

const App = () => {
  const [tt, setToken] = useState(localStorage.getItem('token') || '');

  useEffect(() => {
    const token = localStorage.getItem('token');
    setToken(token);
  }, [tt]);

  return (
    <div className="bg-primary w-full overflow-hidden relative">
      <Toaster position="top-center" />
      <Navbar />
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Public routes — eagerly loaded */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<EmailVerification />} />
          <Route path="/session-expired" element={<SessionExpired />} />
          <Route path="/payment-failed" element={<PaymentFailed />} />
          <Route path="/forbidden" element={<Forbidden />} />
          <Route path="/server-error" element={<ServerError />} />
          <Route path="/cancel-subscription" element={<CancelSubscription />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />
          <Route path="/refund" element={<RefundPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/disclaimer" element={<Disclaimer />} />
          <Route path="/security" element={<SecurityPolicy />} />
          <Route path="/acceptable-use" element={<AcceptableUsePolicy />} />
          <Route path="/help" element={<HelpCenter />} />

          {/* Protected routes — lazy loaded */}
          <Route element={<ProtectedRoute isAuthenticated={tt ? true : false} />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/overview" element={<Dashboard />} />
            <Route path="/transaction" element={<TransactionForm />} />
            <Route path="/payments" element={<Payements />} />
            <Route path="/KYC" element={<Bank />} />
            <Route path="/transfers" element={<MainTransaction />} />
            <Route path="/web3-kyc" element={<Web3Identity />} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/ai-agent" element={<AiAgent />} />
            <Route path="/flash-loans" element={<Loan />} />
            <Route path="/crypto-tracker" element={<CryptoTracker />} />

            {/* Developer Console */}
            <Route path="/developer" element={<DevPlatform />}>
              <Route index element={<DevDashboard />} />
              <Route path="agents" element={<DevAgents />} />
              <Route path="agents/:agentId" element={<DevAgentDetail />} />
              <Route path="api" element={<DevApi />} />
              <Route path="usage" element={<DevUsage />} />
              <Route path="analytics" element={<DevAnalytics />} />
              <Route path="revenue" element={<DevRevenue />} />
              <Route path="billing" element={<DevBilling />} />
              <Route path="docs" element={<DevDocs />} />
              <Route path="webhooks" element={<DevWebhooks />} />
              <Route path="playground" element={<DevPlayground />} />
              <Route path="status" element={<DevServiceStatus />} />
              <Route path="organizations" element={<DevOrganizations />} />
              <Route path="organizations/members" element={<DevMembers />} />
              <Route path="notifications" element={<DevNotifications />} />
              <Route path="organizations/settings" element={<DevOrgSettings />} />
              <Route path="marketplace" element={<DevMarketplace />} />
              <Route path="marketplace/service/:serviceId" element={<DevServiceDetail />} />
              <Route path="marketplace/services" element={<DevServices />} />
              <Route path="marketplace/services/publish" element={<DevPublishService />} />
              <Route path="marketplace/services/publish/:serviceId" element={<DevPublishService />} />
              <Route path="marketplace/invoices" element={<DevMarketInvoices />} />
              <Route path="marketplace/invoices/:invoiceId" element={<DevInvoiceDetail />} />
              <Route path="marketplace/revenue" element={<DevMarketplaceRevenue />} />
              <Route path="commerce/sessions" element={<DevSessions />} />
              <Route path="commerce/sessions/:sessionId" element={<DevSessionDetail />} />
              <Route path="commerce/dashboard" element={<DevCommerceDashboard />} />
              <Route path="commerce/recommendations" element={<DevRecommendations />} />
              <Route path="network/profile" element={<DevCompanyProfile />} />
              <Route path="network/analytics" element={<DevNetwork />} />
              <Route path="network/workflows" element={<DevWorkflows />} />
              <Route path="network/workflows/:runId" element={<DevWorkflowRun />} />
              <Route path="agent-marketplace" element={<DevAgentMarketplace />} />
              <Route path="agent-marketplace/listing/:listingId" element={<DevAgentListingDetail />} />
              <Route path="agent-marketplace/installed" element={<DevInstalledAgents />} />
              <Route path="agent-marketplace/store" element={<DevAgentStore />} />
              <Route path="agent-marketplace/consumer" element={<DevAgentConsumer />} />
              <Route path="settings" element={<DevSettings />} />
              <Route path="changelog" element={<DevChangelog />} />
            </Route>
          </Route>

          {/* Admin Console — super_admin only */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminPlatform />}>
              <Route index element={<AdminDashboard />} />
              <Route path="developers" element={<AdminDevelopers />} />
              <Route path="organizations" element={<AdminOrganizations />} />
              <Route path="marketplace" element={<AdminMarketplace />} />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="wallets" element={<AdminWallets />} />
              <Route path="platform" element={<AdminPlatformStatus />} />
              <Route path="audit-logs" element={<AdminAuditLogs />} />
              <Route path="profile-approvals" element={<AdminProfileApprovals />} />
            </Route>
          </Route>

          <Route path="/accept-invite/:orgId/:token" element={<AcceptInvite />} />
          <Route path="/*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {/* Global Draggable AI Agent Component — only after login */}
      {tt && <AiRemittanceAgent />}
    </div>
  );
};

export default App;
