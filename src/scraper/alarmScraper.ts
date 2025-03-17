import { Page } from '@playwright/test';
import { config } from '../config/config';
import { Logger } from '../utils/logger';
import { AlarmService } from '../database/services/alarms';
import { UnitService } from '../database/services/units';
import { Alarm } from '../database/types';
import { detectChanges } from '../utils/changeDetection';

export class AlarmScraper {
  private readonly page: Page;
  private readonly alarmService: AlarmService;
  private readonly unitService: UnitService;

  constructor(page: Page, alarmService: AlarmService, unitService: UnitService) {
    this.page = page;
    this.alarmService = alarmService;
    this.unitService = unitService;
  }

  private async extractUnitsFromDOM(alarmElement: any): Promise<string[]> {
    const descElements = await alarmElement.$$('p.ui-li-desc');
    const units: string[] = [];
    const knownStatusIndicators = ['Received', 'Call Type', 'Occupant'];
    
    for (const element of descElements) {
      const text = await element.textContent();
      const colonIndex = text.indexOf(':');
      
      if (colonIndex > 0) {
        // Extract the text before the colon (potential unit or status indicator)
        const identifier = text.substring(0, colonIndex).trim();
        
        // Skip known status indicators
        if (knownStatusIndicators.includes(identifier)) {
          continue;
        }
        
        // Check if the rest of the text has timestamp indicators like AR- or EN-
        // These are unit status indicators that appear after actual unit identifiers
        const remainingText = text.substring(colonIndex + 1);
        if (remainingText.includes('AR-') || 
            remainingText.includes('EN-') || 
            remainingText.includes('OS-') ||
            remainingText.includes('RE-') ||
            remainingText.includes('Disp-')) {
          // This is likely a unit (not a status indicator)
          units.push(identifier);
        }
      }
    }
    
    return units;
  }

  private async extractUnitsFlexible(alarmElement: any): Promise<{
    allUnits: string[];
    standardUnits: string[];
    externalUnits: string[];
  }> {
    // Extract units based on DOM structure
    const extractedUnits = await this.extractUnitsFromDOM(alarmElement);
    
    // Get known units from UnitService to identify external units
    const { knownUnits, externalUnits } = await this.unitService.identifyExternalUnits(extractedUnits);
    
    // Log findings
    if (extractedUnits.length > 0) {
      Logger.info(`All detected units: ${extractedUnits.join(', ')}`);
    }
    
    if (externalUnits.length > 0) {
      Logger.info(`External units detected: ${externalUnits.join(', ')}`);
    }
    
    return {
      allUnits: extractedUnits,
      standardUnits: knownUnits,
      externalUnits: externalUnits
    };
  }

  private async extractUnits(alarmElement: any): Promise<string[]> {
    try {
      // Get units using DOM-based extraction
      const { allUnits, externalUnits } = await this.extractUnitsFlexible(alarmElement);
      
      if (allUnits.length > 0) {
        Logger.info(`Units: ${allUnits.join(', ')}`);
      } else {
        Logger.info('No units assigned');
      }

      return allUnits;
    } catch (error) {
      Logger.error('Failed to extract units', error as Error);
      return [];
    }
  }

