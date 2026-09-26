# Облачные копии: настройка Google Диска, Dropbox и OneDrive

Яндекс.Диск, Nextcloud и другие WebDAV-сервисы работают без настройки: достаточно логина и пароля приложения.

Google Диск, Dropbox и OneDrive пускают только зарегистрированные приложения. Приложение регистрируют один раз, и его **Client ID** вшивается в сборку расширения. Секретов у расширения нет: вход идёт через окно сервиса (OAuth 2.0 с PKCE), пароль пользователя расширение не видит.

## 0. Адрес возврата

Сервис после входа возвращает пользователя на адрес вида:

```
https://<ID расширения>.chromiumapp.org/
```

Готовый адрес показан в настройках SpeedDial: **Настройки → Копии → Сервис: Google Диск** (или Dropbox, OneDrive), пока Client ID не задан.

- У распакованного расширения ID зависит от папки, из которой оно загружено. Если перенести папку `dist`, ID изменится, и адрес придётся добавить заново.
- Откройте настройки и в Chrome, и в Edge. Если адреса отличаются, зарегистрируйте оба.
- После публикации в Chrome Web Store или Edge Add-ons у расширения появится постоянный ID магазина. Его адрес тоже нужно добавить.

## 1. Google Диск

1. Откройте <https://console.cloud.google.com/> и создайте проект, например «SpeedDial».
2. **APIs & Services → Library** → найдите **Google Drive API** → **Enable**.
3. **Google Auth Platform → Branding**:
   - укажите название «SpeedDial» и почту поддержки;
   - **Audience**: тип **External**.
4. **Data Access → Add or remove scopes** → добавьте `https://www.googleapis.com/auth/drive.appdata`.
   - Этот доступ даёт только скрытую папку приложения: чужие файлы расширение не видит.
   - Google относит этот доступ к несекретным, проверка приложения не нужна.
5. Пока приложение в режиме **Testing**, войти могут только тестовые пользователи. Добавьте себя в **Audience → Test users** или нажмите **Publish app**.
6. **Clients → Create client**:
   - тип **Web application**;
   - в **Authorized redirect URIs** добавьте адрес возврата из шага 0.
7. Скопируйте **Client ID** (`…apps.googleusercontent.com`).

## 2. Dropbox

1. Откройте <https://www.dropbox.com/developers/apps> → **Create app**:
   - **Scoped access**;
   - **App folder** — доступ только к своей папке `Приложения/<имя>`;
   - имя, например «SpeedDial Backup»; оно должно быть уникальным во всём Dropbox.
2. Вкладка **Permissions**: включите `files.metadata.read`, `files.content.read`, `files.content.write`, `account_info.read` → **Submit**.
3. Вкладка **Settings**:
   - **OAuth 2 → Redirect URIs**: добавьте адрес возврата;
   - **Allow public clients (Implicit Grant & PKCE)**: **Allow**.
4. Скопируйте **App key**, это и есть Client ID.

В статусе **Development** приложением могут пользоваться до 500 человек. Для большего числа нажмите **Apply for production**.

## 3. OneDrive

1. Откройте <https://entra.microsoft.com/> → **App registrations → New registration**:
   - имя: «SpeedDial»;
   - **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts*;
   - **Redirect URI**: платформа **Single-page application (SPA)**, адрес возврата из шага 0.
2. **API permissions → Add a permission → Microsoft Graph → Delegated**:
   - `Files.ReadWrite.AppFolder`;
   - `User.Read`;
   - `offline_access`.
3. На странице **Overview** скопируйте **Application (client) ID**.

Платформа должна быть именно **SPA**. Для «Web» Microsoft потребует секрет, а для «Mobile and desktop» отклонит вход из браузера.

## 4. Сборка с Client ID

Создайте в корне проекта файл `.env.local`. Он в `.gitignore` и в репозиторий не попадёт:

```
VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
VITE_DROPBOX_CLIENT_ID=abcdefghijklmno
VITE_ONEDRIVE_CLIENT_ID=00000000-0000-0000-0000-000000000000
```

Можно задать только нужные сервисы: остальные останутся в списке с подсказкой «не настроено».

Дальше выполните `npm run build` и нажмите «Перезагрузить» у SpeedDial на странице `chrome://extensions` или `edge://extensions`.

## Как это работает

| Сервис | Где копии | Вход | Автокопии без повторного входа |
|---|---|---|---|
| Яндекс.Диск, WebDAV | папка `SpeedDial/` | логин + пароль приложения | всегда |
| Google Диск | скрытая папка приложения | токен на час, продление молчаливым входом | пока вы вошли в Google в браузере |
| Dropbox | `Приложения/<имя приложения>` | код + PKCE, refresh-токен | всегда, пока доступ не отозван |
| OneDrive | `Приложения/SpeedDial` | код + PKCE, refresh-токен на сутки, затем молчаливый вход | пока вы вошли в Microsoft в браузере |

Если продлить вход не удалось, в настройках появится ошибка «Вход … устарел». Тогда отключите облако и подключитесь заново.
