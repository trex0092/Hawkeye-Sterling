/**
 * Regulator Evidence Pack Exporter.
 *
 * Generates comprehensive inspection-ready evidence bundles for supervisory
 * inspections, annual reviews, incident response, and customer exit scenarios.
 * Each pack compiles screening results, filing history, audit trail excerpts,
 * risk assessments, training records, and policy documents into a single
 * plain-text output suitable for regulator review.
 *
 * Pack types:
 *
 *   supervisory_inspection - Full evidence bundle for MOE site visits
 *   annual_review          - Year-end compliance programme assessment
 *   incident_response      - Evidence compiled in response to a specific event
 *   customer_exit          - CDD and transaction history for an exited customer
 *
 * Each pack includes a table of contents, chronological event timeline,
 * summary statistics, file manifest with SHA-256 hashes for integrity
 * verification, and concludes with the MLRO sign-off line.
 *
 * Output is plain-text UTF-8. No markdown headings. No AI artefacts.
 *
 * Reference: Federal Decree-Law No. 10/2025 (record-keeping and inspection
 * cooperation obligations).
 */

import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Supported pack types. */
export const PACK_TYPES = Object.freeze({
  SUPERVISORY_INSPECTION: 'supervisory_inspection',
  ANNUAL_REVIEW:          'annual_review',
  INCIDENT_RESPONSE:      'incident_response',
  CUSTOMER_EXIT:          'customer_exit',
});

/** Required sections per pack type. */
export const REQUIRED_SECTIONS = Object.freeze({
  [PACK_TYPES.SUPERVISORY_INSPECTION]: [
    'screening_results',
    'filing_history',
    'audit_trail',
    'risk_assessments',
    'training_records',
    'policy_documents',
    'cdd_register_summary',
    'sanctions_screening_log',
  ],
  [PACK_TYPES.ANNUAL_REVIEW]: [
    'screening_results',
    'filing_history',
    'audit_trail',
    'risk_assessments',
    'training_records',
    'policy_documents',
    'annual_statistics',
  ],
  [PACK_TYPES.INCIDENT_RESPONSE]: [
    'screening_results',
    'filing_history',
    'audit_trail',
    'risk_assessments',
    'incident_narrative',
    'remediation_steps',
  ],
  [PACK_TYPES.CUSTOMER_EXIT]: [
    'screening_results',
    'filing_history',
    'audit_trail',
    'risk_assessments',
    'cdd_records',
    'transaction_history',
    'exit_rationale',
  ],
});

/** Human-readable labels for each pack type. */
const PACK_LABELS = Object.freeze({
  [PACK_TYPES.SUPERVISORY_INSPECTION]: 'Supervisory Inspection Evidence Pack',
  [PACK_TYPES.ANNUAL_REVIEW]:          'Annual Review Evidence Pack',
  [PACK_TYPES.INCIDENT_RESPONSE]:      'Incident Response Evidence Pack',
  [PACK_TYPES.CUSTOMER_EXIT]:          'Customer Exit Evidence Pack',
});

/* ------------------------------------------------------------------ */
/*  Utility functions                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute SHA-256 hex digest of the given content string.
 *
 * @param {string} content
 * @returns {string} Lowercase hex digest
 */