  private async getCallDetails(dcid: string): Promise<{ notes?: string, timeline?: string }> {
    try {
      Logger.info(`Fetching call details for alarm ${dcid}`);
      // Try to navigate to the details page for specific dcid
      const detailUrl = `${config.urls.base}/callinfo.ra?dcid=${dcid}`;
      
      // Create a new browser context for this request to avoid conflicts
      const browser = this.page.context().browser();
      if (!browser) {
        Logger.warning('No browser instance available for fetching call details');
        return {};
      }
      
      // Get authentication cookies from the main context
      const cookies = await this.page.context().cookies();
      
      // Create a new context instead of using the existing one
      const context = await browser.newContext();
      if (!context) {
        Logger.warning('Failed to create browser context for call details');
        return {};
      }
      
      // Add the cookies to the new context to maintain authentication
      await context.addCookies(cookies);
      
      const page = await context.newPage();
      
      try {
        // Set a reasonable timeout to avoid hanging
        await page.goto(detailUrl, { timeout: 30000 }).catch((error: Error) => {
          throw new Error(`Failed to navigate to detail page: ${error.message}`);
        });
        
        // Wait for the content to load
        await page.waitForLoadState('domcontentloaded').catch(() => {
          Logger.warning(`Page load state timeout for alarm ${dcid}`);
        });
        
        // Verify we're on the correct page and not redirected to login
        const currentUrl = page.url();
        if (currentUrl.includes('login.ra')) {
          Logger.warning(`Authentication issue for alarm ${dcid} - redirected to login page`);
          return {};
        }
        
        // Extract both call notes and timeline in a single evaluate call
        const details = await page.evaluate(() => {
          // Get call notes
          let callNotes = null;
          // Look for paragraphs containing "Call Notes:"
          const paragraphs = Array.from(document.querySelectorAll('p'));
          const callNotesParas = paragraphs.filter(p => p.textContent && p.textContent.includes('Call Notes:'));
          
          if (callNotesParas.length > 0) {
            callNotes = callNotesParas[0].textContent?.trim() || null;
          } else {
            // Try alternative approach with list items
            const listItems = document.querySelectorAll('li');
            for (let i = 0; i < listItems.length; i++) {
              const li = listItems[i];
              if (li.textContent && li.textContent.includes('Call Notes:')) {
                callNotes = li.textContent.trim() || null;
                break;
              }
            }
          }
          
          // Get timeline entries
          const timeEntries = Array.from(document.querySelectorAll('b'));
          const timelineEntries: string[] = [];
          
          timeEntries.forEach(entry => {
            const text = entry.textContent?.trim() || '';
            // Check if it matches a timestamp format (MM/DD HH:MM:SS)
            if (/^\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
              // Get the next element which contains the entry text
              let currentNode = entry.nextSibling;
              let entryText = '';
              
              // Collect text until we hit the next <br> or <b> tag
              while (currentNode) {
                if (currentNode.nodeType === Node.TEXT_NODE) {
                  entryText += currentNode.textContent;
                } else if (currentNode.nodeName === 'BR' || currentNode.nodeName === 'B') {
                  break;
                }
                currentNode = currentNode.nextSibling;
              }
              
              // Add the entry to our collection if we found text
              if (entryText.trim()) {
                timelineEntries.push(`${text}${entryText.trim()}`);
              }
            }
          });
          
          const timeline = timelineEntries.length > 0 ? timelineEntries.join('\n') : null;
          
          return { 
            notes: callNotes, 
            timeline: timeline 
          };
        });
        
        // Close the page and context to free resources
        await page.close();
        await context.close();
        
        return {
          notes: details.notes || undefined,
          timeline: details.timeline || undefined
        };
      } catch (error: any) {
        // Make sure to close the context even if there was an error
        await page.close().catch(() => {/* Ignore close errors */});
        await context.close().catch(() => {/* Ignore close errors */});
        Logger.error(`Error processing call details for alarm ${dcid}: ${error.message || String(error)}`);
        return {};
      }
    } catch (error: any) {
      Logger.error(`Error fetching call details for alarm ${dcid}: ${error.message || String(error)}`);
      return {};
    }
  }

