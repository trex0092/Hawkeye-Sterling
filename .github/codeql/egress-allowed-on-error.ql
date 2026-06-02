/**
 * @name Egress gate returns allowed on error path
 * @description The egress tipping-off gate must be fail-closed: missing API key,
 *              LLM failure, or parse failure must return held_review — never
 *              'allowed'. A return of { allowed: true } or { verdict: 'allowed' }
 *              inside a catch block violates invariant #4.
 * @kind problem
 * @problem.severity error
 * @id hawkeye/egress-allowed-on-error
 * @tags security compliance
 */

import javascript

from ReturnStmt ret, CatchClause catch_
where
  // Return is inside a catch block
  ret.getEnclosingStmt*() = catch_.getBody() and
  // The returned object contains allowed: true
  exists(ObjectExpr obj, Property prop |
    obj = ret.getExpr() and
    prop = obj.getAProperty() and
    prop.getName() = "allowed" and
    prop.getInit().(BooleanLiteral).getBoolValue() = true
  ) and
  // Restrict to egress-related files
  ret.getFile().getRelativePath().regexpMatch(".*(egress|sar|goaml).*\\.ts")
select ret, "Egress gate returns { allowed: true } inside a catch block. " +
  "This violates the fail-closed invariant — error paths must return held_review."
