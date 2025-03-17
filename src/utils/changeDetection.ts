import { Alarm } from '../database/types';
import { Logger } from './logger';

export interface Changes {
  callTypeChanged: boolean;
  addressChanged: boolean;
  notesChanged: boolean;
  timelineChanged: boolean;
  unitsChanged: {
    added: string[];
    removed: string[];
  };
  hasAnyChanges: boolean;
}

/**
 * Compare two alarms and their unit assignments to detect changes
 */
export function detectChanges(
  existing: Alarm,
  current: Partial<Alarm>,
  existingUnits: string[],
  currentUnits: string[]
): Changes {
  const changes: Changes = {
    callTypeChanged: false,
    addressChanged: false,
    notesChanged: false,
    timelineChanged: false,
    unitsChanged: {
      added: [],
      removed: []
    },
    hasAnyChanges: false
  };

  // Check call type changes
  if (current.alarm_type && current.alarm_type !== existing.alarm_type) {
    changes.callTypeChanged = true;
    Logger.info(`Call type changed from "${existing.alarm_type}" to "${current.alarm_type}"`);
  }

  // Check address changes
  if (current.address && current.address !== existing.address) {
    changes.addressChanged = true;
    Logger.info(`Address changed from "${existing.address}" to "${current.address}"`);
  }

  // Check call notes changes
  if (current.call_notes && current.call_notes !== existing.call_notes) {
    changes.notesChanged = true;
    Logger.info('Call notes updated');
  }

  // Check call timeline changes
  if (current.call_timeline && current.call_timeline !== existing.call_timeline) {
    changes.timelineChanged = true;
    Logger.info('Call timeline updated');
  }

  // Check unit changes
  changes.unitsChanged.added = currentUnits.filter(unit => !existingUnits.includes(unit));
  changes.unitsChanged.removed = existingUnits.filter(unit => !currentUnits.includes(unit));

  if (changes.unitsChanged.added.length > 0) {
    Logger.info(`New units assigned: ${changes.unitsChanged.added.join(', ')}`);
  }

  if (changes.unitsChanged.removed.length > 0) {
    Logger.info(`Units removed: ${changes.unitsChanged.removed.join(', ')}`);
  }

  // Determine if any changes were detected
  changes.hasAnyChanges = changes.callTypeChanged || 
                         changes.addressChanged ||
                         changes.notesChanged || 
                         changes.timelineChanged ||
                         changes.unitsChanged.added.length > 0 || 
                         changes.unitsChanged.removed.length > 0;

  return changes;
} 