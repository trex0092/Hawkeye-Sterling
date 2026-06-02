/**
 * @name JWT decode/verify called outside jwt.ts
 * @description jwt.verify() and jwt.decode() must only be called from
 *              web/lib/server/jwt.ts. All other files must use the
 *              verifyJwt/signJwt wrappers which enforce algorithm pinning
 *              (HS256 only) and dual-secret rotation. Direct calls elsewhere
 *              bypass these controls and violate invariant #12.
 * @kind problem
 * @problem.severity error
 * @id hawkeye/jwt-decode-outside-jwt-ts
 * @tags security compliance
 */

import javascript

from CallExpr call, File file
where
  file = call.getFile() and
  // Not in the authorised file
  not file.getRelativePath().matches("%/jwt.ts") and
  // Calls jwt.verify or jwt.decode (common JWT library API)
  exists(DotExpr dot |
    dot = call.getCallee() and
    dot.getPropertyName().regexpMatch("verify|decode") and
    dot.getBase().(VarRef).getName() = "jwt"
  )
select call, "jwt." + call.getCallee().(DotExpr).getPropertyName() +
  "() called outside web/lib/server/jwt.ts in " + file.getRelativePath() +
  ". Use verifyJwt() / signJwt() from jwt.ts to ensure HS256 pinning and dual-secret rotation."
