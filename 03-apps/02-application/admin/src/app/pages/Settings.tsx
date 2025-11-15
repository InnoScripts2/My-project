import { Box, Typography, Paper } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function Settings() {
  const { t } = useTranslation();

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        {t('settings.title')}
      </Typography>

      <Paper sx={{ p: 3 }}>
        <Typography color="textSecondary">
          Настройки конфигурации будут доступны после реализации API
        </Typography>
      </Paper>
    </Box>
  );
}
