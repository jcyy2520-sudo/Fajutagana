// New standalone sign-in adapter; account creation stays outside the web UI.
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
export default function Login() {
  const { user, login, logout, loading, isInitialized } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState('');
  if (isInitialized && user && ['inventory', 'admin'].includes(user.role)) return <Navigate to={user.role === 'admin' ? '/admin/inventory/overview' : '/inventory/overview'} replace />;
  return <main className="min-h-screen flex items-center justify-center bg-yellow-50 p-6">
    <form className="bg-white p-8 rounded-xl shadow w-full max-w-sm space-y-4" onSubmit={async e => {
      e.preventDefault(); setError('');
      try { const result = await login(email, password);
        if (!result || !['admin', 'inventory'].includes(result.role)) { await logout(); setError('Use an Inventory or Admin account.'); return; }
        navigate(result.role === 'admin' ? '/admin/inventory/overview' : '/inventory/overview', { replace: true });
      } catch (err) { setError(err instanceof Error ? err.message : 'Login failed'); }
    }}>
      <img src="/logo.jpg" alt="JAPZ" className="w-20 mx-auto" /><h1 className="text-2xl font-semibold">Inventory sign in</h1>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <label className="block">Email<input className="block w-full border rounded p-2" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block">Password<input className="block w-full border rounded p-2" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button className="w-full bg-yellow-400 p-2 rounded" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
    </form>
  </main>;
}
