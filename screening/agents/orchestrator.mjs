/**
 * Hawkeye-Sterling Agent Orchestration Layer.
 *
 * Implements the Claude Agent SDK architecture pattern:
 *
 *   ┌──────────┐     ┌──────────┐     ┌──────────┐
 *   │ Session  │◄───►│ Harness  │◄───►│ Sandbox  │
 *   │  ✓─      │     │    ✳     │     │  >_      │
 *   └──────────┘     └────┬─────┘     └──────────┘
 *                         │
 *               ┌─────────┼─────────┐
 *               ▼                   ▼
 *        ┌──────────┐       ┌──────────────┐
 *        │  Tools   │       │Orchestration │
 *        │+MCP/Res  │       │     ⚙️       │
 *        └──────────┘       └──────────────┘
 *
 * Components:
 *   - SESSION: Manages conversation state, context, and memory
 *   - HARNESS: Core agent loop — receives tasks, calls tools, returns results
 *   - SANDBOX: Isolated execution environment for each compliance task
 *   - TOOLS: MCP server tools + direct module imports
 *   - ORCHESTRATION: Multi-agent coordination for complex workflows
 *
 * Orchestration patterns:
 *   1. SEQUENTIAL — Tasks executed in order (screening → risk → filing)
 *   2. PARALLEL — Independent tasks run concurrently (multi-entity screening)
 *   3. PIPELINE — Output of one agent feeds into the next
 *   4. SUPERVISOR — One agent delegates to and monitors others
 *   5. CONSENSUS — Multiple agents vote on a decision (risk rating)
 *
 * This enables autonomous compliance workflows:
 *   - "Screen all new counterparties and file STRs for any high-risk matches"
 *   - "Re-rate all customers after sanctions list refresh"
 *   - "Generate inspection evidence pack with all supporting documents"
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// ── Agent Definitions ──────────────────────────────────────────

const AGENTS = {
  screener: {
    name: 'Screening Agent',
    description: 'Performs sanctions/PEP screening and adverse media checks',
    tools: ['screen', 'batch_screen', 'check_freshness'],
    module: 'screening/index.js',
  },
  risk_assessor: {
    name: 'Risk Assessment Agent',
    description: 'Calculates entity risk scores and CDD levels',
    tools: ['calculate_risk', 'assess_vasp', 'check_ubo'],
    module: 'screening/analysis/risk-scoring.mjs',
  },
  transaction_monitor: {
    name: 'Transaction Monitor Agent',
    description: 'Analyzes transactions for AML patterns and anomalies',
    tools: ['analyze_transactions', 'detect_anomalies', 'screen_typologies'],
    modules: ['screening/analysis/transaction-patterns.mjs', 'screening/analysis/ml-anomaly.mjs'],
  },
  filing_agent: {
    name: 'Filing Agent',
    description: 'Manages STR/SAR filing workflow from draft to goAML submission',
    tools: ['create_filing', 'transition_filing', 'generate_goaml'],
    module: 'screening/lib/mlro-workflow.mjs',
  },
  intelligence_agent: {
    name: 'Intelligence Agent',
    description: 'Fetches and analyzes geopolitical intelligence from World Monitor',
    tools: ['fetch_intelligence', 'country_index', 'early_warnings'],
    module: 'screening/sources/worldmonitor-deep.mjs',
  },
  compliance_auditor: {
    name: 'Compliance Auditor Agent',
    description: 'Assesses overall compliance health and generates reports',
    tools: ['compliance_grade', 'check_training', 'verify_audit', 'check_retention'],
    modules: ['screening/analysis/compliance-grade.mjs', 'screening/lib/training-tracker.mjs'],
  },
  case_manager: {
    name: 'Case Manager Agent',
    description: 'Creates and manages investigation cases',
    tools: ['create_case', 'escalate_case', 'add_evidence'],
    module: 'screening/lib/case-manager.mjs',
  },
  crypto_agent: {
    name: 'Crypto Compliance Agent',
    description: 'Screens virtual asset transactions and assesses VASP risk',
    tools: ['screen_crypto', 'check_travel_rule', 'assess_vasp_risk'],
    module: 'screening/lib/crypto-compliance.mjs',
  },
};

// ── Task Definition ────────────────────────────────────────────

class Task {
  constructor(params) {
    this.id = params.id || `task-${randomUUID().slice(0, 8)}`;
    this.type = params.type;
    this.agent = params.agent;
    this.input = params.input;
    this.status = 'pending'; // pending, running, completed, failed, cancelled
    this.output = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
    this.parentId = params.parentId || null;
    this.children = [];
  }
}

// ── Orchestrator ───────────────────────────────────────────────

export class ComplianceOrchestrator extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.projectRoot = opts.projectRoot || process.cwd();
    this.tasks = new Map();
    this.workflows = new Map();
    this.running = 0;
    this.maxConcurrent = opts.maxConcurrent || 5;
    this.agentModules = new Map(); // Lazy-loaded modules
  }

  /**
   * Load an agent's module(s) on demand.
   */
  async _loadAgent(agentId) {
    if (this.agentModules.has(agentId)) return this.agentModules.get(agentId);
    const agent = AGENTS[agentId];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);

    const { resolve } = await import('node:path');
    const modules = {};

    if (agent.module) {
      modules.primary = await import(resolve(this.projectRoot, agent.module));
    }
    if (agent.modules) {
      for (const mod of agent.modules) {
        const name = mod.split('/').pop().replace(/\.(mjs|js)$/, '');
        modules[name] = await import(resolve(this.projectRoot, mod));
      }
    }

    this.agentModules.set(agentId, modules);
    return modules;
  }

  /**
   * Execute a single task.
   */
  async executeTask(task) {
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.running++;
    this.emit('task:start', task);

    try {
      const modules = await this._loadAgent(task.agent);
      let result;

      // Route to agent-specific execution
      switch (task.agent) {
        case 'screener':
          result = await this._runScreener(modules, task);
          break;
        case 'risk_assessor':
          result = await this._runRiskAssessor(modules, task);
          break;
        case 'transaction_monitor':
          result = await this._runTransactionMonitor(modules, task);
          break;
        case 'filing_agent':
          result = await this._runFilingAgent(modules, task);
          break;
        case 'intelligence_agent':
          result = await this._runIntelligenceAgent(modules, task);
          break;
        case 'compliance_auditor':
          result = await this._runComplianceAuditor(modules, task);
          break;
        case 'crypto_agent':
          result = await this._runCryptoAgent(modules, task);
          break;
        default:
          throw new Error(`No executor for agent: ${task.agent}`);
      }

      task.output = result;
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      this.emit('task:complete', task);
    } catch (err) {
      task.error = err.message;
      task.status = 'failed';
      task.completedAt = new Date().toISOString();
      this.emit('task:fail', task);
    } finally {
      this.running--;
    }

    return task;
  }

  // ── Agent Executors ────────────────────────────────────────

  async _runScreener(modules, task) {
    const screening = modules.primary;
    await screening.init();
    switch (task.type) {
      case 'screen':
        return screening.screen(task.input.query, task.input.opts);
      case 'batch_screen':
        return screening.batch(task.input.queries, task.input.opts);
      case 'check_freshness':
        return screening.checkFreshness();
      default:
        return screening.screen({ name: task.input.name }, { force: true });
    }
  }

  async _runRiskAssessor(modules, task) {
    const { calculateRisk } = modules.primary;
    return calculateRisk(task.input);
  }

  async _runTransactionMonitor(modules, task) {
    switch (task.type) {
      case 'analyze': {
        const { analyzeTransactions } = modules['transaction-patterns'];
        return analyzeTransactions(task.input.transactions, task.input.opts);
      }
      case 'anomaly': {
        const { detectAnomalies } = modules['ml-anomaly'];
        return detectAnomalies(task.input.transactions, task.input.opts);
      }
      default: {
        const { analyzeTransactions } = modules['transaction-patterns'];
        return analyzeTransactions(task.input.transactions || []);
      }
    }
  }

  async _runFilingAgent(modules, task) {
    const { FilingWorkflow } = modules.primary;
    const { resolve } = await import('node:path');
    const wf = new FilingWorkflow(resolve(this.projectRoot, '.screening', 'filing-register.json'));
    await wf.load();
    switch (task.type) {
      case 'create': return wf.create(task.input);
      case 'transition': return wf.transition(task.input.filingId, task.input.newState, task.input.actor, task.input.role, task.input.reason);
      case 'list': return wf.list(task.input.filter);
      default: return wf.list();
    }
  }

  async _runIntelligenceAgent(modules, task) {
    const { fullBriefing, calculateCII, detectEarlyWarnings } = modules.primary;
    switch (task.type) {
      case 'briefing': return fullBriefing(task.input.country, task.input.opts);
      case 'cii': return calculateCII(task.input.country, task.input.events || []);
      case 'warnings': return detectEarlyWarnings(task.input.events || []);
      default: return fullBriefing(task.input.country || 'AE');
    }
  }

  async _runComplianceAuditor(modules, task) {
    const { calculateComplianceGrade, formatScorecard } = modules.primary;
    const grade = calculateComplianceGrade(task.input.metrics || {});
    return { ...grade, formatted: formatScorecard(grade) };
  }

  async _runCryptoAgent(modules, task) {
    const { screenCryptoTransaction, checkTravelRule, assessVASPRisk } = modules.primary;
    switch (task.type) {
      case 'screen_tx': return screenCryptoTransaction(task.input);
      case 'travel_rule': return checkTravelRule(task.input);
      case 'vasp_risk': return assessVASPRisk(task.input);
      default: return screenCryptoTransaction(task.input);
    }
  }

  // ── Orchestration Patterns ─────────────────────────────────

  /**
   * SEQUENTIAL: Execute tasks one after another.
   * Output of each task is available to the next.
   */
  async sequential(taskDefs) {
    const workflowId = `wf-${randomUUID().slice(0, 8)}`;
    const results = [];

    for (const def of taskDefs) {
      const task = new Task({ ...def, parentId: workflowId });
      this.tasks.set(task.id, task);

      // Inject previous result if referenced
      if (def.inputFromPrevious && results.length > 0) {
        task.input = { ...task.input, previousResult: results[results.length - 1].output };
      }

      const result = await this.executeTask(task);
      results.push(result);

      if (result.status === 'failed' && !def.continueOnError) break;
    }

    return { workflowId, pattern: 'sequential', tasks: results };
  }

  /**
   * PARALLEL: Execute independent tasks concurrently.
   */
  async parallel(taskDefs) {
    const workflowId = `wf-${randomUUID().slice(0, 8)}`;
    const tasks = taskDefs.map(def => {
      const task = new Task({ ...def, parentId: workflowId });
      this.tasks.set(task.id, task);
      return task;
    });

    // Run with concurrency limit
    const results = [];
    const executing = new Set();

    for (const task of tasks) {
      const promise = this.executeTask(task).then(r => { executing.delete(promise); return r; });
      executing.add(promise);
      results.push(promise);

      if (executing.size >= this.maxConcurrent) {
        await Promise.race(executing);
      }
    }

    return { workflowId, pattern: 'parallel', tasks: await Promise.all(results) };
  }

  /**
   * PIPELINE: Chain agents where output feeds into next input.
   */
  async pipeline(stages) {
    const workflowId = `wf-${randomUUID().slice(0, 8)}`;
    let currentInput = stages[0].input;
    const results = [];

    for (const stage of stages) {
      const task = new Task({ ...stage, input: currentInput, parentId: workflowId });
      this.tasks.set(task.id, task);

      const result = await this.executeTask(task);
      results.push(result);

      if (result.status === 'failed') break;

      // Transform output for next stage
      currentInput = stage.transformOutput
        ? stage.transformOutput(result.output)
        : result.output;
    }

    return { workflowId, pattern: 'pipeline', tasks: results };
  }

  /**
   * SUPERVISOR: One coordinating agent delegates work.
   */
  async supervised(supervisorDef, workerDefs) {
    const workflowId = `wf-${randomUUID().slice(0, 8)}`;

    // Run workers in parallel
    const workerResults = await this.parallel(workerDefs);

    // Supervisor reviews all results
    const supervisorTask = new Task({
      ...supervisorDef,
      input: { ...supervisorDef.input, workerResults: workerResults.tasks.map(t => t.output) },
      parentId: workflowId,
    });
    this.tasks.set(supervisorTask.id, supervisorTask);
    const supervisorResult = await this.executeTask(supervisorTask);

    return { workflowId, pattern: 'supervised', supervisor: supervisorResult, workers: workerResults.tasks };
  }

  // ── Pre-built Workflows ────────────────────────────────────

  /**
   * Full onboarding workflow: screen → risk score → PEP check → decision.
   */
  async onboardEntity(entity) {
    return this.pipeline([
      { agent: 'screener', type: 'screen', input: { query: { name: entity.name, type: entity.type, countries: entity.country ? [entity.country] : [] } } },
      { agent: 'risk_assessor', type: 'assess', input: entity, transformOutput: (screenResult) => ({ ...entity, sanctionsBand: screenResult?.topBand, sanctionsScore: screenResult?.hits?.[0]?.score }) },
    ]);
  }

  /**
   * Post-refresh workflow: check freshness → re-screen all counterparties.
   */
  async postRefreshWorkflow(counterparties) {
    return this.sequential([
      { agent: 'screener', type: 'check_freshness', input: {} },
      { agent: 'screener', type: 'batch_screen', input: { queries: counterparties.map(c => ({ name: c.name, type: c.type || 'entity' })), opts: { force: true } }, inputFromPrevious: false },
    ]);
  }

  /**
   * Inspection preparation: grade → verify audit → generate report.
   */
  async prepareInspection(metrics) {
    return this.sequential([
      { agent: 'compliance_auditor', type: 'grade', input: { metrics } },
      { agent: 'screener', type: 'check_freshness', input: {} },
    ]);
  }

  // ── Stats ──────────────────────────────────────────────────

  stats() {
    const tasks = [...this.tasks.values()];
    return {
      totalTasks: tasks.length,
      running: this.running,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      agents: Object.keys(AGENTS),
      agentCount: Object.keys(AGENTS).length,
    };
  }
}

export { AGENTS, Task };
