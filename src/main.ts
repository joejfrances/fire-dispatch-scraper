import { chromium } from '@playwright/test';
import { login } from './auth/login';
import { AlarmScraper } from './scraper/alarmScraper';
import { Logger } from './utils/logger';
import { AlarmService } from './database/services/alarms';
import { UnitService } from './database/services/units';
import { testConnection } from './database/client';

const REFRESH_INTERVAL = 15000; // 5 seconds

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // Test database connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }

    // Initialize services
    const alarmService = new AlarmService();
    const unitService = new UnitService();

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Perform login
    const loginSuccess = await login(page);
    if (!loginSuccess) {
      throw new Error('Login failed');
    }

    Logger.info('Starting alarm monitoring...');

    // Initialize alarm scraper with services
    const scraper = new AlarmScraper(page, alarmService, unitService);

    // Continuous monitoring loop
    while (true) {
      try {
        await scraper.scrapeAlarms();
        Logger.info(`Waiting ${REFRESH_INTERVAL / 1000} seconds before next scan...`);
        await sleep(REFRESH_INTERVAL);
      } catch (error) {
        Logger.error('Error during alarm scanning', error as Error);
        await sleep(REFRESH_INTERVAL); // Still wait before retrying
      }
    }
  } catch (error) {
    Logger.error('Fatal error in main process', error as Error);
    process.exit(1);
  }
}

// Start the monitoring process
if (require.main === module) {
  main().catch(error => {
    Logger.error('Failed to start monitoring', error);
    process.exit(1);
  });
} 