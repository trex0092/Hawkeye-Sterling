/**
 * Staff AML/CFT Training Compliance Tracker.
 *
 * Tracks mandatory training for all staff per UAE FDL No.10/2025 Art.21:
 *   - Initial AML/CFT training within 30 days of hire
 *   - Annual refresher training
 *   - Sanctions/TFS update training (on regulatory change)
 *   - Typology workshops (quarterly recommended)
 *   - MLRO-specialized training
 *   - Regulatory change briefings
 *
 * Generates training compliance reports for board, supervisor, and auditors.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const TRAINING_TYPES = {
  initial_aml: { name: 'Initial AML/CFT Induction', dueDaysAfterHire: 30, renewalMonths: null, mandatory: true, regulation: 'FDL No.10/2025 Art.21(1)' },
  annual_refresher: { name: 'Annual AML/CFT Refresher', dueDaysAfterHire: 365, renewalMonths: 12, mandatory: true, regulation: 'FDL No.10/2025 Art.21(2)' },
  sanctions_update: { name: 'Sanctions & TFS Update', dueDaysAfterHire: 60, renewalMonths: 6, mandatory: true, regulation: 'FDL No.10/2025 Art.21(3)' },
  typology_workshop: { name: 'Typology Workshop', dueDaysAfterHire: 90, renewalMonths: 3, mandatory: false, regulation: 'FATF Rec.18' },
  mlro_specialized: { name: 'MLRO Specialized Training', dueDaysAfterHire: 30, renewalMonths: 12, mandatory: true, regulation: 'FDL No.10/2025 Art.21(4)', roles: ['mlro'] },
  regulatory_change: { name: 'Regulatory Change Briefing', dueDaysAfterHire: null, renewalMonths: null, mandatory: true, regulation: 'Cabinet Res 134/2025 Art.18' },
  precious_metals: { name: 'DPMS Sector-Specific Training', dueDaysAfterHire: 60, renewalMonths: 12, mandatory: true, regulation: 'MoE DPMS Supervisory Guidance' },
  responsible_sourcing: { name: 'OECD/LBMA Responsible Sourcing', dueDaysAfterHire: 90, renewalMonths: 12, mandatory: true, regulation: 'OECD DDG Step 1, LBMA RGG v9' },
};

const ROLES = ['mlro', 'compliance_officer', 'analyst', 'operations', 'management', 'board_member'];

export class TrainingTracker {
  constructor(registerPath) {
    this.registerPath = registerPath;
    this.staff = new Map();
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    if (existsSync(this.registerPath)) {
      try {
        const data = JSON.parse(await readFile(this.registerPath, 'utf8'));
        for (const s of data.staff || []) this.staff.set(s.id, s);
      } catch (err) { console.warn(`[training] Load failed: ${err.message}`); }
    }
    this._loaded = true;
  }

  async save() {
    const dir = dirname(this.registerPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(this.registerPath, JSON.stringify({
      version: '2.0.0', updatedAt: new Date().toISOString(),
      staff: [...this.staff.values()],
    }, null, 2));
  }

  async addStaff(params) {
    await this.load();
    const id = params.id || `STAFF-${Date.now().toString(36)}`;
    const member = {
      id, name: params.name, role: params.role || 'operations',
      department: params.department || '', hireDate: params.hireDate,
      active: true, trainingRecords: [], addedAt: new Date().toISOString(),
    };
    this.staff.set(id, member);
    await this.save();
    return member;
  }

  async recordTraining(staffId, training) {
    await this.load();
    const member = this.staff.get(staffId);
    if (!member) throw new Error(`Staff not found: ${staffId}`);

    const record = {
      courseId: training.courseId || training.type,
      type: training.type,
      completedDate: training.completedDate || new Date().toISOString().split('T')[0],
      score: training.score || null,
      certificateId: training.certificateId || null,
      provider: training.provider || 'Internal',
      hours: training.hours || 0,
      expiryDate: null,
    };

    const typeInfo = TRAINING_TYPES[training.type];
    if (typeInfo?.renewalMonths) {
      const completed = new Date(record.completedDate);
      completed.setMonth(completed.getMonth() + typeInfo.renewalMonths);
      record.expiryDate = completed.toISOString().split('T')[0];
    }

    member.trainingRecords.push(record);
    await this.save();
    return record;
  }

  async checkCompliance(staffId) {
    await this.load();
    const member = this.staff.get(staffId);
    if (!member) throw new Error(`Staff not found: ${staffId}`);

    const now = new Date();
    const hireDate = new Date(member.hireDate);
    const results = [];

    for (const [typeId, typeInfo] of Object.entries(TRAINING_TYPES)) {
      if (typeInfo.roles && !typeInfo.roles.includes(member.role)) continue;
      if (!typeInfo.mandatory && !typeInfo.dueDaysAfterHire) continue;

      const records = member.trainingRecords.filter(r => r.type === typeId);
      const latest = records.sort((a, b) => b.completedDate.localeCompare(a.completedDate))[0];

      let status, dueDate;

      if (!latest) {
        if (typeInfo.dueDaysAfterHire) {
          dueDate = new Date(hireDate);
          dueDate.setDate(dueDate.getDate() + typeInfo.dueDaysAfterHire);
          status = now > dueDate ? 'overdue' : 'pending';
        } else {
          status = 'not_required';
          dueDate = null;
        }
      } else if (latest.expiryDate && now > new Date(latest.expiryDate)) {
        status = 'expired';
        dueDate = new Date(latest.expiryDate);
      } else if (latest.expiryDate) {
        const daysUntil = (new Date(latest.expiryDate) - now) / 86400000;
        status = daysUntil < 30 ? 'expiring_soon' : 'current';
        dueDate = new Date(latest.expiryDate);
      } else {
        status = 'current';
        dueDate = null;
      }

      results.push({
        type: typeId, name: typeInfo.name, mandatory: typeInfo.mandatory,
        regulation: typeInfo.regulation, status,
        dueDate: dueDate?.toISOString().split('T')[0] || null,
        lastCompleted: latest?.completedDate || null,
        lastScore: latest?.score || null,
      });
    }

    return { staffId, name: member.name, role: member.role, compliance: results,
      isFullyCompliant: results.filter(r => r.mandatory).every(r => r.status === 'current' || r.status === 'not_required'),
    };
  }

  async gapAnalysis() {
    await this.load();
    const gaps = [];
    for (const [id] of this.staff) {
      const compliance = await this.checkCompliance(id);
      const memberGaps = compliance.compliance.filter(c => c.status === 'overdue' || c.status === 'expired' || c.status === 'pending');
      if (memberGaps.length > 0) {
        gaps.push({ staffId: id, name: compliance.name, role: compliance.role, gaps: memberGaps });
      }
    }
    return gaps.sort((a, b) => b.gaps.length - a.gaps.length);
  }

  async trainingMatrix() {
    await this.load();
    const matrix = [];
    for (const [id] of this.staff) {
      const compliance = await this.checkCompliance(id);
      const row = { staffId: id, name: compliance.name, role: compliance.role };
      for (const c of compliance.compliance) { row[c.type] = c.status; }
      row.fullyCompliant = compliance.isFullyCompliant;
      matrix.push(row);
    }
    return matrix;
  }

  async statistics() {
    await this.load();
    const activeStaff = [...this.staff.values()].filter(s => s.active);
    let compliant = 0, nonCompliant = 0, totalHours = 0;

    for (const s of activeStaff) {
      const c = await this.checkCompliance(s.id);
      if (c.isFullyCompliant) compliant++; else nonCompliant++;
      totalHours += s.trainingRecords.reduce((sum, r) => sum + (r.hours || 0), 0);
    }

    const allScores = activeStaff.flatMap(s => s.trainingRecords.map(r => r.score).filter(Boolean));

    return {
      totalStaff: activeStaff.length, compliant, nonCompliant,
      complianceRate: activeStaff.length > 0 ? Math.round((compliant / activeStaff.length) * 100) : 100,
      totalTrainingHours: totalHours,
      averageScore: allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null,
      totalCertificates: activeStaff.reduce((sum, s) => sum + s.trainingRecords.filter(r => r.certificateId).length, 0),
    };
  }

  async generateReport() {
    await this.load();
    const stats = await this.statistics();
    const gaps = await this.gapAnalysis();
    const d = new Date().toISOString().split('T')[0];
    const lines = [];

    lines.push('STAFF AML/CFT TRAINING COMPLIANCE REPORT');
    lines.push(`Date: ${d}`);
    lines.push(`Total staff: ${stats.totalStaff}`);
    lines.push(`Compliant: ${stats.compliant} (${stats.complianceRate}%)`);
    lines.push(`Non-compliant: ${stats.nonCompliant}`);
    lines.push(`Total training hours: ${stats.totalTrainingHours}`);
    lines.push(`Average score: ${stats.averageScore || 'N/A'}`);
    lines.push('');

    if (gaps.length > 0) {
      lines.push('TRAINING GAPS (IMMEDIATE ACTION REQUIRED):');
      for (const g of gaps) {
        lines.push(`  ${g.name} (${g.role}):`);
        for (const gap of g.gaps) {
          lines.push(`    [${gap.status.toUpperCase()}] ${gap.name} — Due: ${gap.dueDate || 'ASAP'} (${gap.regulation})`);
        }
      }
      lines.push('');
    }

    lines.push('REGULATORY REFERENCE:');
    for (const [, t] of Object.entries(TRAINING_TYPES)) {
      lines.push(`  ${t.name}: ${t.regulation}${t.renewalMonths ? ` (renew every ${t.renewalMonths} months)` : ''}`);
    }
    lines.push('');
    lines.push('For review by the MLRO.');
    return lines.join('\n');
  }
}

export { TRAINING_TYPES, ROLES };
