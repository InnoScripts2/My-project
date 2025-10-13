# CSP (Content Security Policy) Headers Examples
# Примеры заголовков безопасности для защиты от XSS, инъекций и других атак

## Обзор

Content Security Policy (CSP) — механизм защиты, который помогает предотвратить атаки типа:
- Cross-Site Scripting (XSS)
- Clickjacking
- Code injection
- Data injection

## Базовые заголовки безопасности

### Helmet.js Configuration (Node.js/Express)

```typescript
// apps/cloud-api/src/middleware/Security.ts
import helmet from 'helmet';
import cors from 'cors';
import { Express } from 'express';

export function securityMiddleware(app: Express) {
  // Helmet для базовых заголовков безопасности
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],  // unsafe-inline для inline стилей
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.SUPABASE_URL!],  // API endpoints
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],  // Запрет iframe
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  
  // CORS с whitelist
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8080'];
  
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    maxAge: 86400, // 24 hours
  }));
  
  // Дополнительные заголовки
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });
}
```

## CSP для статичного фронтенда

### HTML Meta Tag (если нет возможности настроить сервер)

```html
<!-- apps/kiosk-frontend/index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://your-project.supabase.co;
  font-src 'self';
  object-src 'none';
  frame-src 'none';
">
```

### Nginx Configuration

```nginx
# /etc/nginx/sites-available/kiosk-frontend
server {
    listen 443 ssl http2;
    server_name kiosk.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security Headers
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://prod-project.supabase.co; font-src 'self'; object-src 'none'; frame-src 'none';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    root /var/www/kiosk-frontend;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

## Настройки CSP по окружениям

### DEV Environment

```typescript
// Более мягкие ограничения для разработки
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // для HMR
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'http:', 'https:'],
    connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:*'],  // для dev servers
  },
}
```

### PROD Environment

```typescript
// Строгие ограничения для продакшена
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],  // Без unsafe-inline/unsafe-eval
    styleSrc: ["'self'", "'unsafe-inline'"],  // unsafe-inline только для стилей
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", process.env.SUPABASE_URL, process.env.CLOUD_API_URL],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    upgradeInsecureRequests: [],  // Принудительный HTTPS
  },
}
```

## Тестирование CSP

### Проверка заголовков

```bash
# Проверить заголовки безопасности
curl -I https://kiosk.example.com

# Должны присутствовать:
# Content-Security-Policy: ...
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# X-XSS-Protection: 1; mode=block
# Strict-Transport-Security: max-age=31536000
```

### Онлайн инструменты

- https://securityheaders.com/ — анализ заголовков безопасности
- https://csp-evaluator.withgoogle.com/ — проверка CSP политики

## Распространённые проблемы и решения

### Проблема: inline scripts блокируются

**Решение:**
- Переместить все inline scripts в отдельные .js файлы
- Или использовать nonce/hash для inline scripts (не рекомендуется)

```typescript
// Генерация nonce (если необходимо)
const nonce = crypto.randomBytes(16).toString('base64');
res.locals.cspNonce = nonce;

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
    },
  },
}));

// В HTML:
// <script nonce="<%= cspNonce %>">...</script>
```

### Проблема: CORS ошибки с Supabase

**Решение:**
- Добавить Supabase URL в connectSrc
- Проверить ALLOWED_ORIGINS на стороне API

```typescript
connectSrc: ["'self'", process.env.SUPABASE_URL],
```

### Проблема: WebSocket соединения блокируются

**Решение:**
- Добавить 'ws:' и 'wss:' в connectSrc

```typescript
connectSrc: ["'self'", 'wss://prod-project.supabase.co'],
```

## Контрольный список CSP

- [ ] CSP заголовки настроены для всех приложений
- [ ] `default-src 'self'` установлен
- [ ] Нет `'unsafe-eval'` в production
- [ ] `'unsafe-inline'` для script-src отключен (или с nonce)
- [ ] `frame-src 'none'` для защиты от clickjacking
- [ ] `object-src 'none'` для блокировки plugins
- [ ] CORS настроен с whitelist origins
- [ ] X-Frame-Options: DENY установлен
- [ ] X-Content-Type-Options: nosniff установлен
- [ ] Strict-Transport-Security настроен в PROD
- [ ] Протестировано на https://securityheaders.com/
- [ ] CSP не блокирует легитимные запросы

## Мониторинг нарушений CSP

```typescript
// Логирование нарушений CSP
app.use((req, res, next) => {
  if (req.path === '/csp-violation-report') {
    console.error('CSP violation:', req.body);
    res.status(204).end();
  } else {
    next();
  }
});

// В CSP добавить report-uri
contentSecurityPolicy: {
  directives: {
    // ...
    reportUri: ['/csp-violation-report'],
  },
}
```

## Ссылки

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [OWASP CSP Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
