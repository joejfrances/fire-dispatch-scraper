export type AlarmStatus = 'active' | 'inactive';

export interface Alarm {
  id: number;
  dcid: string;
  address: string;
  alarm_timestamp: string;
  alarm_type: string;
  call_notes?: string;
  call_ai_notes?: string;
  call_timeline?: string;
  last_updated: string;
}

export interface UnitAssignment {
  id?: number;
  alarm_id: number;
  unit_id: string;
  assigned_at: string;
  deassigned_at?: string;
  is_external: boolean;
}

export interface DatabaseError {
  message: string;
  details?: any;
} 