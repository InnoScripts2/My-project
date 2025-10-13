# Стратегия DevOps и безопасности

## Обзор

Документ описывает практики DevOps для достижения непрерывной доставки, автоматизации и безопасности на всех этапах разработки и эксплуатации системы.

## 1. CI/CD Pipeline

### 1.1 GitHub Actions Workflows

```yaml
# .github/workflows/ci.yml
name: Continuous Integration

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run ESLint
        run: npm run lint:eslint
      
      - name: Run HTMLHint
        run: npm run lint:html
      
      - name: Check TypeScript
        run: npx tsc --noEmit
  
  test:
    name: Test
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm --prefix 03-apps/02-application/kiosk-agent ci
          npm --prefix 03-apps/02-application/cloud-api ci
      
      - name: Run tests
        run: npm run test:all
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./03-apps/02-application/kiosk-agent/coverage/lcov.info,./03-apps/02-application/cloud-api/coverage/lcov.info
  
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run npm audit
        run: npm audit --production --audit-level=moderate
        continue-on-error: true
      
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
      
      - name: Run TruffleHog
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          head: HEAD
  
  build:
    name: Build
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          npm ci
          npm --prefix 03-apps/02-application/kiosk-agent ci
          npm --prefix 03-apps/02-application/cloud-api ci
      
      - name: Build Agent
        run: npm --prefix 03-apps/02-application/kiosk-agent run build
      
      - name: Build Cloud API
        run: npm --prefix 03-apps/02-application/cloud-api run build
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: build-artifacts
          path: |
            03-apps/02-application/kiosk-agent/dist/
            03-apps/02-application/cloud-api/dist/
          retention-days: 7
```

### 1.2 Deployment Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]
    tags:
      - 'v*.*.*'

jobs:
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://staging.kiosk.example.com
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Build
        run: |
          npm ci
          npm --prefix 03-apps/02-application/cloud-api ci
          npm --prefix 03-apps/02-application/cloud-api run build
      
      - name: Deploy to Cloud Run (Staging)
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: kiosk-api-staging
          image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/kiosk-api:${{ github.sha }}
          region: europe-west1
          env_vars: |
            NODE_ENV=staging
            SUPABASE_URL=${{ secrets.STAGING_SUPABASE_URL }}
            SUPABASE_SERVICE_ROLE_KEY=${{ secrets.STAGING_SUPABASE_KEY }}
      
      - name: Run smoke tests
        run: npm run test:smoke -- --url=https://staging.kiosk.example.com
  
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    environment:
      name: production
      url: https://api.kiosk.example.com
    needs: [deploy-staging]
    steps:
      - uses: actions/checkout@v4
      
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: ./03-apps/02-application/cloud-api
          push: true
          tags: |
            gcr.io/${{ secrets.GCP_PROJECT_ID }}/kiosk-api:${{ github.ref_name }}
            gcr.io/${{ secrets.GCP_PROJECT_ID }}/kiosk-api:latest
      
      - name: Deploy to Cloud Run (Production)
        uses: google-github-actions/deploy-cloudrun@v1
        with:
          service: kiosk-api-production
          image: gcr.io/${{ secrets.GCP_PROJECT_ID }}/kiosk-api:${{ github.ref_name }}
          region: europe-west1,us-central1 # Multi-region
          env_vars: |
            NODE_ENV=production
            SUPABASE_URL=${{ secrets.PROD_SUPABASE_URL }}
            SUPABASE_SERVICE_ROLE_KEY=${{ secrets.PROD_SUPABASE_KEY }}
      
      - name: Create release
        uses: actions/create-release@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tag_name: ${{ github.ref_name }}
          release_name: Release ${{ github.ref_name }}
          body: |
            ## Changes
            ${{ github.event.head_commit.message }}
            
            ## Deployment
            - Staging: https://staging.kiosk.example.com
            - Production: https://api.kiosk.example.com
          draft: false
          prerelease: false
```

### 1.3 Database Migrations

```yaml
# .github/workflows/migrate.yml
name: Database Migrations

