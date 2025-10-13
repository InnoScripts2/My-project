import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard } from '@/hooks/useDashboard';
import { Activity, Users, AlertCircle, TrendingUp } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export const Dashboard = () => {
  const { stats, isLoading } = useDashboard();

  if (isLoading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  const statusData = [
    { name: 'Active', value: stats?.activeClients || 0, color: '#89d185' },
    { name: 'Offline', value: stats?.offlineClients || 0, color: '#6c757d' },
    { name: 'Updating', value: stats?.updatingClients || 0, color: '#007acc' },
  ];

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="bg-secondary border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalClients || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-secondary border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Clients</CardTitle>
            <Activity className="h-4 w-4 text-[#89d185]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#89d185]">{stats?.activeClients || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-secondary border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Recent Updates</CardTitle>
            <TrendingUp className="h-4 w-4 text-[#007acc]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.recentUpdates || 0}</div>
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>

        <Card className="bg-secondary border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Critical Errors</CardTitle>
            <AlertCircle className="h-4 w-4 text-[#f48771]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#f48771]">{stats?.criticalErrors || 0}</div>
            <p className="text-xs text-muted-foreground">Last 24 hours</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-secondary border-border">
          <CardHeader>
            <CardTitle>Client Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-secondary border-border">
          <CardHeader>
            <CardTitle>Activity Timeline</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[300px]">
            <p className="text-muted-foreground">Activity chart will be populated with real data</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
