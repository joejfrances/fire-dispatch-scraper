import { supabaseClient } from '../client';
import { Logger } from '../../utils/logger';

export class UnitService {
  private knownUnits: Set<string> | null = null;

  /**
   * Load all known unit IDs from the database
   */
  private async loadKnownUnits(): Promise<Set<string>> {
    try {
      const { data, error } = await supabaseClient
        .from('units')
        .select('unit_id');

      if (error) {
        Logger.error('Error loading known units', error);
        return new Set<string>();
      }

      return new Set(data.map(unit => unit.unit_id));
    } catch (error) {
      Logger.error('Failed to load known units', error as Error);
      return new Set<string>();
    }
  }

  /**
   * Get known units (with caching)
   */
  private async getKnownUnits(): Promise<Set<string>> {
    if (!this.knownUnits) {
      this.knownUnits = await this.loadKnownUnits();
    }
    return this.knownUnits;
  }

  /**
   * Identify any external units for logging purposes.
   * Returns all units for assignment, but separates known and external units for logging.
   */
  async identifyExternalUnits(units: string[]): Promise<{
    knownUnits: string[];
    externalUnits: string[];
  }> {
    const knownUnitSet = await this.getKnownUnits();
    const knownUnits: string[] = [];
    const externalUnits: string[] = [];

    for (const unit of units) {
      if (knownUnitSet.has(unit)) {
        knownUnits.push(unit);
      } else {
        externalUnits.push(unit);
        Logger.info(`Encountered external unit: ${unit}`);
      }
    }

    return { knownUnits, externalUnits };
  }
} 