on:
  push:
    paths:
      - 'supabase/migrations/**'
    branches: [main]

jobs:
  migrate-staging:
    name: Migrate Staging
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
      
      - name: Run migrations (Staging)
        run: |
          supabase link --project-ref ${{ secrets.STAGING_PROJECT_REF }}
          supabase db push --db-url ${{ secrets.STAGING_DATABASE_URL }}
      
      - name: Verify migrations
        run: |
          npm --prefix 03-apps/02-application/cloud-api run test:integration
  
  migrate-production:
    name: Migrate Production
    runs-on: ubuntu-latest
    needs: [migrate-staging]
    if: github.ref == 'refs/heads/main'
    environment:
      name: production-db
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
      
      - name: Backup database
        run: |
          pg_dump ${{ secrets.PROD_DATABASE_URL }} | \
            gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
          
          aws s3 cp backup_*.sql.gz s3://kiosk-backups/database/
      
      - name: Run migrations (Production)
        run: |
          supabase link --project-ref ${{ secrets.PROD_PROJECT_REF }}
          supabase db push --db-url ${{ secrets.PROD_DATABASE_URL }}
      
      - name: Verify migrations
        run: |
          npm --prefix 03-apps/02-application/cloud-api run test:smoke -- --db-only
```

## 2. Infrastructure as Code

### 2.1 Terraform для Cloud Resources

```hcl
# infra/terraform/main.tf
terraform {
  required_version = ">= 1.5"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }
  
  backend "gcs" {
    bucket = "kiosk-terraform-state"
    prefix = "production"
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}

# Cloud Run Service
resource "google_cloud_run_service" "kiosk_api" {
  name     = "kiosk-api-${var.environment}"
  location = var.gcp_region
  
  template {
    spec {
      containers {
        image = "gcr.io/${var.gcp_project_id}/kiosk-api:${var.image_tag}"
        
        env {
          name  = "NODE_ENV"
          value = var.environment
        }
        
        env {
          name = "SUPABASE_URL"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.supabase_url.secret_id
              key  = "latest"
            }
          }
        }
        
        resources {
          limits = {
            cpu    = "2"
            memory = "1Gi"
          }
        }
      }
      
      container_concurrency = 80
      timeout_seconds       = 300
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = var.min_instances
        "autoscaling.knative.dev/maxScale" = var.max_instances
      }
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Load Balancer
resource "google_compute_global_address" "kiosk_api" {
  name = "kiosk-api-${var.environment}-ip"
}

resource "google_compute_url_map" "kiosk_api" {
  name            = "kiosk-api-${var.environment}-lb"
  default_service = google_compute_backend_service.kiosk_api.id
}

# Cloud SQL (PostgreSQL для локальной БД)
resource "google_sql_database_instance" "kiosk_db" {
  name             = "kiosk-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.gcp_region
  
  settings {
    tier              = "db-custom-4-16384" # 4 vCPU, 16GB RAM
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    
    backup_configuration {
      enabled            = true
      start_time         = "03:00"
      point_in_time_recovery_enabled = true
      backup_retention_settings {
        retained_backups = 30
      }
    }
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.kiosk_vpc.id
    }
    
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
    }
  }
}

