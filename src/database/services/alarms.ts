import { supabaseClient } from '../client';
import { Alarm, UnitAssignment, DatabaseError } from '../types';
import { Logger } from '../../utils/logger';
import { OpenAIService } from '../../services/openaiService';

interface AlarmDetails {
  id: number;
  dcid: string;
  alarm_timestamp: string;
  address: string;
  alarm_type: string;
  call_notes: string | null;
  last_updated: string;
  current_units: string[];
}

export class AlarmService {
  private readonly openaiService: OpenAIService;

  constructor() {
    this.openaiService = new OpenAIService();
  }

  /**
   * Check if an alarm exists by its dcid
   */
  async alarmExists(dcid: string): Promise<boolean> {
    try {
      const { data, error } = await supabaseClient
        .from('alarms')
        .select('id')
        .eq('dcid', dcid)
        .single();

      if (error) {
        Logger.error(`Error checking alarm existence for dcid ${dcid}`, error);
        return false;
      }

      return !!data;
    } catch (error) {
      Logger.error(`Failed to check alarm existence for dcid ${dcid}`, error as Error);
      return false;
    }
  }

  /**
   * Get an alarm by its dcid
   */
  async getAlarmByDcid(dcid: string): Promise<Alarm | null> {
    try {
      const { data, error } = await supabaseClient
        .from('alarms')
        .select('*')
        .eq('dcid', dcid)
        .single();

      if (error) {
        Logger.error(`Error fetching alarm for dcid ${dcid}`, error);
        return null;
      }

      return data;
    } catch (error) {
      Logger.error(`Failed to fetch alarm for dcid ${dcid}`, error as Error);
      return null;
    }
  }

