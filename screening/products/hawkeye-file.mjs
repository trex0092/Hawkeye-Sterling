/**
 * HAWKEYE FILE — Filing Workflow + goAML Export.
 *
 * End-to-end compliance filing management from draft to goAML submission.
 *
 * Capabilities:
 *   - MLRO approval state machine (7 states, role-enforced transitions)
 *   - goAML XML export (STR, SAR, CTR, DPMSR, CNMR)
 *   - CSV screening report export
 *   - Structured risk assessment reports
 *   - Filing deadline tracking with SLA alerting
 *   - Investigation case management
 *   - Cross-institution intelligence sharing
 *   - Urgent filing detection and prioritisation
 *
 * License tier: FILE (add-on)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export class HawkeyeFile {
  constructor(opts = {}) {
    this.opts = opts;
    this._workflow = null;
    this._registerPath = opts.registerPath || resolve(ROOT, '.screening', 'filing-register.json');
  }

  async _loadWorkflow() {
    if (this._workflow) return;
    const { FilingWorkflow } = await import(resolve(ROOT, 'screening', 'lib', 'mlro-workflow.mjs'));
    this._workflow = new FilingWorkflow(this._registerPath);
    await this._workflow.load();
  }

  /** Create a new filing draft. */
  async createFiling(params) {
    await this._loadWorkflow();
    return this._workflow.create(params);
  }

  /** Transition a filing to a new state. */
  async transitionFiling(filingId, newState, actor, role, reason) {
    await this._loadWorkflow();
    return this._workflow.transition(filingId, newState, actor, role, reason);
  }

  /** Get a filing by ID. */
  async getFiling(filingId) {
    await this._loadWorkflow();
    return this._workflow.get(filingId);
  }

  /** List filings with optional filters. */
  async listFilings(filter = {}) {
    await this._loadWorkflow();
    return this._workflow.list(filter);
  }

  /** Get urgent filings approaching deadline. */
  async getUrgent(daysThreshold = 3) {
    await this._loadWorkflow();
    return this._workflow.getUrgent(daysThreshold);
  }

  /** Generate goAML XML for a filing. */
  async generateGoAML(filingData) {
    const { generateGoAMLXml } = await import(resolve(ROOT, 'screening', 'export', 'goaml-xml.mjs'));
    return generateGoAMLXml(filingData);
  }

  /** Export screening results as CSV. */
  async exportScreeningCsv(results) {
    const { generateScreeningCsv } = await import(resolve(ROOT, 'screening', 'export', 'goaml-xml.mjs'));
    return generateScreeningCsv(results);
  }

  /** Generate structured risk report. */
  async generateRiskReport(assessment) {
    const { generateRiskReport } = await import(resolve(ROOT, 'screening', 'export', 'goaml-xml.mjs'));
    return generateRiskReport(assessment);
  }

  static get product() {
    return {
      id: 'hawkeye-file',
      name: 'Hawkeye File',
      tagline: 'Compliance filing workflow with goAML export and MLRO approval',
      version: '2.0.0',
      tier: 'addon',
      requires: ['hawkeye-screen'],
    };
  }
}