function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Format a Date object as YYYY-MM-DD.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDate(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Format a Date object as YYYY-MM-DD HH:mm UTC.
 *
 * @param {Date} d
 * @returns {string}
 */
function fmtDateTime(d) {
  const iso = d.toISOString();
  return iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC';
}

/**
 * Produce a separator line of fixed width.
 *
 * @param {string} [ch]
 * @param {number} [len]
 * @returns {string}
 */
function separator(ch = '=', len = 72) {
  return ch.repeat(len);
}

/* ------------------------------------------------------------------ */
/*  EvidencePack                                                       */
/* ------------------------------------------------------------------ */

export class EvidencePack {
  /**
   * @param {object} config
   * @param {string} config.packType      - One of PACK_TYPES values
   * @param {string} config.entityName    - Legal name of the reporting entity
   * @param {string} config.mlroName      - MLRO full name
   * @param {string} [config.packPurpose] - Free-text purpose description
   * @param {string} [config.periodFrom]  - Start date of the review period (YYYY-MM-DD)
   * @param {string} [config.periodTo]    - End date of the review period (YYYY-MM-DD)
   * @param {string} [config.entityId]    - Entity identifier (for customer exit packs)
   * @param {string} [config.incidentId]  - Incident reference (for incident packs)
   */
  constructor(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('config object is required');
    }
    if (!config.packType || !Object.values(PACK_TYPES).includes(config.packType)) {
      throw new Error(
        `config.packType must be one of: ${Object.values(PACK_TYPES).join(', ')}`
      );
    }
    if (!config.entityName || typeof config.entityName !== 'string') {
      throw new Error('config.entityName is required and must be a string');
    }
    if (!config.mlroName || typeof config.mlroName !== 'string') {
      throw new Error('config.mlroName is required and must be a string');
    }

    /** @type {string} */
    this.id = `EVPACK-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

    /** @type {string} */
    this.packType = config.packType;

    /** @type {string} */
    this.entityName = config.entityName;

    /** @type {string} */
    this.mlroName = config.mlroName;

    /** @type {string} */
    this.packPurpose = config.packPurpose || PACK_LABELS[config.packType];

    /** @type {string|null} */
    this.periodFrom = config.periodFrom || null;

    /** @type {string|null} */
    this.periodTo = config.periodTo || null;

    /** @type {string|null} */
    this.entityId = config.entityId || null;

    /** @type {string|null} */
    this.incidentId = config.incidentId || null;

    /** @type {string} */
    this.generatedAt = new Date().toISOString();

    /**
     * Sections keyed by section name. Each section holds a title,
     * content string, and optional items array for structured data.
     * @type {Map<string, object>}
     */
    this.sections = new Map();

    /**
     * Chronological event timeline entries.
     * @type {Array<{date: string, event: string, actor: string, detail: string}>}
     */
    this.timeline = [];

    /**
     * Summary statistics counters.
     * @type {{screeningsRun: number, alertsRaised: number, filingsSubmitted: number, decisionsMade: number}}
     */
    this.statistics = {
      screeningsRun: 0,
      alertsRaised: 0,
      filingsSubmitted: 0,
      decisionsMade: 0,
    };
  }

  /* ---- Section management ------------------------------------------ */

  /**
   * Add or replace a section in the evidence pack.
   *
   * @param {string} sectionName - Machine name (must be lowercase_snake)
   * @param {object} data
   * @param {string} data.title   - Human-readable section heading
   * @param {string} data.content - Plain-text body
   * @param {Array<object>} [data.items] - Structured evidence items
   * @returns {void}
   */
  addSection(sectionName, data) {
    if (!sectionName || typeof sectionName !== 'string') {
      throw new Error('sectionName is required and must be a string');
    }
    if (!data || typeof data !== 'object') {
      throw new Error('data object is required');
    }
    if (!data.title || typeof data.title !== 'string') {
      throw new Error('data.title is required and must be a string');
    }
    if (typeof data.content !== 'string') {
      throw new Error('data.content must be a string');
    }

    this.sections.set(sectionName, {
      title: data.title,
      content: data.content,
      items: Array.isArray(data.items) ? [...data.items] : [],
      addedAt: new Date().toISOString(),
    });
  }

  /**
   * Remove a section by name.
   *
   * @param {string} sectionName
   * @returns {boolean} True if the section existed and was removed
   */
  removeSection(sectionName) {
    return this.sections.delete(sectionName);
  }

  /**
   * Check whether all required sections for this pack type are present.
   *
   * @returns {{complete: boolean, present: string[], missing: string[]}}
   */
  checkCompleteness() {
    const required = REQUIRED_SECTIONS[this.packType] || [];
    const present = [];
    const missing = [];

    for (const name of required) {
      if (this.sections.has(name)) {
        present.push(name);
      } else {
        missing.push(name);
      }
    }

    return {
      complete: missing.length === 0,
      present,
      missing,
    };
  }

  /* ---- Timeline ---------------------------------------------------- */

  /**
   * Add a chronological event to the timeline.
   *
   * @param {object} entry
   * @param {string} entry.date   - ISO date or datetime string
   * @param {string} entry.event  - Short event description
   * @param {string} [entry.actor]  - Person or system that triggered the event
   * @param {string} [entry.detail] - Extended narrative
   * @returns {void}
   */
  addTimelineEvent(entry) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('entry object is required');
    }
    if (!entry.date || typeof entry.date !== 'string') {
      throw new Error('entry.date is required and must be a string');
    }
    if (!entry.event || typeof entry.event !== 'string') {
      throw new Error('entry.event is required and must be a string');
    }

    this.timeline.push({
      date: entry.date,
      event: entry.event,
      actor: entry.actor || 'System',
      detail: entry.detail || '',
    });

    // Keep timeline sorted chronologically
    this.timeline.sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---- Statistics -------------------------------------------------- */

  /**
   * Update summary statistics by merging the given counts.
   *
   * @param {object} counts
   * @param {number} [counts.screeningsRun]
   * @param {number} [counts.alertsRaised]
   * @param {number} [counts.filingsSubmitted]
   * @param {number} [counts.decisionsMade]
   * @returns {void}
   */
  updateStatistics(counts) {
    if (!counts || typeof counts !== 'object') {
      throw new Error('counts object is required');
    }

    if (typeof counts.screeningsRun === 'number') {
      this.statistics.screeningsRun += counts.screeningsRun;
    }
    if (typeof counts.alertsRaised === 'number') {
      this.statistics.alertsRaised += counts.alertsRaised;
    }
    if (typeof counts.filingsSubmitted === 'number') {
      this.statistics.filingsSubmitted += counts.filingsSubmitted;
    }
    if (typeof counts.decisionsMade === 'number') {
      this.statistics.decisionsMade += counts.decisionsMade;
    }
  }

  /* ---- File manifest ----------------------------------------------- */

  /**
   * Build a file manifest with SHA-256 hashes for each section.
   * Returns an array of manifest entries. If actual file paths are
   * provided (for directory export mode), those paths are used;
   * otherwise synthetic filenames are generated from section names.
   *
   * @param {Map<string, string>} [fileContents] - Map of filename to content
   * @returns {Array<{filename: string, sha256: string, sizeBytes: number}>}
   */
  buildManifest(fileContents) {
    const manifest = [];

    if (fileContents instanceof Map) {
      for (const [filename, content] of fileContents) {
        manifest.push({
          filename,
          sha256: sha256(content),
          sizeBytes: Buffer.byteLength(content, 'utf8'),
        });
      }
    } else {
      // Build from sections
      for (const [name, section] of this.sections) {
        const content = section.content;
        manifest.push({
          filename: `${name}.txt`,
          sha256: sha256(content),
          sizeBytes: Buffer.byteLength(content, 'utf8'),
        });
      }
    }

    return manifest;
  }

  /* ---- Rendering --------------------------------------------------- */

  /**
   * Generate the table of contents block.
   *
   * @returns {string}
   */
  renderTableOfContents() {
    const lines = [];
    lines.push('TABLE OF CONTENTS');
    lines.push('');

    let idx = 1;

    // Metadata section always present
    lines.push(`  ${idx}. Pack Metadata`);
    idx++;

    // Summary statistics
    lines.push(`  ${idx}. Summary Statistics`);
    idx++;

    // Chronological timeline (if events exist)
    if (this.timeline.length > 0) {
      lines.push(`  ${idx}. Chronological Event Timeline`);
      idx++;
    }

    // Evidence sections
    for (const [, section] of this.sections) {
      lines.push(`  ${idx}. ${section.title}`);
      idx++;
    }

    // Completeness check
    lines.push(`  ${idx}. Pack Completeness Assessment`);
    idx++;

    // File manifest
    lines.push(`  ${idx}. File Manifest (Integrity Verification)`);

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Render the pack metadata block.
   *
   * @returns {string}
   */
  renderMetadata() {
    const lines = [];
    lines.push('PACK METADATA');
    lines.push('');
    lines.push(`Pack ID:          ${this.id}`);
    lines.push(`Pack Type:        ${PACK_LABELS[this.packType]}`);
    lines.push(`Purpose:          ${this.packPurpose}`);
    lines.push(`Entity:           ${this.entityName}`);
    lines.push(`MLRO:             ${this.mlroName}`);
    lines.push(`Generated:        ${fmtDateTime(new Date(this.generatedAt))}`);

    if (this.periodFrom !== null && this.periodTo !== null) {
      lines.push(`Review Period:    ${this.periodFrom} to ${this.periodTo}`);
    } else if (this.periodFrom !== null) {
      lines.push(`Review Period:    From ${this.periodFrom}`);
    }

    if (this.entityId !== null) {
      lines.push(`Entity ID:        ${this.entityId}`);
    }
    if (this.incidentId !== null) {
      lines.push(`Incident Ref:     ${this.incidentId}`);
    }

    lines.push(`Legal Framework:  Federal Decree-Law No. 10 of 2025`);
    lines.push(`Supervisor:       Ministry of Economy`);
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Render the summary statistics block.
   *
   * @returns {string}
   */
  renderStatistics() {
    const lines = [];
    lines.push('SUMMARY STATISTICS');
    lines.push('');
    lines.push(`Screenings run:       ${this.statistics.screeningsRun}`);
    lines.push(`Alerts raised:        ${this.statistics.alertsRaised}`);
    lines.push(`Filings submitted:    ${this.statistics.filingsSubmitted}`);
    lines.push(`Decisions made:       ${this.statistics.decisionsMade}`);
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Render the chronological event timeline.
   *
   * @returns {string}
   */
  renderTimeline() {
    if (this.timeline.length === 0) {
      return '';
    }

    const lines = [];
    lines.push('CHRONOLOGICAL EVENT TIMELINE');
    lines.push('');

    for (const entry of this.timeline) {
      const datePart = entry.date.length > 10
        ? entry.date.slice(0, 10) + ' ' + entry.date.slice(11, 16)
        : entry.date;
      lines.push(`[${datePart}]  ${entry.event}`);
      lines.push(`  Actor: ${entry.actor}`);
      if (entry.detail) {
        lines.push(`  Detail: ${entry.detail}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Render all evidence sections in insertion order.
   *
   * @returns {string}
   */
  renderSections() {
    const blocks = [];

    for (const [, section] of this.sections) {
      const lines = [];
      lines.push(section.title.toUpperCase());
      lines.push('');
      lines.push(section.content);

      if (section.items.length > 0) {
        lines.push('');
        lines.push('Evidence Items:');
        lines.push('');
        for (let i = 0; i < section.items.length; i++) {
          const item = section.items[i];
          lines.push(`  ${i + 1}. ${item.description || item.title || JSON.stringify(item)}`);
          if (item.reference) {
            lines.push(`     Reference: ${item.reference}`);
          }
          if (item.date) {
            lines.push(`     Date: ${item.date}`);
          }
        }
      }

      lines.push('');
      blocks.push(lines.join('\n'));
    }

    return blocks.join(separator('-') + '\n\n');
  }

  /**
   * Render the completeness assessment block.
   *
   * @returns {string}
   */
  renderCompleteness() {
    const check = this.checkCompleteness();
    const lines = [];
    lines.push('PACK COMPLETENESS ASSESSMENT');
    lines.push('');
    lines.push(`Status: ${check.complete ? 'COMPLETE' : 'INCOMPLETE'}`);
    lines.push('');

    if (check.present.length > 0) {
      lines.push('Sections present:');
      for (const name of check.present) {
        lines.push(`  [x] ${name}`);
      }
    }

    if (check.missing.length > 0) {
      lines.push('');
      lines.push('Sections missing:');
      for (const name of check.missing) {
        lines.push(`  [ ] ${name}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Render the file manifest block.
   *
   * @param {Array<{filename: string, sha256: string, sizeBytes: number}>} manifest
   * @returns {string}
   */
  renderManifest(manifest) {
    const lines = [];
    lines.push('FILE MANIFEST (INTEGRITY VERIFICATION)');
    lines.push('');

    if (manifest.length === 0) {
      lines.push('No files in manifest.');
    } else {
      for (const entry of manifest) {
        lines.push(`File:     ${entry.filename}`);
        lines.push(`SHA-256:  ${entry.sha256}`);
        lines.push(`Size:     ${entry.sizeBytes} bytes`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /* ---- Export ------------------------------------------------------- */

  /**
   * Export the evidence pack as a single concatenated plain-text file.
   *
   * @returns {string} The full pack content
   */
  exportAsText() {
    const manifest = this.buildManifest();
    const parts = [];

    // Header
    parts.push(separator('='));
    parts.push(PACK_LABELS[this.packType].toUpperCase());
    parts.push(separator('='));
    parts.push('');

    // Table of contents
    parts.push(this.renderTableOfContents());
    parts.push(separator('-'));
    parts.push('');

    // Metadata
    parts.push(this.renderMetadata());
    parts.push(separator('-'));
    parts.push('');

    // Statistics
    parts.push(this.renderStatistics());
    parts.push(separator('-'));
    parts.push('');

    // Timeline
    const timelineBlock = this.renderTimeline();
    if (timelineBlock) {
      parts.push(timelineBlock);
      parts.push(separator('-'));
      parts.push('');
    }

    // Sections
    if (this.sections.size > 0) {
      parts.push(this.renderSections());
      parts.push(separator('-'));
      parts.push('');
    }

    // Completeness
    parts.push(this.renderCompleteness());
    parts.push(separator('-'));
    parts.push('');

    // Manifest
    parts.push(this.renderManifest(manifest));
    parts.push(separator('='));
    parts.push('');

    // MLRO sign-off
    parts.push(`For review by the MLRO, ${this.mlroName}.`);
    parts.push('');

    return parts.join('\n');
  }

  /**
   * Export the evidence pack as a directory of individual text files.
   * Creates the directory if it does not exist.
   *
   * @param {string} outputDir - Absolute path to the output directory
   * @returns {Promise<{manifestPath: string, files: string[]}>}
   */
  async exportAsDirectory(outputDir) {
    if (!outputDir || typeof outputDir !== 'string') {
      throw new Error('outputDir is required and must be a string');
    }

    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    const fileContents = new Map();
    const writtenFiles = [];

    // Metadata file
    const metaContent = this.renderMetadata();
    fileContents.set('00-metadata.txt', metaContent);

    // Statistics file
    const statsContent = this.renderStatistics();
    fileContents.set('01-statistics.txt', statsContent);

    // Timeline file
    const timelineContent = this.renderTimeline();
    if (timelineContent) {
      fileContents.set('02-timeline.txt', timelineContent);
    }

    // Section files
    let idx = 10;
    for (const [name, section] of this.sections) {
      const sectionLines = [];
      sectionLines.push(section.title.toUpperCase());
      sectionLines.push('');
      sectionLines.push(section.content);

      if (section.items.length > 0) {
        sectionLines.push('');
        sectionLines.push('Evidence Items:');
        sectionLines.push('');
        for (let i = 0; i < section.items.length; i++) {
          const item = section.items[i];
          sectionLines.push(`  ${i + 1}. ${item.description || item.title || JSON.stringify(item)}`);
          if (item.reference) {
            sectionLines.push(`     Reference: ${item.reference}`);
          }
          if (item.date) {
            sectionLines.push(`     Date: ${item.date}`);
          }
        }
      }

      sectionLines.push('');
      sectionLines.push(`For review by the MLRO, ${this.mlroName}.`);
      sectionLines.push('');

      const filename = `${String(idx).padStart(2, '0')}-${name}.txt`;
      fileContents.set(filename, sectionLines.join('\n'));
      idx++;
    }

    // Completeness file
    const completenessContent = this.renderCompleteness();
    fileContents.set('90-completeness.txt', completenessContent);

    // Table of contents
    const tocContent = this.renderTableOfContents();
    fileContents.set('00-table-of-contents.txt', tocContent);

    // Build manifest from actual file contents
    const manifest = this.buildManifest(fileContents);
    const manifestContent = this.renderManifest(manifest);
    fileContents.set('99-manifest.txt', manifestContent);

    // Write all files
    for (const [filename, content] of fileContents) {
      const filePath = join(outputDir, filename);
      await writeFile(filePath, content, 'utf8');
      writtenFiles.push(filePath);
    }

    return {
      manifestPath: join(outputDir, '99-manifest.txt'),
      files: writtenFiles,
    };
  }

  /**
   * Write the single concatenated text export to a file.
   *
   * @param {string} outputPath - Absolute path to the output file
   * @returns {Promise<{path: string, sha256: string, sizeBytes: number}>}
   */
  async writeTextFile(outputPath) {
    if (!outputPath || typeof outputPath !== 'string') {
      throw new Error('outputPath is required and must be a string');
    }

    const dir = dirname(outputPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    const content = this.exportAsText();
    await writeFile(outputPath, content, 'utf8');

    return {
      path: outputPath,
      sha256: sha256(content),
      sizeBytes: Buffer.byteLength(content, 'utf8'),
    };
  }

  /* ---- Serialization ----------------------------------------------- */

  /**
   * Serialize the pack state to a plain object for JSON persistence.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      id: this.id,
      packType: this.packType,
      entityName: this.entityName,
      mlroName: this.mlroName,
      packPurpose: this.packPurpose,
      periodFrom: this.periodFrom,
      periodTo: this.periodTo,
      entityId: this.entityId,
      incidentId: this.incidentId,
      generatedAt: this.generatedAt,
      statistics: { ...this.statistics },
      timeline: [...this.timeline],
      sections: Object.fromEntries(
        [...this.sections].map(([k, v]) => [k, { ...v, items: [...v.items] }])
      ),
    };
  }

  /**
   * Reconstruct an EvidencePack from a serialized plain object.
   *
   * @param {object} obj - Output of toJSON()
   * @returns {EvidencePack}
   */
  static fromJSON(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('obj must be a non-null object');
    }

    const pack = new EvidencePack({
      packType: obj.packType,
      entityName: obj.entityName,
      mlroName: obj.mlroName,
      packPurpose: obj.packPurpose,
      periodFrom: obj.periodFrom,
      periodTo: obj.periodTo,
      entityId: obj.entityId,
      incidentId: obj.incidentId,
    });

    pack.id = obj.id;
    pack.generatedAt = obj.generatedAt;

    if (obj.statistics && typeof obj.statistics === 'object') {
      pack.statistics = { ...pack.statistics, ...obj.statistics };
    }

    if (Array.isArray(obj.timeline)) {
      for (const entry of obj.timeline) {
        pack.timeline.push({ ...entry });
      }
    }

    if (obj.sections && typeof obj.sections === 'object') {
      for (const [name, section] of Object.entries(obj.sections)) {
        pack.sections.set(name, {
          title: section.title,
          content: section.content,
          items: Array.isArray(section.items) ? [...section.items] : [],
          addedAt: section.addedAt || new Date().toISOString(),
        });
      }
    }

    return pack;
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience factory functions                                      */
/* ------------------------------------------------------------------ */

/**
 * Create a supervisory inspection evidence pack pre-populated with
 * empty required sections.
 *
 * @param {object} config
 * @param {string} config.entityName
 * @param {string} config.mlroName
 * @param {string} [config.periodFrom]
 * @param {string} [config.periodTo]
 * @returns {EvidencePack}
 */
export function createInspectionPack(config) {
  const pack = new EvidencePack({
    ...config,
    packType: PACK_TYPES.SUPERVISORY_INSPECTION,
    packPurpose: 'Evidence bundle prepared for supervisory inspection by the Ministry of Economy.',
  });

  // Pre-populate required sections with placeholder content
  const sectionTitles = {
    screening_results:       'Screening Results',
    filing_history:          'Filing History',
    audit_trail:             'Audit Trail Excerpts',
    risk_assessments:        'Risk Assessments',
    training_records:        'Training Records',
    policy_documents:        'Policy Documents',
    cdd_register_summary:    'CDD Register Summary',
    sanctions_screening_log: 'Sanctions Screening Log',
  };

  for (const [name, title] of Object.entries(sectionTitles)) {
    pack.addSection(name, {
      title,
      content: '[Awaiting evidence compilation]',
    });
  }

  return pack;
}

/**
 * Create an annual review evidence pack.
 *
 * @param {object} config
 * @param {string} config.entityName
 * @param {string} config.mlroName
 * @param {string} config.periodFrom
 * @param {string} config.periodTo
 * @returns {EvidencePack}
 */
export function createAnnualReviewPack(config) {
  const pack = new EvidencePack({
    ...config,
    packType: PACK_TYPES.ANNUAL_REVIEW,
    packPurpose: 'Annual compliance programme review evidence compilation.',
  });

  const sectionTitles = {
    screening_results:  'Screening Results',
    filing_history:     'Filing History',
    audit_trail:        'Audit Trail Excerpts',
    risk_assessments:   'Risk Assessments',
    training_records:   'Training Records',
    policy_documents:   'Policy Documents',
    annual_statistics:  'Annual Statistics',
  };

  for (const [name, title] of Object.entries(sectionTitles)) {
    pack.addSection(name, {
      title,
      content: '[Awaiting evidence compilation]',
    });
  }

  return pack;
}

/**
 * Create an incident response evidence pack.
 *
 * @param {object} config
 * @param {string} config.entityName
 * @param {string} config.mlroName
 * @param {string} config.incidentId
 * @returns {EvidencePack}
 */
export function createIncidentPack(config) {
  const pack = new EvidencePack({
    ...config,
    packType: PACK_TYPES.INCIDENT_RESPONSE,
    packPurpose: `Evidence bundle for incident ${config.incidentId || 'unspecified'}.`,
  });

  const sectionTitles = {
    screening_results:  'Screening Results',
    filing_history:     'Filing History',
    audit_trail:        'Audit Trail Excerpts',
    risk_assessments:   'Risk Assessments',
    incident_narrative: 'Incident Narrative',
    remediation_steps:  'Remediation Steps',
  };

  for (const [name, title] of Object.entries(sectionTitles)) {
    pack.addSection(name, {
      title,
      content: '[Awaiting evidence compilation]',
    });
  }

  return pack;
}

/**
 * Create a customer exit evidence pack.
 *
 * @param {object} config
 * @param {string} config.entityName
 * @param {string} config.mlroName
 * @param {string} config.entityId - Customer or entity identifier
 * @returns {EvidencePack}
 */
export function createCustomerExitPack(config) {
  const pack = new EvidencePack({
    ...config,
    packType: PACK_TYPES.CUSTOMER_EXIT,
    packPurpose: `Customer exit evidence pack for entity ${config.entityId || 'unspecified'}.`,
  });

  const sectionTitles = {
    screening_results:   'Screening Results',
    filing_history:      'Filing History',
    audit_trail:         'Audit Trail Excerpts',
    risk_assessments:    'Risk Assessments',
    cdd_records:         'Customer Due Diligence Records',
    transaction_history: 'Transaction History',
    exit_rationale:      'Exit Rationale',
  };

  for (const [name, title] of Object.entries(sectionTitles)) {
    pack.addSection(name, {
      title,
      content: '[Awaiting evidence compilation]',
    });
  }

  return pack;
}
