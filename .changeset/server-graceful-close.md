---
'@gopher-js/server': minor
---

Allow active requests to finish during shutdown with close({ gracePeriodMs }). Calling close() without options still aborts active connections immediately.
