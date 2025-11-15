import { Box, Typography, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function Monitoring() {
  const { t } = useTranslation();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('monitoring.title')}
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Typography color="textSecondary">
          Графики мониторинга будут доступны после подключения данных
        </Typography>
      </Paper>
    </Box>
  );
}
