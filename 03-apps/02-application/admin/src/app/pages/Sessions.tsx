import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getSessions } from '@/api/endpoints';
import { Session } from '@/api/schemas';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '@/components/StatusBadge';
import CopyToClipboard from '@/components/CopyToClipboard';
import { format } from 'date-fns';

export default function Sessions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState<'OBD' | 'THICKNESS' | ''>('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', page, search, serviceFilter, statusFilter],
    queryFn: () =>
      getSessions({
        page,
        size: 20,
        q: search || undefined,
        service: serviceFilter || undefined,
        status: (statusFilter as 'created' | 'running' | 'completed' | 'failed' | 'cancelled') || undefined,
      }),
  });

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('sessions.title')}
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2}>
          <TextField
            label={t('sessions.filters.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="small"
            sx={{ flexGrow: 1 }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('sessions.filters.service')}</InputLabel>
            <Select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value as 'OBD' | 'THICKNESS' | '')}
              label={t('sessions.filters.service')}
            >
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="OBD">OBD</MenuItem>
              <MenuItem value="THICKNESS">Толщинометрия</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>{t('sessions.filters.status')}</InputLabel>
            <Select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              label={t('sessions.filters.status')}
            >
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="created">Создана</MenuItem>
              <MenuItem value="running">Выполняется</MenuItem>
              <MenuItem value="completed">Завершена</MenuItem>
              <MenuItem value="failed">Ошибка</MenuItem>
              <MenuItem value="cancelled">Отменена</MenuItem>
            </Select>
          </FormControl>
          <Button onClick={() => setPage(0)} variant="contained">
            {t('common.search')}
          </Button>
        </Stack>
      </Paper>

      {isLoading && <Typography>Загрузка...</Typography>}

      {data && (
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>{t('sessions.id')}</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>{t('sessions.service')}</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>{t('sessions.status')}</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>{t('sessions.startedAt')}</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>{t('sessions.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((session: Session) => (
                  <tr key={session.id} style={{ borderBottom: '1px solid #e0e0e0' }}>
                    <td style={{ padding: '12px' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {session.id.substring(0, 8)}...
                        </Typography>
                        <CopyToClipboard text={session.id} />
                      </Stack>
                    </td>
                    <td style={{ padding: '12px' }}>{t(`service.${session.service}`)}</td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={session.status} />
                    </td>
                    <td style={{ padding: '12px' }}>
                      {format(new Date(session.startedAt), 'dd.MM.yyyy HH:mm')}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <Button size="small" onClick={() => navigate(`/sessions/${session.id}`)}>
                        {t('sessions.viewDetails')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}>
            <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Назад
            </Button>
            <Typography>
              Страница {page + 1} из {Math.ceil((data.total || 0) / 20)}
            </Typography>
            <Button
              disabled={(page + 1) * 20 >= (data.total || 0)}
              onClick={() => setPage(p => p + 1)}
            >
              Далее
            </Button>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
