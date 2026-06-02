/**
 * @name Missing enforce() call in API route handler
 * @description Every exported GET/POST/PUT/DELETE/PATCH function in
 *              web/app/api/ must call enforce(req). Routes that skip
 *              enforce() accept unauthenticated traffic — a fail-open
 *              violation of Hawkeye's architecture invariant #1.
 * @kind problem
 * @problem.severity error
 * @id hawkeye/missing-enforce-call
 * @tags security compliance
 */

import javascript

from Function f, File file
where
  // Only scan API route files
  file.getRelativePath().matches("web/app/api/%/route.ts") and
  f.getFile() = file and
  // Exported named functions that are HTTP handlers
  exists(ExportDeclaration ed |
    ed.getFile() = file and
    ed.getAnExportedDecl().getNode() = f
  ) and
  f.getName().regexpMatch("(GET|POST|PUT|DELETE|PATCH)") and
  // Must contain a call to enforce()
  not exists(CallExpr c |
    c.getEnclosingFunction() = f and
    c.getCalleeName() = "enforce"
  )
select f, "API route handler '" + f.getName() + "' in " + file.getRelativePath() +
  " does not call enforce(req). Every compliance route must be fail-closed."
