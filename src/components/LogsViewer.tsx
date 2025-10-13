import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useClients } from '@/hooks/useClients';
import { format } from 'date-fns';
import { Search, Terminal } from 'lucide-react';

export const LogsViewer = () => {
  const [clientFilter, setClientFilter] = useState<string>('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  const { clients } = useClients();
  const { logs, isLoading } = useTelemetry({
    clientId: clientFilter || undefined,
    logLevel: levelFilter || undefined,
    searchTerm: searchTerm || undefined,
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'info':
        return 'bg-[#007acc] text-white';
      case 'warning':
        return 'bg-[#dcdcaa] text-black';
      case 'error':
        return 'bg-[#f48771] text-white';
      case 'critical':
        return 'bg-[#f48771] text-white';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Telemetry Logs</h1>
        <div className="text-lg text-muted-foreground">
          {logs?.length || 0} logs
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search in messages..."
            className="pl-10 bg-secondary"
          />
        </div>

        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="bg-secondary">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Clients</SelectItem>
            {clients?.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.hostname || client.client_id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="bg-secondary">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Levels</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Logs List */}
      <Card className="bg-secondary border-border p-4">
        <div className="space-y-2 max-h-[600px] overflow-y-auto font-mono text-sm">
          {isLoading && (
            <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
          )}

          {logs?.map((log) => (
            <div
              key={log.id}
              className="flex gap-4 p-3 rounded hover:bg-background/50 transition-colors"
            >
              <div className="flex-shrink-0 text-muted-foreground">
                {format(new Date(log.created_at), 'HH:mm:ss')}
              </div>

              <Badge className={`${getLevelColor(log.log_level)} flex-shrink-0`}>
                {log.log_level.toUpperCase()}
              </Badge>

              <div className="flex-shrink-0 text-[#007acc]">
                [{log.clients?.hostname || log.clients?.client_id || 'Unknown'}]
              </div>

              <div className="flex-1 break-words">
                {log.message}
              </div>
            </div>
          ))}

          {logs?.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <Terminal className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg text-muted-foreground">No logs found</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
