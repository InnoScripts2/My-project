import { Box, Typography, Grid, Paper, Card, CardContent } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getMetrics } from '@/api/endpoints';

export default function Dashboard() {
  const { t } = useTranslation();

  const { data: metricsData } = useQuery({
    queryKey: ['metrics', 'dashboard'],
    queryFn: () => getMetrics({ name: 'dashboard' }),
    refetchInterval: 15000,
  });

  const activeSessions = metricsData?.metrics.find(m => m.name === 'active_sessions')?.value || 0;
  const errors15min = metricsData?.metrics.find(m => m.name === 'errors_15min')?.value || 0;
  const avgLatency = metricsData?.metrics.find(m => m.name === 'avg_latency')?.value || 0;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('dashboard.title')}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('dashboard.activeSessions')}
              </Typography>
              <Typography variant="h3">{activeSessions}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('dashboard.errorsLast15Min')}
              </Typography>
              <Typography variant="h3" color={errors15min > 0 ? 'error' : 'textPrimary'}>
                {errors15min}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                {t('dashboard.avgLatency')}
              </Typography>
              <Typography variant="h3">{avgLatency.toFixed(0)}ms</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('dashboard.recentEvents')}
        </Typography>
        <Typography color="textSecondary">Событий пока нет</Typography>
      </Paper>
    </Box>
  );
}
