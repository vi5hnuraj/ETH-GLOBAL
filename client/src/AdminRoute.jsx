import { Navigate, Outlet } from "react-router-dom";

/**
 * AdminRoute — guards /admin/* routes behind a super_admin role check.
 * Reads the user role from localStorage (set at login time).
 * Developers with no admin role are bounced to /developer.
 */
const AdminRoute = () => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("userRole");

  if (!token) return <Navigate to="/login" replace />;
  if (role !== "super_admin") return <Navigate to="/developer" replace />;

  return <Outlet />;
};

export default AdminRoute;
