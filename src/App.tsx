import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Session } from '@supabase/supabase-js';
import { Toaster } from 'sonner';
import { Dashboard } from '@/components/Dashboard';
import { UpdateUpload } from '@/components/UpdateUpload';
import { ClientsList } from '@/components/ClientsList';
import { UpdatesList } from '@/components/UpdatesList';
import { LogsViewer } from '@/components/LogsViewer';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Upload, Users, Package, Terminal, LogOut } from 'lucide-react';

const queryClient = new QueryClient();

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background">
          <ConnectionStatus />
          {/* Header */}
          <header className="border-b border-border bg-secondary">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-foreground">
                Update System Admin
              </h1>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {session.user.email}
                </span>
                <Button variant="outline" size="sm" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            </div>
          </header>

          <div className="flex">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-secondary min-h-[calc(100vh-73px)]">
              <nav className="p-4 space-y-2">
                <NavLink to="/" icon={<LayoutDashboard />}>
                  Dashboard
                </NavLink>
                <NavLink to="/upload" icon={<Upload />}>
                  Upload Update
                </NavLink>
                <NavLink to="/updates" icon={<Package />}>
                  Updates
                </NavLink>
                <NavLink to="/clients" icon={<Users />}>
                  Clients
                </NavLink>
                <NavLink to="/logs" icon={<Terminal />}>
                  Logs
                </NavLink>
              </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/upload" element={<UpdateUpload />} />
                <Route path="/updates" element={<UpdatesList />} />
                <Route path="/clients" element={<ClientsList />} />
                <Route path="/logs" element={<LogsViewer />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </main>
          </div>
        </div>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-background transition-colors text-foreground"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </Link>
  );
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-secondary border border-border rounded-lg p-8">
          <h1 className="text-3xl font-bold mb-6 text-center">
            Update System Admin
          </h1>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>

            {error && (
              <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded px-4 py-2">
                {error}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;