# Monitoring Alerting
resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate - ${var.environment}"
  combiner     = "OR"
  
  conditions {
    display_name = "HTTP 5xx Error Rate > 5%"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.label.response_code_class=\"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0.05
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.pagerduty.id,
    google_monitoring_notification_channel.slack.id,
  ]
}
```

### 2.2 Docker Compose для локальной разработки

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: kiosk
      POSTGRES_USER: kiosk_user
      POSTGRES_PASSWORD: dev_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./supabase/migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kiosk_user"]
      interval: 10s
      timeout: 5s
      retries: 5
  
  # Redis для очередей
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
  
  # Kiosk Agent
  kiosk-agent:
    build:
      context: ./03-apps/02-application/kiosk-agent
      dockerfile: Dockerfile
    environment:
      NODE_ENV: development
      AGENT_PORT: 7070
      AGENT_PERSISTENCE: pg
      DATABASE_URL: postgresql://kiosk_user:dev_password@postgres:5432/kiosk
      REDIS_URL: redis://redis:6379
    ports:
      - "7070:7070"
    volumes:
      - ./03-apps/02-application/kiosk-agent/src:/app/src
      - ./03-apps/02-application/kiosk-agent/dist:/app/dist
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
  
  # Cloud API
  cloud-api:
    build:
      context: ./03-apps/02-application/cloud-api
      dockerfile: Dockerfile
    environment:
      NODE_ENV: development
      PORT: 3000
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      DATABASE_URL: postgresql://kiosk_user:dev_password@postgres:5432/kiosk
    ports:
      - "3000:3000"
    volumes:
      - ./03-apps/02-application/cloud-api/src:/app/src
      - ./03-apps/02-application/cloud-api/dist:/app/dist
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
  
  # Prometheus
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./infra/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./infra/prometheus/alerts:/etc/prometheus/alerts
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.enable-lifecycle'
    restart: unless-stopped
  
  # Grafana
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_INSTALL_PLUGINS: grafana-piechart-panel
    volumes:
      - ./infra/grafana/provisioning:/etc/grafana/provisioning
      - ./infra/grafana/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus
    restart: unless-stopped
  
  # Jaeger для tracing
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686" # UI
      - "14268:14268" # HTTP
      - "4318:4318"   # OTLP
    environment:
      COLLECTOR_OTLP_ENABLED: true
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:
```

### 2.3 Kubernetes Deployment

```yaml
# kubernetes/kiosk-agent-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kiosk-agent
  namespace: kiosk-system
  labels:
    app: kiosk-agent
    version: v1.0.0
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: kiosk-agent
  template:
    metadata:
      labels:
        app: kiosk-agent
        version: v1.0.0
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "7070"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: kiosk-agent
      
      # Init container для миграций
      initContainers:
      - name: migrate
        image: migrate/migrate:latest
        command: ['migrate', '-path', '/migrations', '-database', '$(DATABASE_URL)', 'up']
        envFrom:
        - secretRef:
            name: kiosk-secrets
      
      containers:
      - name: kiosk-agent
        image: gcr.io/project/kiosk-agent:v1.0.0
        imagePullPolicy: IfNotPresent
        
        ports:
        - name: http
          containerPort: 7070
          protocol: TCP
        
        env:
        - name: NODE_ENV
          value: "production"
        - name: AGENT_PORT
          value: "7070"
        - name: AGENT_PERSISTENCE
          value: "pg"
        
        envFrom:
        - configMapRef:
            name: kiosk-config
        - secretRef:
            name: kiosk-secrets
        
        resources:
          requests:
            cpu: 500m
            memory: 512Mi
          limits:
            cpu: 2000m
            memory: 2Gi
        
        livenessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        
        readinessProbe:
          httpGet:
            path: /health
            port: http
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          successThreshold: 1
          failureThreshold: 3
        
        volumeMounts:
        - name: logs
          mountPath: /var/log/kiosk-agent
        - name: config
          mountPath: /app/config
          readOnly: true
      
      volumes:
      - name: logs
        emptyDir: {}
      - name: config
        configMap:
          name: kiosk-config
      
      # Affinity для распределения по нодам
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchExpressions:
                - key: app
                  operator: In
                  values:
                  - kiosk-agent
              topologyKey: kubernetes.io/hostname
---
apiVersion: v1
kind: Service
metadata:
  name: kiosk-agent
  namespace: kiosk-system
spec:
  type: ClusterIP
  selector:
    app: kiosk-agent
  ports:
  - name: http
    port: 80
    targetPort: http
    protocol: TCP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: kiosk-agent-hpa
  namespace: kiosk-system
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: kiosk-agent
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 30
      - type: Pods
        value: 2
        periodSeconds: 30
      selectPolicy: Max
```

## 3. Безопасность

### 3.1 Secrets Management

