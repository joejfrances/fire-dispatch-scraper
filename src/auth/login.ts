import { chromium, Page } from '@playwright/test';
import { config } from '../config/config';
import { Logger } from '../utils/logger';

async function login(page?: Page): Promise<boolean> {
  let browser;
  let ownPage = false;

  try {
    if (!page) {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      page = await context.newPage();
      ownPage = true;
    }

    Logger.info('Navigating to login page...');
    await page.goto(`${config.urls.base}${config.urls.login}`);
    Logger.info(`Current URL before login: ${page.url()}`);

    // Wait for and select username from dropdown
    Logger.info('Selecting username...');
    await page.selectOption(config.selectors.usernameSelect, config.credentials.username);

    // Enter password
    Logger.info('Entering password...');
    await page.fill(config.selectors.passwordInput, config.credentials.password);

    // Click submit button
    Logger.info('Submitting login form...');
    await page.click(config.selectors.submitButton);

    // Wait for navigation and check if login was successful
    try {
      await page.waitForNavigation({ timeout: 5000 });
    } catch (error) {
      Logger.error('Navigation timeout - page did not redirect after login');
    }

    const currentUrl = page.url();
    Logger.info(`Current URL after login attempt: ${currentUrl}`);
    
    // Check if we're no longer on the login page (negative check)
    // rather than checking for a specific destination (positive check)
    const isLoginSuccessful = !currentUrl.includes(config.urls.login);

    if (isLoginSuccessful) {
      Logger.info('Login successful! Redirected away from login page.');
      
      // Navigate to dispatch page manually if we're not already there
      if (!currentUrl.includes(config.urls.dispatch)) {
        Logger.info(`Manually navigating to dispatch page: ${config.urls.base}${config.urls.dispatch}`);
        
        // Use a shorter timeout (10 seconds) and handle navigation errors gracefully
        try {
          await page.goto(`${config.urls.base}${config.urls.dispatch}`, { timeout: 10000 });
          Logger.info('Successfully navigated to dispatch page');
        } catch (error: any) {
          // Don't treat navigation failure as a fatal error
          Logger.warning(`Navigation to dispatch page timed out or failed: ${error.message}`);
          Logger.warning('Continuing with current page - application will retry later');
        }
      }
    } else {
      Logger.error('Login failed - Page did not redirect away from login page');
      const errorMessage = await page.textContent(config.selectors.errorMessage);
      if (errorMessage) {
        Logger.error(`Error message: ${errorMessage}`);
      }
    }

    return isLoginSuccessful;
  } catch (error) {
    Logger.error('An error occurred during login', error as Error);
    return false;
  } finally {
    if (ownPage && browser) {
      await browser.close();
    }
  }
}

// Main execution
if (require.main === module) {
  login().catch((error) => {
    Logger.error('Failed to execute login script', error);
    process.exit(1);
  });
}

export { login }; 