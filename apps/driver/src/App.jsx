import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import RouteScreen from './pages/RouteScreen';
import MapScreen from './pages/MapScreen';
import Dashboard from './pages/Dashboard';
import DeliveryList from './pages/DeliveryList';
import DeliveryDetail from './pages/DeliveryDetail';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Layout from './components/Layout';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<RouteScreen />} />
        <Route path="map" element={<MapScreen />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="deliveries" element={<DeliveryList />} />
        <Route path="deliveries/:id" element={<DeliveryDetail />} />
        <Route path="profile" element={<Profile />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
