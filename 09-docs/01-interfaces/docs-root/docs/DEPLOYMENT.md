# Настройка автоматического деплоя на GitHub Pages и удалённый сервер

Этот документ описывает настройку CI/CD pipeline для автоматической публикации приложения при каждом push в main.

## Что настроено

### 1. GitHub Pages (основной URL)
- **URL**: `https://innoscripts2.github.io/my-own-service/`
- **Обновление**: Автоматически при push в main
- **Задержка**: 1-5 минут после успешного деплоя
- **Преимущества**:
    - Бесплатный хостинг
    - HTTPS из коробки
    - CDN для быстрой загрузки
    - Автоматическое кеширование

### 2. Удалённый сервер (резервный URL)
- **URL**: `http://31.31.197.40/`
- **Обновление**: Автоматически при push (если настроены secrets)
- **Использование**: Fallback если GitHub Pages недоступен

## Включение GitHub Pages

### Через веб-интерфейс GitHub:

1. Перейдите на страницу репозитория: `https://github.com/InnoScripts2/my-own-service`

2. Откройте **Settings** → **Pages**

3. В разделе **Source** выберите:
   - Source: **GitHub Actions**
   - (Не выбирайте Branch, используйте Actions для полного контроля)

4. Сохраните изменения

5. После первого push с новым workflow страница станет доступна по адресу:
   ```
   https://innoscripts2.github.io/my-own-service/
   ```

### Проверка статуса деплоя:

После push в main:
1. Откройте вкладку **Actions** в репозитории
2. Найдите workflow "Deploy to GitHub Pages and Remote Server"
3. Дождитесь успешного завершения workflow
4. Откройте URL: `https://innoscripts2.github.io/my-own-service/`

## Настройка деплоя на удалённый сервер (опционально)

Если хотите автоматически обновлять сервер `31.31.197.40`:

### Шаг 1: Добавьте GitHub Secrets

В настройках репозитория **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Имя секрета      | Значение                                 | Описание               |
| ---------------- | ---------------------------------------- | ---------------------- |
| `REMOTE_HOST`    | `31.31.197.40`                           | IP или домен сервера   |
| `REMOTE_USER`    | `username`                               | Имя пользователя SSH   |
| `REMOTE_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Приватный SSH ключ     |
| `REMOTE_PORT`    | `22`                                     | Порт SSH (опционально) |

### Шаг 2: Добавьте GitHub Variables

В **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**:

| Имя переменной            | Значение         | Описание                    |
| ------------------------- | ---------------- | --------------------------- |
| `DEPLOY_TO_REMOTE_SERVER` | `true`           | Включить деплой на сервер   |
| `REMOTE_DEPLOY_PATH`      | `/var/www/kiosk` | Путь на сервере             |
| `USE_SCP_DEPLOY`          | `false`          | Использовать SCP вместо SSH |

### Шаг 3: Настройте сервер

На сервере `31.31.197.40`:

```bash
# Создайте директорию для приложения
sudo mkdir -p /var/www/kiosk
sudo chown $USER:$USER /var/www/kiosk

# Добавьте публичный ключ в authorized_keys
mkdir -p ~/.ssh
echo "ваш_публичный_ключ" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh

# Настройте веб-сервер (nginx пример)
sudo nano /etc/nginx/sites-available/kiosk
```

Пример конфигурации nginx:
```nginx
server {
    listen 80;
    server_name 31.31.197.40;

    root /var/www/kiosk;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Отключить кеширование для index.html
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        expires 0;
    }

    # Кеширование статических ресурсов
    location ~* \.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Активируйте конфигурацию:
```bash
sudo ln -s /etc/nginx/sites-available/kiosk /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Обновление Android-приложения

Android-приложение теперь настроено на GitHub Pages URL:

```xml
<!-- 03-apps/02-application/android-kiosk/app/src/main/res/values/strings.xml -->
<string name="kiosk_url">https://innoscripts2.github.io/my-own-service/</string>
```

### Пересборка APK:

```powershell
# Из корня проекта
npm run apk:build
```

APK будет в: `03-apps/02-application/android-kiosk/app/build/outputs/apk/debug/app-debug.apk`

### Установка на устройство:

```powershell
# Через ADB
adb install -r 03-apps/02-application/android-kiosk/app/build/outputs/apk/debug/app-debug.apk
```

## Workflow автодеплоя

При каждом push в `main`:

1. **Build**: Собираются статические файлы
2. **Deploy GitHub Pages**: Публикация на GitHub Pages
3. **Deploy Remote** (если настроен): Копирование на удалённый сервер

## Тестирование

### Локальное тестирование:

```powershell
# Запуск локального сервера
npm run static
```

Откройте: `http://localhost:8080`

### Проверка GitHub Pages:

1. Сделайте изменение в `index.html`
2. Commit и push:
   ```bash
   git add .
   git commit -m "test: verify GitHub Pages deployment"
   git push origin main
   ```
3. Подождите 1-5 минут
4. Откройте: `https://innoscripts2.github.io/my-own-service/`
5. Проверьте изменения (возможно потребуется Ctrl+F5)

### Проверка в Android-приложении:

1. Установите новый APK с GitHub Pages URL
2. Запустите приложение
3. Проверьте загрузку интерфейса
4. При изменениях в GitHub - закройте и откройте приложение заново

## Мониторинг деплоя

### Логи GitHub Actions:
1. Откройте: `https://github.com/InnoScripts2/my-own-service/actions`
2. Выберите последний запуск workflow
3. Просмотрите логи каждого шага

### Проверка доступности:

```powershell
# Проверка GitHub Pages
curl -I https://innoscripts2.github.io/my-own-service/

# Проверка удалённого сервера
curl -I http://31.31.197.40/
```

## Устранение проблем

### GitHub Pages не обновляется:
1. Проверьте статус workflow в Actions (должен завершиться успешно)
2. Очистите кеш браузера (Ctrl+Shift+Delete)
3. Используйте режим инкогнито для проверки
4. Проверьте настройки Pages: должно быть "GitHub Actions"

### Android-приложение показывает старую версию:
1. Полностью закройте приложение
2. Очистите кеш приложения в настройках Android
3. Переоткройте приложение
4. Если не помогло - переустановите APK

### Удалённый сервер не обновляется:
1. Проверьте логи workflow (job: deploy-remote-server)
2. Проверьте SSH доступ вручную
3. Убедитесь что переменная `DEPLOY_TO_REMOTE_SERVER=true`
4. Проверьте права доступа на сервере

## Дополнительные ресурсы

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [SSH Key Generation](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
