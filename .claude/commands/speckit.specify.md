# /speckit.specify

Write a formal specification for a Hawkeye Sterling feature or change.

## Usage

```
/speckit.specify <feature-description>
```

## Output Format

Produce a specification document covering:

1. **Regulatory Context** — Which FDL/FATF article(s) this addresses
2. **Threat Model** — What attack or compliance failure this prevents
3. **Functional Requirements** — What the feature must do (RFC 2119 MUST/SHOULD/MAY)
4. **Non-Functional Requirements** — Latency budget, audit trail entries, metric increments
5. **API Contract** — Endpoint, request shape, response shape, error codes
6. **Security Requirements** — Auth level, PII handling, egress gate applicability
7. **Audit Requirements** — Which audit chain events to emit
8. **Test Requirements** — Minimum test cases (happy path, fail-closed, adversarial input)
9. **Open Questions** — Decisions needing MLRO or CTO review

## Constitutional Constraints

Every specification must comply with `.specify/memory/constitution.md`.
Flag any conflict between the proposed feature and a constitutional article.

## Example

```
/speckit.specify Add real-time OFAC SDN delta feed subscription for CG-2
```
