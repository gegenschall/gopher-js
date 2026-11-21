---
'@gopher-js/server': minor
'@gopher-js/client': patch
---

Serve text, menus, searches, binary streams, and registered item types over TCP. Return the bound address from listen and signal handlers on cancellation or shutdown. The client resets cancelled connections so a server can distinguish cancellation from a half-closed request.