  /**
   * Create a new alarm
   */
  async createAlarm(alarm: Omit<Alarm, 'id'>): Promise<number | null> {
    try {
      Logger.info(`Creating new alarm record for dcid ${alarm.dcid}`);
      
      const { data, error } = await supabaseClient
        .from('alarms')
        .insert([alarm])
        .select('id')
        .single();

      if (error) {
        Logger.error(`Error creating alarm for dcid ${alarm.dcid}`, error);
        return null;
      }

      Logger.info(`Successfully created alarm record for dcid ${alarm.dcid}`);
      
      // Transform notes with OpenAI if they exist (only on initial creation)
      if (alarm.call_notes && data.id) {
        // Do this asynchronously so it doesn't block the creation process
        this.transformAndUpdateNotes(data.id, alarm.call_notes)
          .catch(err => Logger.error(`Error transforming notes for alarm ${data.id}`, err));
      }
      
      return data.id;
    } catch (error) {
      Logger.error(`Failed to create alarm for dcid ${alarm.dcid}`, error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Transform and update the call_ai_notes for a newly created alarm
   * This is private and only called during alarm creation
   */
  private async transformAndUpdateNotes(alarmId: number, notes: string): Promise<void> {
    try {
      // Transform the notes with OpenAI
      const transformedNotes = await this.openaiService.transformCallerNotes(notes);
      
      if (transformedNotes) {
        // Update the alarm record with transformed notes
        const { error } = await supabaseClient
          .from('alarms')
          .update({ call_ai_notes: transformedNotes })
          .eq('id', alarmId);
        
        if (error) {
          Logger.error(`Failed to update AI notes for alarm ${alarmId}`, error);
        } else {
          Logger.info(`Successfully updated AI notes for alarm ${alarmId}`);
        }
      }
    } catch (error) {
      Logger.error(`Failed to transform and update notes for alarm ${alarmId}`, error as Error);
    }
  }

  /**
   * Update an existing alarm
   */
  async updateAlarm(id: number, updates: Partial<Alarm>): Promise<boolean> {
    try {
      const { error } = await supabaseClient
        .from('alarms')
        .update(updates)
        .eq('id', id);

      if (error) {
        Logger.error(`Error updating alarm ${id}`, error);
        return false;
      }

      Logger.info(`Successfully updated alarm ${id}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to update alarm ${id}`, error as Error);
      return false;
    }
  }

  /**
   * Get active units for an alarm
   */
  async getActiveUnits(alarmId: number): Promise<string[]> {
    try {
      const { data, error } = await supabaseClient
        .from('units_assigned')
        .select('unit_id')
        .eq('alarm_id', alarmId)
        .is('deassigned_at', null);

      if (error) {
        Logger.error(`Error fetching active units for alarm ${alarmId}`, error);
        return [];
      }

      return data.map(unit => unit.unit_id);
    } catch (error) {
      Logger.error(`Failed to fetch active units for alarm ${alarmId}`, error as Error);
      return [];
    }
  }

  /**
   * Update unit assignments for an alarm
   */
  async updateUnitAssignments(alarmId: number, currentUnits: string[]): Promise<void> {
    try {
      // Get existing active units
      const existingUnits = await this.getActiveUnits(alarmId);
      
      // Determine units to deactivate
      const unitsToDeactivate = existingUnits.filter(unit => !currentUnits.includes(unit));
      
      // Determine new units to add
      const unitsToAdd = currentUnits.filter(unit => !existingUnits.includes(unit));

      const now = new Date().toISOString();

      // Get known units from units table
      const { data: knownUnits } = await supabaseClient
        .from('units')
        .select('unit_id')
        .in('unit_id', currentUnits);

      const knownUnitIds = new Set(knownUnits?.map(u => u.unit_id) || []);

      // Deactivate units that are no longer present
      if (unitsToDeactivate.length > 0) {
        const { error: deactivateError } = await supabaseClient
          .from('units_assigned')
          .update({ deassigned_at: now })
          .eq('alarm_id', alarmId)
          .in('unit_id', unitsToDeactivate);

        if (deactivateError) {
          Logger.error(`Error deactivating units for alarm ${alarmId}`, deactivateError);
        } else {
          Logger.info(`Deactivated units for alarm ${alarmId}: ${unitsToDeactivate.join(', ')}`);
        }
      }

      // Add new unit assignments
      if (unitsToAdd.length > 0) {
        // Check for existing deassigned records
        const { data: existingAssignments, error: checkError } = await supabaseClient
          .from('units_assigned')
          .select('id, unit_id')
          .eq('alarm_id', alarmId)
          .in('unit_id', unitsToAdd)
          .not('deassigned_at', 'is', null);
        
        if (checkError) {
          Logger.error(`Error checking existing assignments for alarm ${alarmId}`, checkError);
        }
        
        const unitsToReactivate = existingAssignments?.map(a => a.unit_id) || [];
        const unitsToCreate = unitsToAdd.filter(unit => !unitsToReactivate.includes(unit));
        
        // Reactivate existing units
        if (unitsToReactivate.length > 0) {
          const { error: reactivateError } = await supabaseClient
            .from('units_assigned')
            .update({ 
              assigned_at: now,
              deassigned_at: null 
            })
            .eq('alarm_id', alarmId)
            .in('unit_id', unitsToReactivate);
          
          if (reactivateError) {
            Logger.error(`Error reactivating units for alarm ${alarmId}`, reactivateError);
          } else {
            Logger.info(`Reactivated units for alarm ${alarmId}: ${unitsToReactivate.join(', ')}`);
          }
        }
        
        // Create new assignments
        if (unitsToCreate.length > 0) {
          const newAssignments = unitsToCreate.map(unitId => ({
            alarm_id: alarmId,
            unit_id: unitId,
            assigned_at: now,
            is_external: !knownUnitIds.has(unitId)  // Set based on presence in units table
          }));

          const { error: addError } = await supabaseClient
            .from('units_assigned')
            .insert(newAssignments);

          if (addError) {
            Logger.error(`Error adding new units for alarm ${alarmId}`, addError);
          } else {
            const externalUnits = unitsToCreate.filter(unit => !knownUnitIds.has(unit));
            if (externalUnits.length > 0) {
              Logger.info(`External units added to alarm ${alarmId}: ${externalUnits.join(', ')}`);
            }
            Logger.info(`Added new units for alarm ${alarmId}: ${unitsToCreate.join(', ')}`);
          }
        }
      }
    } catch (error) {
      Logger.error(`Failed to update unit assignments for alarm ${alarmId}`, error as Error);
    }
  }

  /**
   * Create unit assignments for an alarm
   */
  async createUnitAssignments(alarmId: number, units: string[]): Promise<void> {
    try {
      Logger.info(`Creating unit assignments for alarm ${alarmId}: ${units.join(', ')}`);

      // First, get the list of known units
      const { data: knownUnits } = await supabaseClient
        .from('units')
        .select('unit_id')
        .in('unit_id', units);

      const knownUnitIds = new Set(knownUnits?.map(u => u.unit_id) || []);

      const now = new Date().toISOString();
      const unitAssignments: Omit<UnitAssignment, 'id'>[] = units.map(unitId => ({
        alarm_id: alarmId,
        unit_id: unitId,
        assigned_at: now,
        is_external: !knownUnitIds.has(unitId)  // Set based on presence in units table
      }));

      const { error } = await supabaseClient
        .from('units_assigned')
        .insert(unitAssignments);

      if (error) {
        Logger.error(`Error creating unit assignments for alarm ${alarmId}`, error);
        return;
      }

      // Log external units if any are found
      const externalUnits = units.filter(unit => !knownUnitIds.has(unit));
      if (externalUnits.length > 0) {
        Logger.info(`External units assigned to alarm ${alarmId}: ${externalUnits.join(', ')}`);
      }

      Logger.info(`Successfully created unit assignments for alarm ${alarmId}`);
    } catch (error) {
      Logger.error(`Failed to create unit assignments for alarm ${alarmId}`, error as Error);
    }
  }

  /**
   * Log external units that are not in our predefined list
   */
  logExternalUnits(dcid: string, units: string[]): void {
    Logger.warning(`External units found for alarm ${dcid}: ${units.join(', ')}`);
  }

  async getActiveAlarms(): Promise<AlarmDetails[]> {
    try {
      // Only get alarms that have units currently assigned (not deassigned)
      const { data, error } = await supabaseClient
        .from('alarm_details')
        .select('*')
        .not('current_units', 'eq', '{}')
        .not('current_units', 'is', null);

      if (error) {
        Logger.error('Failed to get active alarms', error);
        return [];
      }

      // Filter out any alarms without units (extra safety check)
      return (data || []).filter(alarm => 
        Array.isArray(alarm.current_units) && 
        alarm.current_units.length > 0
      );
    } catch (error) {
      Logger.error('Failed to get active alarms', error as Error);
      return [];
    }
  }

  async deassignAllUnits(alarmId: number): Promise<boolean> {
    try {
      const currentTime = new Date().toISOString();

      // First, check if there are any units to deassign
      const { data: activeUnits, error: checkError } = await supabaseClient
        .from('units_assigned')
        .select('unit_id')
        .eq('alarm_id', alarmId)
        .is('deassigned_at', null);

      if (checkError) {
        Logger.error(`Failed to check active units for alarm ${alarmId}`, checkError);
        return false;
      }

      if (!activeUnits || activeUnits.length === 0) {
        Logger.info(`No active units to deassign for alarm ${alarmId}`);
        return true;
      }

      // Proceed with deassignment only if there are active units
      const { error: updateError } = await supabaseClient
        .from('units_assigned')
        .update({ deassigned_at: currentTime })
        .eq('alarm_id', alarmId)
        .is('deassigned_at', null);

      if (updateError) {
        Logger.error(`Failed to deassign units for alarm ${alarmId}`, updateError);
        return false;
      }

      const unitIds = activeUnits.map(u => u.unit_id);
      Logger.info(`Successfully deassigned units for alarm ${alarmId}: ${unitIds.join(', ')}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to deassign units for alarm ${alarmId}`, error as Error);
      return false;
    }
  }
} 