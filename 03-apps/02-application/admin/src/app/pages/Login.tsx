import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Tab,
  Tabs,
  Alert,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { login } from '@/api/endpoints';
import { setTokens } from '@/store/auth';
import { enqueueSnackbar } from 'notistack';

const emailLoginSchema = z.object({
  email: z.string().email('Неверный формат email'),
  password: z.string().min(1, 'Пароль обязателен'),
});

const tokenLoginSchema = z.object({
  token: z.string().min(1, 'Токен обязателен'),
});

type EmailLoginForm = z.infer<typeof emailLoginSchema>;
type TokenLoginForm = z.infer<typeof tokenLoginSchema>;

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const emailForm = useForm<EmailLoginForm>({
    resolver: zodResolver(emailLoginSchema),
  });

  const tokenForm = useForm<TokenLoginForm>({
    resolver: zodResolver(tokenLoginSchema),
  });

  const handleEmailLogin = async (data: EmailLoginForm) => {
    try {
      setError(null);
      const response = await login({ email: data.email, password: data.password });
      setTokens(response.accessToken, response.refreshToken);
      enqueueSnackbar(t('auth.success'), { variant: 'success' });
      navigate('/');
    } catch (err) {
      const message = (err as { message?: string }).message || t('auth.invalidCredentials');
      setError(message);
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  const handleTokenLogin = async (data: TokenLoginForm) => {
    try {
      setError(null);
      const response = await login({ token: data.token });
      setTokens(response.accessToken, response.refreshToken);
      enqueueSnackbar(t('auth.success'), { variant: 'success' });
      navigate('/');
    } catch (err) {
      const message = (err as { message?: string }).message || t('auth.invalidCredentials');
      setError(message);
      enqueueSnackbar(message, { variant: 'error' });
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            {t('auth.login')}
          </Typography>

          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 3 }}>
            <Tab label={t('auth.loginWithEmail')} />
            <Tab label={t('auth.loginWithToken')} />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {tabValue === 0 && (
            <form onSubmit={emailForm.handleSubmit(handleEmailLogin)}>
              <TextField
                {...emailForm.register('email')}
                label={t('auth.email')}
                type="email"
                fullWidth
                margin="normal"
                error={!!emailForm.formState.errors.email}
                helperText={emailForm.formState.errors.email?.message}
              />
              <TextField
                {...emailForm.register('password')}
                label={t('auth.password')}
                type="password"
                fullWidth
                margin="normal"
                error={!!emailForm.formState.errors.password}
                helperText={emailForm.formState.errors.password?.message}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                sx={{ mt: 3 }}
                disabled={emailForm.formState.isSubmitting}
              >
                {t('auth.login')}
              </Button>
            </form>
          )}

          {tabValue === 1 && (
            <form onSubmit={tokenForm.handleSubmit(handleTokenLogin)}>
              <TextField
                {...tokenForm.register('token')}
                label={t('auth.token')}
                fullWidth
                margin="normal"
                multiline
                rows={4}
                error={!!tokenForm.formState.errors.token}
                helperText={tokenForm.formState.errors.token?.message}
              />
              <Button
                type="submit"
                variant="contained"
                fullWidth
                size="large"
                sx={{ mt: 3 }}
                disabled={tokenForm.formState.isSubmitting}
              >
                {t('auth.login')}
              </Button>
            </form>
          )}
        </Paper>
      </Box>
    </Container>
  );
}
