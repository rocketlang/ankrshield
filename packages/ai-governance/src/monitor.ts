/**
 * AI agent monitoring
 */

export interface AIActivity {
  agentId: string;
  type: 'file' | 'network' | 'clipboard';
  details: string;
  timestamp: Date;
}

export class AIAgentMonitor {
  private activities: AIActivity[] = [];

  logActivity(activity: AIActivity): void {
    this.activities.push(activity);
  }

  getActivities(agentId: string): AIActivity[] {
    return this.activities.filter(a => a.agentId === agentId);
  }
}
