// Standalone routing adapter; Inventory screens are retained from the team project.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import InventoryLayout from './features/inventory/InventoryLayout';
import Overview from './features/inventory/Overview';
import Supplies from './features/inventory/Supplies';
import Receiving from './features/inventory/Receiving';
import { Counts, Losses } from './features/inventory/CountsLosses';
import Suppliers from './features/inventory/Suppliers';
import { PreparedStock, MenuAvailability } from './features/inventory/MenuStock';
import { Movements, Reports } from './features/inventory/HistoryReports';
import Guide from './features/inventory/Guide';
import Profile from './features/inventory/Profile';
import Settings from './features/inventory/Settings';
export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<Login />} />
    {['/inventory', '/admin/inventory'].map(path => <Route key={path} path={path}
      element={<ProtectedRoute allowedRoles={path.startsWith('/admin') ? ['admin'] : ['inventory', 'admin']}><InventoryLayout /></ProtectedRoute>}>
      <Route index element={<Navigate to="overview" replace />} />
      <Route path="overview" element={<Overview />} /><Route path="supplies" element={<Supplies />} />
      <Route path="receiving" element={<Receiving />} /><Route path="prepared" element={<PreparedStock />} />
      <Route path="menu" element={<MenuAvailability />} /><Route path="counts" element={<Counts />} />
      <Route path="losses" element={<Losses />} /><Route path="suppliers" element={<Suppliers />} />
      <Route path="movements" element={<Movements />} /><Route path="reports" element={<Reports />} />
      <Route path="guide" element={<Guide />} /><Route path="profile" element={<Profile />} />
      <Route path="settings" element={<Settings />} />
    </Route>)}
    <Route path="*" element={<Navigate to="/inventory/overview" replace />} />
  </Routes></AuthProvider></BrowserRouter>;
}
