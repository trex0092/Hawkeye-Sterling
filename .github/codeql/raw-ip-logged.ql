/**
 * @name Raw IP address passed to logging function
 * @description Raw IP addresses must never appear in logs or audit entries.
 *              Always HMAC-hash with anonIpKey() first. Logging raw IPs
 *              violates GDPR/PDPL and invariant #10.
 * @kind problem
 * @problem.severity warning
 * @id hawkeye/raw-ip-logged
 * @tags security privacy compliance
 */

import javascript
import semmle.javascript.dataflow.DataFlow

/**
 * A call that reads a raw IP-bearing header.
 */
class IpHeaderRead extends DataFlow::CallNode {
  IpHeaderRead() {
    this.getMethodName() = "get" and
    this.getArgument(0).getStringValue().regexpMatch("(?i)(cf-connecting-ip|x-real-ip|x-forwarded-for)")
  }
}

/**
 * A call to a logging function.
 */
class LogCall extends DataFlow::CallNode {
  LogCall() {
    this.getCalleeName().regexpMatch("log|warn|error|info|debug") and
    (
      this.getReceiver().getStringValue() = "console" or
      not exists(this.getReceiver())
    )
  }
}

from IpHeaderRead ipRead, LogCall logCall, DataFlow::Node src, DataFlow::Node sink
where
  src = ipRead and
  sink = logCall.getAnArgument() and
  DataFlow::localFlowStep*(src, sink)
select logCall, "Raw IP address from header '" + ipRead.getArgument(0).getStringValue() +
  "' flows into a log call without HMAC anonymization. Use anonIpKey() to hash first."
