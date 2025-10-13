import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClients } from '@/hooks/useClients';
import { formatDistanceToNow } from 'date-fns';
import { Monitor, Search } from 'lucide-react';

export const ClientsList = () => {
  const { clients, isLoading } = useClients();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredClients = clients?.filter((client) => {
    const matchesSearch =
      client.hostname?.toLowerCase().includes(search.toLowerCase()) ||
      client.client_id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-[#89d185] text-black';
      case 'offline':
        return 'bg-[#6c757d] text-white';
      case 'updating':
        return 'bg-[#007acc] text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getPlatformIcon = (platform: string | null) => {
    if (!platform) return '💻';
    if (platform.toLowerCase().includes('windows')) return '🪟';
    if (platform.toLowerCase().includes('linux')) return '🐧';
    if (platform.toLowerCase().includes('mac')) return '🍎';
    return '💻';
  };

  if (isLoading) {
    return <div className="p-8">Loading clients...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Connected Clients</h1>
        <div className="text-lg text-muted-foreground">
          {filteredClients?.length || 0} clients
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by hostname or client ID..."
            className="pl-10 bg-secondary"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-secondary">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="updating">Updating</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Clients Grid */}
      <div className="grid gap-4">
        {filteredClients?.map((client) => (
          <Card key={client.id} className="bg-secondary border-border hover:bg-secondary/80 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-3xl">{getPlatformIcon(client.platform)}</div>
                  <div>
                    <CardTitle className="text-lg">
                      {client.hostname || 'Unknown Host'}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground font-mono">
                      {client.client_id}
                    </p>
                  </div>
                </div>
                <Badge className={getStatusColor(client.status)}>
                  {client.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Version</p>
                  <p className="font-medium">{client.app_version || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Platform</p>
                  <p className="font-medium">{client.platform || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Seen</p>
                  <p className="font-medium">
                    {client.last_seen
                      ? formatDistanceToNow(new Date(client.last_seen), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Last Heartbeat</p>
                  <p className="font-medium">
                    {client.last_heartbeat
                      ? formatDistanceToNow(new Date(client.last_heartbeat), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients?.length === 0 && (
        <div className="text-center py-12">
          <Monitor className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">No clients found</p>
        </div>
      )}
    </div>
  );
};
