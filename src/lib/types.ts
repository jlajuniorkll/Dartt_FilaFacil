
export interface ButtonConfig {
  id: string;
  name: string;
  prefix: string;
  priority: number;
  frequency: number;
  automaticNumbering: boolean;
  startNumber?: number;
  color: string;
  textColor: string;
  associatedCounters?: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  type: string;
  prefix: string;
  timestamp: string;
  called: boolean;
  calledAt?: string;
  displayNumber: number;
  isRepeat?: boolean;
  counter?: number;
}

export interface AppSettings {
  buttons: ButtonConfig[];
  youtubeUrls: string[];
  priorityEnabled: boolean;
  counterConfiguration: 'none';
  totalCounters: number;
}

export interface DailyQueue {
    lastCalled: Ticket | null;
    callHistory: Ticket[];
    callCounters: { [key: string]: number };
    sequenceCounters?: { [key: string]: number };
}


export interface DashboardStats {
  totalIssued: number;
  totalCalled: number;
  waitingCount: number;
  averageServiceTime: string; // Ex: "5m 30s"
  estimatedWaitTime: string; // Ex: "1h 15m"
  ticketsByType: { name: string; count: number; fill: string; }[];
  ticketsByCounter: { counter: string; count: number; fill: string; }[];
}
