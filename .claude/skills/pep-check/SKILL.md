# /pep-check — PEP Approval Status Check

Check if a PEP relationship has valid senior management approval.

## Usage
`/pep-check <entity_name>`

## Procedure

1. Import `PepApprovalWorkflow` from `screening/lib/pep-approval.mjs`
2. Initialize with register path `.screening/pep-approval-register.json`
3. Call `isApproved(entityId)` to check current approval status
4. If approved: show approver, role, approval date, expiry date
5. If not approved: show reason (expired, rejected, no record, pending)
6. Call `checkExpiringApprovals()` to show any approvals expiring within 30 days
7. If no PEP record exists, advise creating one via the workflow
8. Reference: Cabinet Resolution 134/2025 Art.14 requires senior management approval for all PEP relationships
9. Record observation via `claude-mem/index.mjs` with category `compliance_decision`

## Output Format
- Entity name and PEP category
- Approval status: APPROVED / EXPIRED / PENDING / REJECTED / NO RECORD
- Approval details (approver, date, expiry)
- SOW/SOF verification status
- Required actions if not approved
- End with "For review by the MLRO."
