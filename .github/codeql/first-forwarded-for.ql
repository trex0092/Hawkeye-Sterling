/**
 * @name Trusts first x-forwarded-for value
 * @description Using the first value of x-forwarded-for is a security
 *              vulnerability: clients can spoof it to bypass per-IP rate
 *              limiting. Always use the LAST value (proxy-appended). This
 *              violates invariant #11.
 * @kind problem
 * @problem.severity error
 * @id hawkeye/first-forwarded-for
 * @tags security compliance
 */

import javascript

from IndexExpr access, MethodCallExpr split
where
  // x.split(",")[0] pattern
  split = access.getBase() and
  split.getMethodName() = "split" and
  access.getIndex().(NumberLiteral).getIntValue() = 0 and
  // The split is on a value derived from x-forwarded-for header access
  exists(MethodCallExpr getHeader |
    getHeader.getMethodName() = "get" and
    getHeader.getAnArgument().(StringLiteral).getStringValue() = "x-forwarded-for" and
    split.getReceiver*() = getHeader
  )
select access, "Accesses split(',')[0] on x-forwarded-for — this is the client-supplied " +
  "value and can be spoofed. Use split(',')[split(',').length - 1] (the proxy-appended value)."
