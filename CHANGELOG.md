# Changelog

All notable changes to Hawkeye-Sterling are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-09

### Added
- REST API server with full screening endpoint coverage
- API key authentication with role-based access control (RBAC)
- Multi-tenancy support with isolated data directories
- Docker packaging (Dockerfile + docker-compose.yml)
- Environment variable template (.env.example)
- Sanctions list staleness circuit-breaker (configurable max age)
- Scheduled audit chain verification with alerting
- MLRO approval state machine for filing workflows
- False-negative monitoring with known-bad-actor test set
- Quantitative risk scoring algorithm (likelihood x impact matrix)
- CJK transliteration support (Pinyin for Chinese characters)
- Comprehensive test suite (normalize, fuzzy, score, audit, staleness, auth, API)
- Admin dashboard (admin.html)
- OpenAPI 3.0 specification
- Commercial license (BSL 1.1)
- CHANGELOG tracking

### Fixed
- Missing await on async recordMemory() calls in MCP server (crash on rejection)
- Empty array access crash in transaction pattern analyzer
- Array mutation bug in deduplicateAlerts()
- Resource leaks in MCP memory search handler
- Swallowed errors across 10+ catch blocks now log to stderr

### Changed
- All package versions bumped to 2.0.0
- handleThresholdCheck and handleEntityRisk now async
- Screening engine rejects screening when lists exceed max age

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Zero-dependency screening engine with multi-source support
- Hash-chained audit trail
- MCP server integration
- 51 automation scripts (daily/weekly/monthly/quarterly/annual)
- Persistent memory system (claude-mem)
- 53 GitHub Actions workflows
