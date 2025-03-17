# Fire Department Dispatch Scraper

A Node.js application that scrapes fire department dispatch information from Yonkers NY fire department portal and stores it in a Supabase database.

## Local Development

### Prerequisites
- Node.js v20 or later
- npm or yarn
- Supabase account

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/joejfrances/fire-dispatch-scraper.git
   cd fire-dispatch-scraper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with the following variables:
   ```
   # Supabase credentials
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

   # User credentials
   USERNAME=your_username
   PASSWORD=your_password

   # Base URL
   BASE_URL=https://redalertmobile.yonkersny.gov

   # OpenAI API key (if used)
   OPENAI_API_KEY=your_openai_api_key
   ```

4. Run the application:
   ```bash
   npm start
   ```

## Production Deployment

The application is deployed on a DigitalOcean VPS running Ubuntu 22.04 LTS.

### Server Information
- IP Address: 167.172.247.230
- User: root

### Server Management

#### SSH Access
```bash
ssh root@167.172.247.230
```

#### Application User
The application runs under a dedicated user account `firedisp`.

#### Application Directory
```
/home/firedisp/app/
```

#### Managing the Application with PM2

**View application status:**
```bash
ssh root@167.172.247.230 "pm2 status"
```

**Check logs:**
```bash
ssh root@167.172.247.230 "pm2 logs fire-dispatch-scraper"
```

**View last N lines of logs:**
```bash
ssh root@167.172.247.230 "pm2 logs fire-dispatch-scraper --lines 50"
```

**Restart the application:**
```bash
ssh root@167.172.247.230 "pm2 restart fire-dispatch-scraper"
```

**Stop the application:**
```bash
ssh root@167.172.247.230 "pm2 stop fire-dispatch-scraper"
```

**Start the application after stopping:**
```bash
ssh root@167.172.247.230 "pm2 start fire-dispatch-scraper"
```

#### Updating the Application

To update the application with the latest code:

```bash
ssh root@167.172.247.230 "cd /home/firedisp/app && git pull && npm install && pm2 restart fire-dispatch-scraper"
```

#### Troubleshooting

If there are issues with Playwright browsers:

```bash
ssh root@167.172.247.230 "cd /home/firedisp/app && sudo -u firedisp npx playwright install chromium"
```

## Security Notes

- The application runs under a dedicated non-root user (`firedisp`)
- Environment variables are stored in a secure .env file with restricted permissions
- The server has regular backups enabled through DigitalOcean

## Architecture

The application:
1. Authenticates with the fire department portal
2. Scrapes dispatch information on a schedule
3. Processes and transforms the data
4. Stores the results in a Supabase database

## License

[MIT License](LICENSE) 