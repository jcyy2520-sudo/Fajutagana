import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles: ('admin' | 'cashier' | 'kitchen' | 'inventory')[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { user, isInitialized } = useAuth();
    const location = useLocation();

    // Show loading while checking auth
    if (!isInitialized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-yellow-500"></div>
            </div>
        );
    }

    // Not logged in - redirect to login
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Logged in but wrong role - redirect to their correct dashboard
    if (!allowedRoles.includes(user.role)) {
        return <p>This workspace is available to Inventory and Admin accounts. Sign out and use an authorized account.</p>;
    }

    // User is authenticated and has correct role
    return <>{children}</>;
}