```typescript
// packages/secrets/SecretsManager.ts
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

class SecretsManager {
  private client: SecretManagerServiceClient;
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();
  
  constructor() {
    this.client = new SecretManagerServiceClient();
  }
  
  async getSecret(secretName: string, cacheDuration: number = 3600000): Promise<string> {
    // Проверка кеша
    const cached = this.cache.get(secretName);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    
    // Загрузка из Secret Manager
    const [version] = await this.client.accessSecretVersion({
      name: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}/versions/latest`,
    });
    
    const value = version.payload?.data?.toString() || '';
    
    // Кеширование
    this.cache.set(secretName, {
      value,
      expiresAt: Date.now() + cacheDuration,
    });
    
    return value;
  }
  
  async rotateSecret(secretName: string, newValue: string): Promise<void> {
    // Создание новой версии секрета
    await this.client.addSecretVersion({
      parent: `projects/${process.env.GCP_PROJECT_ID}/secrets/${secretName}`,
      payload: {
        data: Buffer.from(newValue),
      },
    });
    
    // Инвалидация кеша
    this.cache.delete(secretName);
    
    // Логирование ротации
    logger.info('Secret rotated', { secretName });
  }
}

export const secretsManager = new SecretsManager();
```

### 3.2 Authentication & Authorization

```typescript
// 03-apps/02-application/cloud-api/src/middleware/Auth.ts
import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export const authMiddleware = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  }),
  audience: process.env.SUPABASE_JWT_AUDIENCE,
  issuer: `${process.env.SUPABASE_URL}/auth/v1`,
  algorithms: ['RS256'],
});

// Role-based access control
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.auth?.role;
    
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    }
    
    next();
  };
}

// Использование
app.get('/api/admin/users', 
  authMiddleware,
  requireRole('admin', 'operator'),
  async (req, res) => {
    // Только для admin и operator
  }
);
```

### 3.3 Rate Limiting

```typescript
// 03-apps/02-application/cloud-api/src/middleware/RateLimit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Базовый лимит
export const apiLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:api:',
  }),
  windowMs: 60 * 1000, // 1 минута
  max: 100, // 100 запросов
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Строгий лимит для чувствительных операций
export const strictLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rl:strict:',
  }),
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // 5 запросов
  message: 'Too many attempts, please try again later',
  skipSuccessfulRequests: true, // Считать только неудачные
});

// Адаптивный лимит на основе нагрузки
export function adaptiveRateLimit(baseMax: number) {
  return rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: 'rl:adaptive:',
    }),
    windowMs: 60 * 1000,
    max: async (req, res) => {
      const load = await getSystemLoad();
      
      // Снижение лимита при высокой нагрузке
      if (load > 0.8) return Math.floor(baseMax * 0.5);
      if (load > 0.6) return Math.floor(baseMax * 0.75);
      
      return baseMax;
    },
  });
}
```

### 3.4 Input Validation

```typescript
// packages/validation/Validators.ts
import { z } from 'zod';
import validator from 'validator';

// Схемы валидации
export const schemas = {
  // Создание сессии
  createSession: z.object({
    serviceType: z.enum(['thickness', 'diagnostics']),
    vehicleType: z.enum(['sedan', 'hatchback', 'suv', 'minivan']).optional(),
    vehicleVIN: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional(),
    customerContact: z.object({
      type: z.enum(['email', 'phone']),
      value: z.string().refine((val) => {
        return validator.isEmail(val) || validator.isMobilePhone(val, 'any');
      }),
    }),
  }),
  
  // Создание платежа
  createPayment: z.object({
    amount: z.number().positive().max(100000),
    currency: z.enum(['RUB', 'USD', 'EUR']),
    sessionId: z.string().uuid(),
    metadata: z.record(z.unknown()).optional(),
  }),
  
  // OBD подключение
  obdConnect: z.object({
    portPath: z.string().min(1),
    baudRate: z.number().int().positive().optional(),
    protocol: z.enum(['AUTO', 'ISO_15765_4_CAN', 'ISO_9141_2', 'KWP2000', 'J1850_PWM', 'J1850_VPW']).optional(),
  }),
};

