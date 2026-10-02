# Correction to the frozen partition review

The earlier review's instruction to use an "installed supported retry API" was conditional and that API was not inspected by the child. Root subsequently checked the installed django_vtasks backend, queue selection/acknowledgement and admin: **no retry method exists**. Do not invent or call one.

The checked fallback is a root-owned ORM transaction that locks only the two exact own FAILED queue rows with `select_for_update(nowait=True)`, rechecks unchanged binary SHA-256, function, project, client event UUID, received UTC date and FAILED status, then changes only `status=QUEUED` and `worker_id=None`. Stored binary payloads stay immutable. No retry-all, PROCESSING reset, unrelated FAILED row, or collector restart is included.

This addendum records root's source-checked fallback; this stream did not execute any retry or queue mutation. The original reviewed artifacts remain frozen.
