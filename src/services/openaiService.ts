import OpenAI from 'openai';
import { Logger } from '../utils/logger';
import { config } from '../config/config';
import { RateLimiter } from './rateLimiter';
import { CircuitBreaker } from './circuitBreaker';

export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly maxRetries: number;
  private readonly initialBackoffMs: number;
  private readonly rateLimiter: RateLimiter;
  private readonly circuitBreaker: CircuitBreaker;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    
    // Initialize with defaults or from config
    this.maxRetries = config.openai.maxRetries || 3;
    this.initialBackoffMs = config.openai.initialBackoffMs || 1000;
    this.rateLimiter = new RateLimiter(config.openai.requestsPerMinute || 60);
    this.circuitBreaker = new CircuitBreaker(
      config.openai.circuitBreakerFailureThreshold || 5,
      config.openai.circuitBreakerResetTimeoutMs || 60000
    );
  }

  /**
   * Transform caller notes using GPT-4o Mini
   * This will be called only once when an alarm is first created
   */
  async transformCallerNotes(notes: string): Promise<string | null> {
    if (!notes) {
      return null;
    }

    // Remove "Call Notes: " prefix if present
    const cleanedNotes = notes.replace(/^Call Notes:\s*/i, '');

    // Use circuit breaker pattern with retry logic
    return this.circuitBreaker.executeWithCircuitBreaker(
      async () => {
        let retryCount = 0;
        let lastError: Error | null = null;

        while (retryCount <= this.maxRetries) {
          try {
            // Wait for rate limiter permission
            await this.rateLimiter.waitForPermission();
            
            Logger.info(`Transforming caller notes with OpenAI GPT-4o Mini${retryCount > 0 ? ` (Retry ${retryCount}/${this.maxRetries})` : ''}`);
            
            const completion = await this.openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: "You are a specialized translator of emergency dispatch notes. Your task is to convert technical 911 dispatch " +
                    "notes into clear, readable descriptions that anyone can understand without emergency services training.\n\n" +
                    
                    "TRANSFORMATION CONSTRAINTS:\n" +
                    "- Length: Output must be between 100-150 characters.\n" +
                    "- Technical Terms: Convert technical codes and abbreviations to plain English, except unit designations (B1, L74, etc.).\n" +
                    "- Medical & Age Details: Include both specific age and category (infant, child, adult, elderly).\n" +
                    "- Privacy Rules:\n" +
                    "  • REMOVE all telephone numbers.\n" +
                    "  • REMOVE specific addresses.\n" +
                    "- Emergency Services Terms:\n" +
                    "  • 'Empress' = ambulance service in this district.\n" +
                    "  • 'Transfer to Empress' = patient handover (NOT a phone transfer).\n" +
                    "- Dispatch Codes: DO NOT include numerical 10-codes; translate them into plain English.\n" +
                    "- Clarity & Conciseness:\n" +
                    "  • Keep only critical information.\n" +
                    "  • Remove redundancies, system notifications, and non-essential details.\n" +
                    "  • Present medical conditions in simple, understandable terms.\n\n" +
                    
                    "REFERENCE CONTEXT (Yonkers Fire Department 10-Codes):\n" +
                    "- 10-18: Holding first engine and truck\n" +
                    "- 10-19: Holding all units specified\n" +
                    "- 10-24: Auto fire (RD: on city street, HW: on highway)\n" +
                    "- 10-26: Food on the stove\n" +
                    "- 10-29: Structure Fire\n" +
                    "- 10-32: Accidental alarm\n" +
                    "- 10-35: Defective alarm\n" +
                    "- 10-36: Water Condition/Open Hydrant/Wires Down/Outside Smoke/Lock-in\n" +
                    "- 10-45: Medical Aid\n" +
                    "- 10-80: Inside Gas Emergency\n" +
                    "- 10-82: Request Hazmat\n" +
                    "- 10-84: Unit on Scene\n" +
                    "- 10-87: Elevator Emergency\n" +
                    "- 10-92: False Alarm\n\n" +
                    
                    "EXAMPLES OF TRANSFORMATIONS:\n\n" +
                    
                    "Original Dispatch Notes: ZONE 201 B1 A/C HACAJ ANOTHER CALL HEAD CUSTODIAN AWAITING FD ARRIVAL L74 2 STORY SCHOOL\n" +
                    "Transformed Description: Fire alarm in Zone 201 at two-story school. Head custodian waiting for fire department. B1 with Chief Hacaj and L74 responding.\n\n" +
                    
                    "Original Dispatch Notes: DIFF BREATHING 11 YOA FEMALE TRANS TO EMPRESS\n" +
                    "Transformed Description: Child (11-year-old female) with difficulty breathing. Patient transferred to Empress ambulance.\n\n" +
                    
                    "Original Dispatch Notes: 3 YOA MALE LOW OXYGEN LEVELS DIFF BREATHING EMPRESS NOTI\n" +
                    "Transformed Description: 3-year-old male with low oxygen and breathing difficulty. Empress ambulance notified.\n\n" +
                    
                    "Original Dispatch Notes: INSIDE GAS ODOR 15 MIN ETA CON ED GAS: NOTIFY CON ED GAS. (914) 921-3720[Agency/IRF] B2 A/C CONNOLLY L74 3 STORY ORDINARY CHECKING " +
                    "B2 HAS THE CALLER//POSS OUTSIDE ODOR 10-19 E307 WAITING FOR CON ED (YFD/B2) CON ED GAS ON SCENE (YFD/E307)\n" +
                    "Transformed Description: Gas odor inside 3-story building. B2, L74 investigating. Possible outside odor. All units holding. E307 on scene with Con Edison Gas.\n\n" +
                    
                    "Original Dispatch Notes: ELDERLY FEM CUSTOMER HAVING DIFF BREATHING STAFF CALLING EMPRESS INSIDE THE STORE\n" +
                    "Transformed Description: Elderly female customer inside store having difficulty breathing. Staff called Empress ambulance.\n\n" +
                    
                    "Original Dispatch Notes: BRICK FACADE HOUSE TWO CAR GARAGE WIDE OPEN CALLER SAW FLAMES INSIDE THE GARAGE B2- REQ FAST TEAM HOUSE IS ON CLIFFSIDE DR\n" +
                    "Transformed Description: Flames in garage of brick house. B2 investigating propane heater. No occupants reported. FAST team requested. L72 released.\n\n" +
                    
                    "Original Dispatch Notes: 2ND FLOOR - ADMIN OFFICE CHEST PAINS TRANS TO EMPRESS\n" +
                    "Transformed Description: Patient on 2nd floor admin office with chest pains. Transferred to Empress ambulance.\n\n" +
                    
                    "Original Dispatch Notes: FOUND MOTHER ON FLOOR NOT WAKING UP - NOT BREATHING COLD TO TOUCH\n" +
                    "Transformed Description: Person found mother unresponsive on floor, not breathing, and cold to touch. Possible cardiac arrest.\n\n" +
                    
                    "Original Dispatch Notes: LOW HANGING WIRE CON ED ELECTRIC: NOTIFY CON ED ELECTRIC\n" +
                    "Transformed Description: Low hanging electrical wire reported. Con Edison Electric has been notified.\n\n" +
                    
                    "Original Dispatch Notes: DIABETIC EMERGENCY FOOD COURT AREA TRANS TO EMPRESS\n" +
                    "Transformed Description: Diabetic emergency in food court area. Patient transferred to Empress ambulance.\n\n" +
                    
                    "Original Dispatch Notes: 3 YR OLD LOCKED IN A BEDROOM LOCKED FROM THE INSIDE\n" +
                    "Transformed Description: 3-year-old child locked in bedroom from inside. Door locked from interior.\n\n" +
                    
                    "Original Dispatch Notes: 88 F WEAK LIGHT HEADED DIFFICULTY STANDING POSSIBLE STROKE IN CHURCH TRANS TO EMPRESS\n" +
                    "Transformed Description: Elderly (88-year-old female) at church with weakness, lightheadedness, difficulty standing. Possible stroke. Empress notified.\n\n" +
                    
                    "Original Dispatch Notes: FOOD ON STOVE CALLER ADVISED FIRE ALARM SOUNDING, NO SMOKE OR FLAMES\n" +
                    "Transformed Description: Food on stove. Alarm sounding but no smoke/flames. B2, E310, L75 holding at scene. 3-story Type 3 building. Nothing showing.\n\n" +
                    
                    "Original Dispatch Notes: ELEVATOR EMERGENCY STUCK OCCUPIED ELEVATOR NEAR LOBBY\n" +
                    "Transformed Description: Elevator emergency. Occupied elevator stuck near lobby.\n\n" +
                    
                    "Now transform the following dispatch notes into a clear, plain English description between 100-150 characters."
                },
                {
                  role: 'user',
                  content: `Original Dispatch Notes: ${cleanedNotes}`
                }
              ],
              temperature: 0.2,
              max_tokens: 100
            });

            const transformedNotes = completion.choices[0].message.content;
            
            if (transformedNotes) {
              Logger.info('Successfully transformed caller notes');
              return transformedNotes;
            } else {
              Logger.warning('Empty response from OpenAI when transforming notes');
              return notes; // Return original notes if transformation fails
            }
          } catch (error: any) {
            lastError = error as Error;
            
            // Check if we should retry based on error type
            if (this.isRetryableError(error) && retryCount < this.maxRetries) {
              retryCount++;
              const backoffTime = this.calculateBackoff(retryCount);
              Logger.warning(`OpenAI API error (Attempt ${retryCount}/${this.maxRetries}). Retrying in ${backoffTime}ms: ${error.message}`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));
              
              // If rate limit was hit, reset our tracking
              if (error.status === 429) {
                this.rateLimiter.resetLimiter();
              }
              
              continue;
            }
            
            // Log and return original if we're out of retries or it's not retryable
            Logger.error('Error transforming caller notes with OpenAI', error as Error);
            return notes;
          }
        }

        // This will only be reached if all retries failed
        Logger.error(`Failed to transform notes after ${this.maxRetries} retries`, lastError as Error);
        return notes;
      },
      () => {
        // Fallback function that returns original notes
        Logger.warning('Using original notes as fallback due to OpenAI service issues');
        return notes;
      }
    );
  }

  // ---------- HELPER METHODS ----------

  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    // Rate limit errors
    if (error.status === 429) return true;
    
    // Server errors
    if (error.status >= 500 && error.status < 600) return true;
    
    // Network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') return true;
    
    return false;
  }

  private calculateBackoff(retryCount: number): number {
    // Exponential backoff with jitter
    const exponentialBackoff = this.initialBackoffMs * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 0.3 * exponentialBackoff; // 0-30% jitter
    return Math.min(exponentialBackoff + jitter, 10000); // Cap at 10 seconds
  }
} 