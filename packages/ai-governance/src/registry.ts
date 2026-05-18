/**
 * AI agent registry
 */

export interface AIAgent {
  id: string;
  name: string;
  processPattern: string;
  domains: string[];
}

export class AIAgentRegistry {
  private agents: AIAgent[] = [];

  register(agent: AIAgent): void {
    this.agents.push(agent);
  }

  findByProcess(processName: string): AIAgent | undefined {
    return this.agents.find((a) => new RegExp(a.processPattern).test(processName));
  }

  findAll(): AIAgent[] {
    return this.agents;
  }
}
