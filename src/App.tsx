import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';

const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
const DashboardHomePage = lazy(() => import('./pages/DashboardHomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdmissionsPage = lazy(() => import('./pages/AdmissionsPage'));
const AppointmentsPage = lazy(() => import('./pages/AppointmentsPage'));
const ResidentsPage = lazy(() => import('./pages/ResidentsPage'));
const RoomsPage = lazy(() => import('./pages/RoomsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const StaffManagementPage = lazy(() => import('./pages/StaffManagementPage'));
const UsersManagementPage = lazy(() => import('./pages/UsersManagementPage'));
const VisitsPage = lazy(() => import('./pages/VisitsPage'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-(--color-cream)">
          <p className="text-sm text-(--color-primary)/70">Loading...</p>
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<AdminLayout />}>
            <Route index element={<DashboardHomePage />} />
            <Route path="residents" element={<ResidentsPage />} />
            <Route path="appointments" element={<AppointmentsPage />} />
            <Route path="visits" element={<VisitsPage />} />
            <Route path="rooms" element={<RoomsPage />} />
            <Route path="admissions" element={<AdmissionsPage />} />
            <Route path="staff" element={<StaffManagementPage />} />
            <Route path="users" element={<UsersManagementPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
