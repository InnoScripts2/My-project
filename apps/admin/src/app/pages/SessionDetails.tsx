import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Paper, Tabs, Tab, Stack, Chip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getSession, getSessionLogs } from '@/api/endpoints';
import StatusBadge from '@/components/StatusBadge';
import CodeBlock from '@/components/CodeBlock';
import { format } from 'date-fns';

export default function SessionDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  const { data: session } = useQuery({
    queryKey: ['session', id],
    queryFn: () => getSession(id!),
    enabled: !!id,
  });

  const { data: logs } = useQuery({
    queryKey: ['sessionLogs', id],
    queryFn: () => getSessionLogs(id!),
    enabled: !!id && tab === 0,
  });

  if (!session) {
    return <Typography>Загрузка...</Typography>;
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('sessionDetails.title')}
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="caption" color="textSecondary">
              {t('sessions.id')}
            </Typography>
            <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
              {session.id}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">
              {t('sessions.status')}
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              <StatusBadge status={session.status} />
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">
              {t('sessions.service')}
            </Typography>
            <Typography variant="body1">{t(`service.${session.service}`)}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="textSecondary">
              {t('sessions.startedAt')}
            </Typography>
            <Typography variant="body1">
              {format(new Date(session.startedAt), 'dd.MM.yyyy HH:mm:ss')}
            </Typography>
          </Box>
          {session.finishedAt && (
            <Box>
              <Typography variant="caption" color="textSecondary">
                {t('sessions.finishedAt')}
              </Typography>
              <Typography variant="body1">
                {format(new Date(session.finishedAt), 'dd.MM.yyyy HH:mm:ss')}
              </Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={t('sessionDetails.tabs.logs')} />
          <Tab label={t('sessionDetails.tabs.devices')} />
          <Tab label={t('sessionDetails.tabs.payments')} />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {t('sessionDetails.tabs.logs')}
              </Typography>
              {logs && logs.logs.length > 0 ? (
                <Stack spacing={1}>
                  {logs.logs.map((log, idx) => (
                    <Paper key={idx} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Chip
                          label={log.level}
                          size="small"
                          color={
                            log.level === 'error'
                              ? 'error'
                              : log.level === 'warn'
                                ? 'warning'
                                : 'default'
                          }
                        />
                        <Typography variant="caption" color="textSecondary">
                          {format(new Date(log.ts), 'HH:mm:ss.SSS')}
                        </Typography>
                        <Typography variant="body2">{log.message}</Typography>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              ) : (
                <Typography color="textSecondary">Логов пока нет</Typography>
              )}
            </Box>
          )}

          {tab === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {t('sessionDetails.tabs.devices')}
              </Typography>
              {session.deviceMeta ? (
                <CodeBlock>{JSON.stringify(session.deviceMeta, null, 2)}</CodeBlock>
              ) : (
                <Typography color="textSecondary">Информация об устройствах недоступна</Typography>
              )}
            </Box>
          )}

          {tab === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                {t('sessionDetails.tabs.payments')}
              </Typography>
              {session.payment ? (
                <Stack spacing={2}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      {t('sessionDetails.payments.intentId')}
                    </Typography>
                    <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                      {session.payment.intentId}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      {t('sessionDetails.payments.status')}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <StatusBadge status={session.payment.status} />
                    </Box>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">
                      {t('sessionDetails.payments.amount')}
                    </Typography>
                    <Typography variant="body1">
                      {session.payment.amount} {session.payment.currency}
                    </Typography>
                  </Box>
                </Stack>
              ) : (
                <Typography color="textSecondary">Информация о платежах недоступна</Typography>
              )}
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
