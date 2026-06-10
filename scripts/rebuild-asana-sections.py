#!/usr/bin/env python3
"""DEPRECATED — superseded by the 2026-06-10 Asana workspace rebuild.

The legacy 17-board taxonomy this script managed was retired when the
operator deleted the old project set. The canonical 90-board topology
(00 · Inbox + 88 module boards + HS · Modules digest) is defined in
web/lib/server/asana-workspace-map.ts and is built / maintained by the
admin-gated endpoint:

    POST /api/asana-bootstrap-workspace   {"mode": "create"}        — build boards
    POST /api/asana-bootstrap-workspace   {"mode": "digest-tasks"}  — digest tasks
    POST /api/asana-bootstrap-workspace   {"mode": "export"}        — GID artifact
    POST /api/asana-rebuild-sections                                 — enforce section order

Run those against the deployed site with an admin API key instead of
this script.
"""

import sys

sys.stderr.write(__doc__ + "\n")
sys.exit(2)
