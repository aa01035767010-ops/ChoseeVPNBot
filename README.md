# ChoseeVPN Telegram Bot & Mini App (VLESS-Reality / Xray)

A premium Telegram Bot and Mini App solution for selling and managing high-speed VLESS-Reality (Xray) VPN access keys using a private VPS with **3X-UI** panel.

This project is styled in a **Premium Dark Flat Design** in neutrally pleasant, smooth colors and is fully optimized for mobile devices inside the Telegram interface.

---

## 🚀 Features

- 🤖 **Telegram Bot**: Welcomes users, gives quick help, and provides a direct, native button to open the Personal Dashboard.
- 📱 **Telegram Mini App (Personal Cabinet)**:
  - Account balance display.
  - Active VPN subscription status (active/expired).
  - Add new devices (instantly issues separate VLESS-Reality access keys).
  - Quick top-up interface (integrated with a simulated checkout flow).
  - Interactive guides with visual steps and direct client app links.
- 🛡️ **Anti-blocking (VLESS-Reality)**: Highly robust and censorship-resistant VPN protocol specifically suited for Russian ISPs.
- ⚙️ **Automatic VPS Provisioning**: Connects directly to the **3X-UI Panel API** on your VPS to automatically add, rename, and delete clients in Xray.
- 🧪 **Mock Mode**: Fully operational database, bot, and frontend simulation out of the box. Test it on your local machine instantly without a VPS connected!

---

## 🛠️ VPS Quick Setup (VLESS + 3X-UI)

To configure your own VPS server for this bot:

1. **Install 3X-UI on a clean Ubuntu/Debian server**:
   Connect to your VPS via SSH and run this command:
   ```bash
   bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)
   ```
   *Follow the prompts to set up your panel's custom port, admin username, and password.*

2. **Access the panel**:
   Open `http://YOUR_VPS_IP:PORT` in your browser and log in with your admin credentials.

3. **Create a VLESS-Reality Inbound**:
   - Go to **Inbounds** (Подключения) -> **Add Inbound** (Добавить подключение).
   - **Protocol**: `vless`
   - **Port**: `443` (standard HTTPS port, highly recommended)
   - **Transmission**: `tcp`
   - **Security**: `XTLS` or `Reality` (Choose **Reality**).
   - **Flow**: `xtls-rprx-vision` (recommended)
   - In the Reality settings:
     - Check **Reality** to enable it.
     - **Dest**: `yahoo.com:443` or `microsoft.com:443` (website to mimic).
     - **Server Names (SNI)**: `yahoo.com,www.yahoo.com` or `microsoft.com,www.microsoft.com`
     - Click **Get New Keys** (Получить новые ключи) to generate your private and public keys.
     - Note the **Public Key** and **Short ID** (they are used to build links).
   - Click **Create** (Создать).
   - Note the **Inbound ID** (usually `1` if it's the first one).

---

## 💻 Local Installation & Development

1. **Clone or navigate to the directory**:
   ```bash
   cd ChoseeVPNBot
   ```

2. **Install node dependencies**:
   ```bash
   npm install
   ```

3. **Configure your `.env` file**:
   Open `.env` and adjust the variables:
   - To test instantly on your machine without a VPS, keep `MOCK_MODE=true`.
   - To connect to your real VPS:
     ```env
     TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
     MOCK_MODE=false
     XUI_PANEL_URL=http://YOUR_VPS_IP:2053
     XUI_USERNAME=your_xui_admin_username
     XUI_PASSWORD=your_xui_admin_password
     XUI_INBOUND_ID=1
     ```

4. **Launch the project**:
   Run in development mode (with auto-reloading):
   ```bash
   npm run dev
   ```
   Or in production mode:
   ```bash
   npm start
   ```

5. **Expose port 3000 to Telegram (for Mini App testing)**:
   Since Telegram Mini Apps must load over HTTPS from a public URL, use `ngrok` or `localtunnel` to expose your local port:
   ```bash
   npx localtunnel --port 3000
   ```
   Copy the secure `https://...` URL and paste it in **BotFather** as your web app URL (use `/newapp` or `/setmenubutton` in @BotFather).

---

## 📱 Recommended VLESS Client Apps for Users

Our Mini App displays direct links and guides for these apps:

- **Android**: [v2rayNG](https://play.google.com/store/apps/details?id=com.v2ray.ang) or [NekoBox](https://github.com/MatsuriDayo/NekoBoxForAndroid/releases)
- **iOS / macOS**: [FoXray](https://apps.apple.com/app/foxray/id6444878719), [Streisand](https://apps.apple.com/app/streisand/id6450534064), or [V2Box](https://apps.apple.com/app/v2box-v2ray-client/id1639399477)
- **Windows**: [v2rayN](https://github.com/2dust/v2rayN/releases) or [NekoBox](https://github.com/MatsuriDayo/nekoray/releases)