  private async extractAlarm(alarmElement: any): Promise<Omit<Alarm, 'id'> | null> {
    try {
      // Check if element is still attached
      const isAttached = await alarmElement.evaluate((el: any) => {
        return !!el && el.isConnected;
      }).catch(() => false);
      
      if (!isAttached) {
        Logger.warning('Alarm element no longer attached to DOM');
        return null;
      }
      
      // Extract dcid from the link
      const link = await alarmElement.$('a[href^="callinfo.ra?dcid="]').catch(() => null);
      if (!link) {
        throw new Error('Could not find alarm link');
      }
      
      const href = await link.getAttribute('href').catch(() => null);
      if (!href) {
        throw new Error('Could not get href attribute');
      }
      
      const dcidMatch = href.match(/dcid=(\d+)/);
      if (!dcidMatch) {
        throw new Error('Could not extract dcid from link');
      }
      const dcid = dcidMatch[1];

      // Extract address with error handling
      let address = '';
      try {
        const addressElement = await alarmElement.$('h3');
        if (addressElement) {
          address = await addressElement.textContent() || '';
        }
        if (!address) {
          address = 'Unknown Address';
        }
      } catch (error) {
        address = 'Unknown Address';
      }

      // Extract received time with error handling
      let receivedTime = '';
      try {
        const receivedElement = await alarmElement.$('p.ui-li-desc:has-text("Received:")');
        if (receivedElement) {
          const receivedText = await receivedElement.textContent() || '';
          receivedTime = receivedText.replace('Received:', '').trim();
        }
        if (!receivedTime) {
          receivedTime = new Date().toISOString();
        }
      } catch (error) {
        receivedTime = new Date().toISOString();
      }

      // Extract call type with error handling
      let callType = '';
      try {
        const callTypeElement = await alarmElement.$('p.ui-li-desc:has-text("Call Type:")');
        if (callTypeElement) {
          const callTypeText = await callTypeElement.textContent() || '';
          callType = callTypeText.replace('Call Type:', '').trim();
        }
        if (!callType) {
          callType = 'Unknown';
        }
      } catch (error) {
        callType = 'Unknown';
      }

      // Extract units and identify any external ones
      let units: string[] = [];
      try {
        units = await this.extractUnits(alarmElement);
        const { knownUnits, externalUnits } = await this.unitService.identifyExternalUnits(units);

        // Log external units if any are found
        if (externalUnits.length > 0) {
          this.alarmService.logExternalUnits(dcid, externalUnits);
          Logger.info(`External units on alarm #${dcid}: ${externalUnits.join(', ')}`);
        }
      } catch (error) {
        Logger.warning(`Error extracting units for alarm ${dcid}`);
      }

      // Get call details from detail page
      let callDetails: { notes?: string, timeline?: string } = {};
      try {
        callDetails = await this.getCallDetails(dcid);
      } catch (error) {
        Logger.warning(`Error extracting call details for alarm ${dcid}`);
      }

      // Check if alarm exists and handle accordingly
      const existingAlarm = await this.alarmService.getAlarmByDcid(dcid);
      
      if (existingAlarm) {
        // Create current alarm data for comparison
        const currentData = {
          address: address,
          alarm_type: callType,
          call_notes: callDetails.notes,
          call_timeline: callDetails.timeline
        };
        
        // Handle changes for existing alarm (using all units)
        await this.handleExistingAlarm(existingAlarm, currentData, units);
        return existingAlarm;
      }

      // Create new alarm object for new alarms
      const alarm: Omit<Alarm, 'id'> = {
        dcid,
        address,
        alarm_timestamp: receivedTime,
        alarm_type: callType,
        call_notes: callDetails.notes,
        call_timeline: callDetails.timeline,
        last_updated: new Date().toISOString()
      };

      // Create alarm record
      const alarmId = await this.alarmService.createAlarm(alarm);
      if (!alarmId) {
        Logger.error(`Failed to create alarm record for dcid ${alarm.dcid}`);
        return null;
      }

      Logger.info(`Created new alarm #${dcid} at ${address}`);

      // Create unit assignments for all units (both known and external)
      if (units.length > 0) {
        await this.alarmService.createUnitAssignments(alarmId, units);
      }

      return alarm;
    } catch (error) {
      Logger.error('Failed to extract alarm details', error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  private async handleExistingAlarm(existingAlarm: Alarm, newData: Partial<Alarm>, units: string[]): Promise<void> {
    try {
      // Get current active units for the alarm
      const activeUnits = await this.alarmService.getActiveUnits(existingAlarm.id!);

      // Detect changes between existing and new data
      const changes = detectChanges(existingAlarm, newData, activeUnits, units);

      if (changes.hasAnyChanges) {
        // Prepare updates for the alarm record
        const updates: Partial<Alarm> = {
          last_updated: new Date().toISOString()
        };

        if (changes.callTypeChanged) {
          updates.alarm_type = newData.alarm_type;
          Logger.info(`Alarm #${existingAlarm.dcid}: Call type updated`);
        }

        if (changes.addressChanged) {
          updates.address = newData.address;
          Logger.info(`Alarm #${existingAlarm.dcid}: Address updated`);
        }

        if (changes.notesChanged) {
          updates.call_notes = newData.call_notes;
          Logger.info(`Alarm #${existingAlarm.dcid}: Call notes updated`);
        }

        if (changes.timelineChanged) {
          updates.call_timeline = newData.call_timeline;
          Logger.info(`Alarm #${existingAlarm.dcid}: Call timeline updated`);
        }

        // Update alarm record if there are changes to the alarm itself
        if (changes.callTypeChanged || changes.addressChanged || changes.notesChanged || changes.timelineChanged) {
          await this.alarmService.updateAlarm(existingAlarm.id!, updates);
        }

        // Update unit assignments if there are changes to units
        if (changes.unitsChanged.added.length > 0 || changes.unitsChanged.removed.length > 0) {
          if (changes.unitsChanged.added.length > 0) {
            Logger.info(`Alarm #${existingAlarm.dcid}: Units added: ${changes.unitsChanged.added.join(', ')}`);
          }
          if (changes.unitsChanged.removed.length > 0) {
            Logger.info(`Alarm #${existingAlarm.dcid}: Units removed: ${changes.unitsChanged.removed.join(', ')}`);
          }
          await this.alarmService.updateUnitAssignments(existingAlarm.id!, units);
        }
      } else {
        Logger.info(`No changes detected for alarm ${existingAlarm.dcid}`);
      }
    } catch (error) {
      Logger.error(`Failed to handle alarm ${existingAlarm.dcid}`, error as Error);
    }
  }

  async scrapeAlarms(): Promise<void> {
    try {
      // PHASE 1: Get current database state BEFORE scraping
      Logger.info('Fetching current database state...');
      const dbActiveAlarms = await this.alarmService.getActiveAlarms();
      Logger.info(`Database: ${dbActiveAlarms.length} active alarms`);
      const dbActiveDcids = new Set(dbActiveAlarms.map(alarm => alarm.dcid));
      
      // PHASE 2: Scrape current alarms from website
      Logger.info('Scraping dispatch page...');
      await this.page.goto(`${config.urls.base}${config.urls.dispatch}`);
      const alarmElements = await this.page.$$('#openCalls li:not([data-role="list-divider"])');
      
      // Log how many alarm elements were found on the page
      Logger.info(`Dispatch page: ${alarmElements.length} active alarms`);
      
      // Track currently visible alarms
      const scrapedDcids: string[] = [];
      
      // If no alarms on page, all database alarms should be deassigned
      if (alarmElements.length === 0) {
        // Deassign all units from all active alarms in database
        if (dbActiveAlarms.length > 0) {
          Logger.info(`Deassigning units from ${dbActiveAlarms.length} alarms no longer active`);
          for (const alarm of dbActiveAlarms) {
            await this.processRemovedAlarm(alarm);
          }
        }
        return;
      }

      // Process each scraped alarm with improved error handling
      let successfullyProcessed = 0;
      for (let i = 0; i < alarmElements.length; i++) {
        try {
          const alarmElement = alarmElements[i];
          const alarm = await this.extractAlarm(alarmElement);
          if (alarm) {
            scrapedDcids.push(alarm.dcid);
            this.logAlarm(alarm);
            successfullyProcessed++;
          }
        } catch (error) {
          // Catch errors for individual alarms to prevent stopping the entire process
          Logger.error(`Error processing alarm element ${i+1}`, error as Error);
        }
      }
      
      if (successfullyProcessed !== alarmElements.length) {
        Logger.warning(`Processed ${successfullyProcessed} of ${alarmElements.length} alarms`);
      }
      
      // PHASE 3: Find and process removed alarms (in database but not on page)
      const removedAlarms = dbActiveAlarms.filter(alarm => !scrapedDcids.includes(alarm.dcid));
      
      if (removedAlarms.length > 0) {
        Logger.info(`Processing ${removedAlarms.length} alarms no longer on dispatch page`);
        for (const alarm of removedAlarms) {
          await this.processRemovedAlarm(alarm);
        }
      }
    } catch (error) {
      Logger.error('Failed to scrape alarms', error as Error);
    }
  }
  
  /**
   * Process a removed alarm by deassigning all its units
   */
  private async processRemovedAlarm(alarm: { id: number, dcid: string, assigned_units: string[] }): Promise<void> {
    try {
      // Double verify with direct database query for active units
      const activeUnits = await this.alarmService.getActiveUnits(alarm.id);
      
      if (activeUnits.length === 0) {
        return;
      }
      
      Logger.info(`Deassigning units from alarm #${alarm.dcid}: ${activeUnits.join(', ')}`);
      const success = await this.alarmService.deassignAllUnits(alarm.id);
      
      if (!success) {
        Logger.error(`Failed to deassign units from alarm #${alarm.dcid}`);
      }
    } catch (error) {
      Logger.error(`Error processing removed alarm #${alarm.dcid}`, error as Error);
    }
  }

  private logAlarm(alarm: Omit<Alarm, 'id'>): void {
    const timestamp = new Date().toISOString();
   
    console.log(`Alarm #${alarm.dcid}`);
    console.log(`Address: ${alarm.address}`);
    console.log(`Received: ${alarm.alarm_timestamp}`);
    console.log(`Call Type: ${alarm.alarm_type}`);
    if (alarm.call_notes) {
      console.log(`Call Notes: ${alarm.call_notes}`);
    }
    if (alarm.call_ai_notes) {
      console.log(`AI Notes: ${alarm.call_ai_notes}`);
    }
    if (alarm.call_timeline) {
      console.log(`Call Timeline: ${alarm.call_timeline}`);
    }
    console.log('----------------------------------------');
  }
} 