# Kiosk Frontend - Modular Architecture

## Overview

This is the modernized kiosk self-service frontend built with vanilla JavaScript ES modules and Vite. The architecture follows clean separation of concerns with no reactive framework dependencies.

## Architecture

```
apps/kiosk-frontend/
├── src/
│   ├── core/              # Core functionality modules
│   │   ├── config.js      # Configuration management
│   │   ├── api-client.js  # REST API wrapper with retry logic
│   │   ├── navigation.js  # Screen navigation and routing
│   │   ├── device-status.js # WebSocket device status updates
│   │   ├── payment-client.js # Payment intent and polling
│   │   ├── session-manager.js # Session state and idle timeout
│   │   ├── error-handler.js # Global error handling
│   │   └── dev-mode.js    # Dev mode activation and UI
│   ├── screens/           # Screen-specific logic (future)
│   ├── utils/             # Utility functions
│   │   ├── debounce.js
│   │   ├── formatters.js
│   │   └── validators.js
│   └── main.js            # Entry point
├── tests/                 # Playwright tests
├── styles.css            # Global styles with WCAG AA support
├── index.html            # Main HTML structure
├── service-worker.js     # PWA service worker with caching strategies
├── vite.config.js        # Vite build configuration
└── playwright.config.js  # Playwright test configuration
```

## Development

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
cd apps/kiosk-frontend
npm install
```

### Development Server

```bash
npm run dev
```

Runs Vite dev server on `http://localhost:5173` with HMR.

### Build

```bash
npm run build
```

Builds optimized production bundle to `dist/`.

### Preview

```bash
npm run preview
```

Preview the production build locally.

### Testing

```bash
npm test              # Run all Playwright tests
npm run test:ui       # Run tests in UI mode
```

## Features

### 1. Modular ES Architecture

- Clean separation of concerns
- ES6 modules for better code organization
- Tree-shaking for optimal bundle size
- No framework dependencies

### 2. Service Worker Caching

Implements intelligent caching strategies:

- **Cache-first**: Static assets (JS, CSS, images)
- **Network-first**: API requests with fallback to cache
- **Stale-while-revalidate**: HTML pages
- Automatic cache versioning and cleanup

### 3. Dev Mode Isolation

Dev mode is completely isolated from production:

- **Activation**: 
  - Keyboard: `Ctrl+Shift+D`
  - Touch: 3 fingers for 5 seconds
- **Storage**: `localStorage.devMode` (not URL parameter)
- **Tree-shaking**: Dev code removed in production builds
- **Visual indicator**: Red banner when active

### 4. WCAG AA Accessibility

- Color contrast ratio: 4.5:1 minimum
- Touch targets: 44x44px minimum
- Keyboard navigation support
- Focus visible states
- ARIA labels and semantic HTML
- Screen reader support
- Reduced motion support
- High contrast mode support

### 5. Real-time Device Status

- WebSocket connection for live updates
- Automatic reconnection with exponential backoff
- Progress indicators
- Status badges

### 6. Payment Integration

- Intent creation and status polling
- DEV mode confirmation bypass
- Polling interval: 2 seconds
- Automatic stop on completion

### 7. Session Management

- Idle timeout: 120 seconds
- Automatic state persistence
- Session ID generation
- Auto-reset to attract screen

## Configuration

Configuration is loaded from multiple sources:

1. URL parameters: `?apiPort=7070&agent=http://localhost:7070`
2. localStorage: `AGENT_API_BASE`
3. Defaults: `http://localhost:7070`

### Environment Variables

Via Vite `import.meta.env`:

- `import.meta.env.DEV` - Development mode
- `import.meta.env.PROD` - Production mode

## Service Worker

The service worker implements three caching strategies:

### Cache-first Strategy

Used for static assets that rarely change:
- JavaScript bundles
- CSS files
- Images, fonts
- SVG icons

### Network-first Strategy

Used for dynamic content:
- API calls (`/api/*`)
- WebSocket connections
- Dynamic pages

### Stale-while-revalidate Strategy

Used for HTML pages:
- Serves cached version immediately
- Updates cache in background
- Ensures fast page loads

### Cache Invalidation

- Version-based cache names
- Automatic cleanup of old caches
- Manual cache clear via dev tools

## Testing

### Test Structure

```
tests/
├── navigation.spec.js      # Screen navigation tests
├── accessibility.spec.js   # WCAG AA compliance tests
├── dev-flag.spec.js       # Dev mode tests
└── *.spec.js              # Additional test suites
```

### Running Tests

```bash
# All tests
npm test

# Specific suite
npx playwright test navigation

# UI mode
npm run test:ui

# Debug mode
npx playwright test --debug
```

### Accessibility Testing

Uses `@axe-core/playwright` to verify WCAG AA compliance:

- Automated violation detection
- Color contrast verification
- Touch target size validation
- Keyboard navigation checks

## API Integration

### REST API

```javascript
import { apiClient } from '@core/api-client';

// GET request
const data = await apiClient.get('/api/endpoint');

// POST request
const result = await apiClient.post('/api/endpoint', { key: 'value' });
```

### WebSocket

```javascript
import { deviceStatus } from '@core/device-status';

// Subscribe to status updates
const unsubscribe = deviceStatus.subscribe((payload) => {
  console.log('Status update:', payload);
});

// Unsubscribe
unsubscribe();
```

## Build Optimization

Vite configuration includes:

- **Code splitting**: Core, screens, and vendor chunks
- **Minification**: ESBuild in production
- **Tree-shaking**: Dead code elimination
- **Source maps**: Only in development
- **Asset optimization**: Images, fonts optimized

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers with ES6 support

## Security

- No secrets in client code
- XSS protection via content escaping
- CSP headers (recommended)
- CORS configuration on backend
- No eval() or inline scripts

## Performance

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3.5s
- Lighthouse score: > 90
- Bundle size: < 200KB (gzipped)

## Troubleshooting

### Service Worker not updating

1. Clear browser cache
2. Unregister service worker in DevTools
3. Hard reload (Ctrl+Shift+R)

### Dev mode not activating

1. Check localStorage: `localStorage.getItem('devMode')`
2. Try keyboard shortcut: Ctrl+Shift+D
3. Check browser console for errors

### WebSocket connection failing

1. Verify agent is running
2. Check WebSocket URL in config
3. Inspect network tab for connection errors

## Contributing

1. Follow existing code style
2. Add tests for new features
3. Update documentation
4. Run linter before commit
5. Ensure accessibility standards

## License

See root LICENSE file.