// Middleware для валидации
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
}

// Использование
app.post('/api/sessions',
  validateBody(schemas.createSession),
  async (req, res) => {
    // req.body уже провалидирован
  }
);
```

### 3.5 Security Headers

```typescript
// 03-apps/02-application/cloud-api/src/middleware/Security.ts
import helmet from 'helmet';
import cors from 'cors';

export function securityMiddleware(app: Express) {
  // Helmet для базовых заголовков безопасности
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", process.env.SUPABASE_URL!],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  
  // CORS
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
  
  // Custom headers
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

### 3.6 Audit Logging

```typescript
// 03-apps/02-application/kiosk-agent/src/monitoring/AuditLogger.ts
class AuditLogger {
  async log(event: AuditEvent): Promise<void> {
    const entry: AuditLogEntry = {
      id: uuidv4(),
      timestamp: new Date(),
      eventType: event.type,
      actor: {
        id: event.actorId,
        type: event.actorType,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
      },
      resource: {
        type: event.resourceType,
        id: event.resourceId,
      },
      action: event.action,
      outcome: event.outcome,
      details: event.details,
      metadata: {
        requestId: event.requestId,
        sessionId: event.sessionId,
      },
    };
    
    // Сохранение в БД
    await store.saveAuditLog(entry);
    
    // Логирование в файл
    securityLogger.info('Audit event', entry);
    
    // Отправка в SIEM (если критичное событие)
    if (this.isCriticalEvent(event.type)) {
      await this.sendToSIEM(entry);
    }
  }
  
  private isCriticalEvent(eventType: string): boolean {
    const criticalEvents = [
      'user.login.failed',
      'user.password.changed',
      'user.role.changed',
      'payment.refund',
      'device.calibration',
      'config.changed',
      'data.exported',
      'data.deleted',
    ];
    
    return criticalEvents.includes(eventType);
  }
}

// Примеры использования
auditLogger.log({
  type: 'payment.created',
  actorId: 'terminal_001',
  actorType: 'terminal',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'],
  resourceType: 'payment',
  resourceId: payment.id,
  action: 'create',
  outcome: 'success',
  details: { amount: payment.amount, currency: payment.currency },
  requestId: req.requestId,
});
```

## 4. Disaster Recovery

### 4.1 Backup Strategy

```bash
#!/bin/bash
# infra/scripts/backup.sh

set -euo pipefail

BACKUP_DIR="/var/backups/kiosk"
RETENTION_DAYS=30
S3_BUCKET="s3://kiosk-backups"

# Создание директории
mkdir -p "$BACKUP_DIR"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# PostgreSQL backup
echo "Backing up PostgreSQL..."
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"

# Redis backup
echo "Backing up Redis..."
redis-cli --rdb "$BACKUP_DIR/redis_$TIMESTAMP.rdb"
gzip "$BACKUP_DIR/redis_$TIMESTAMP.rdb"

# Supabase Storage backup
echo "Backing up Supabase Storage..."
aws s3 sync "$SUPABASE_STORAGE_URL" "$BACKUP_DIR/storage_$TIMESTAMP"
tar -czf "$BACKUP_DIR/storage_$TIMESTAMP.tar.gz" "$BACKUP_DIR/storage_$TIMESTAMP"
rm -rf "$BACKUP_DIR/storage_$TIMESTAMP"

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz" "$S3_BUCKET/postgres/"
aws s3 cp "$BACKUP_DIR/redis_$TIMESTAMP.rdb.gz" "$S3_BUCKET/redis/"
aws s3 cp "$BACKUP_DIR/storage_$TIMESTAMP.tar.gz" "$S3_BUCKET/storage/"

# Cleanup old local backups
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -type f -mtime +7 -delete

# Cleanup old S3 backups
echo "Cleaning up old S3 backups..."
aws s3 ls "$S3_BUCKET/postgres/" | awk '{if ($1 < "'$(date -d "$RETENTION_DAYS days ago" +%Y-%m-%d)'") print $4}' | \
  xargs -I {} aws s3 rm "$S3_BUCKET/postgres/{}"

echo "Backup completed successfully"
```

### 4.2 Restore Procedure

```bash
#!/bin/bash
# infra/scripts/restore.sh

set -euo pipefail

BACKUP_FILE="$1"
RESTORE_TYPE="$2" # postgres | redis | storage

case "$RESTORE_TYPE" in
  postgres)
    echo "Restoring PostgreSQL from $BACKUP_FILE..."
    
    # Download from S3 if needed
    if [[ "$BACKUP_FILE" == s3://* ]]; then
      aws s3 cp "$BACKUP_FILE" /tmp/restore.sql.gz
      BACKUP_FILE="/tmp/restore.sql.gz"
    fi
    
    # Restore
    gunzip -c "$BACKUP_FILE" | psql "$DATABASE_URL"
    
    echo "PostgreSQL restored successfully"
    ;;
    
  redis)
    echo "Restoring Redis from $BACKUP_FILE..."
    
    if [[ "$BACKUP_FILE" == s3://* ]]; then
      aws s3 cp "$BACKUP_FILE" /tmp/restore.rdb.gz
      BACKUP_FILE="/tmp/restore.rdb.gz"
    fi
    
    # Stop Redis
    redis-cli shutdown nosave
    
    # Restore RDB
    gunzip -c "$BACKUP_FILE" > /var/lib/redis/dump.rdb
    
    # Start Redis
    systemctl start redis
    
    echo "Redis restored successfully"
    ;;
    
  storage)
    echo "Restoring Storage from $BACKUP_FILE..."
    
    if [[ "$BACKUP_FILE" == s3://* ]]; then
      aws s3 cp "$BACKUP_FILE" /tmp/restore.tar.gz
      BACKUP_FILE="/tmp/restore.tar.gz"
    fi
    
    # Extract and sync
    tar -xzf "$BACKUP_FILE" -C /tmp
    aws s3 sync /tmp/storage "$SUPABASE_STORAGE_URL"
    
    echo "Storage restored successfully"
    ;;
    
  *)
    echo "Unknown restore type: $RESTORE_TYPE"
    exit 1
    ;;
esac
```

### 4.3 Disaster Recovery Testing

```yaml
# .github/workflows/dr-test.yml
name: Disaster Recovery Test

on:
  schedule:
    - cron: '0 0 1 * *' # Первое число каждого месяца
  workflow_dispatch:

jobs:
  test-restore:
    name: Test Backup Restore
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup environment
        run: |
          docker-compose -f docker-compose.test.yml up -d postgres redis
          sleep 10
      
      - name: Download latest backup
        run: |
          aws s3 cp $(aws s3 ls s3://kiosk-backups/postgres/ | sort | tail -n 1 | awk '{print $4}') latest_backup.sql.gz
      
      - name: Restore database
        run: |
          gunzip -c latest_backup.sql.gz | \
            docker-compose -f docker-compose.test.yml exec -T postgres \
            psql -U kiosk_user -d kiosk
      
      - name: Verify data integrity
        run: |
          npm run test:integrity
      
      - name: Run smoke tests
        run: |
          npm run test:smoke -- --db-only
      
      - name: Cleanup
        if: always()
        run: |
          docker-compose -f docker-compose.test.yml down -v
      
      - name: Notify team
        if: failure()
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          text: 'Disaster recovery test failed!'
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Заключение

Эта стратегия DevOps и безопасности обеспечивает:
- **Автоматизацию:** CI/CD для всех компонентов
- **Безопасность:** secrets management, auth, rate limiting, audit logging
- **Отказоустойчивость:** backups, disaster recovery, health checks
- **Масштабируемость:** IaC, Kubernetes, auto-scaling
- **Наблюдаемость:** интеграция с monitoring stack

Все практики следуют industry best practices и обеспечивают production-ready инфраструктуру.
