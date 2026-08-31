# Design and implementation evidence

## Product references

Stable private Lazyweb set:
https://www.lazyweb.com/agentic-search/fa8814a4-2de6-41ee-938f-2e291169f682

- CarbonChain: explicit consent is a separate checkbox adjacent to the submit
  action. Content Factory follows the structure but uses its native auth shell,
  CF tokens and an unchecked optional control.
- iManage: newsletter collection needs only the address. Content Factory reuses
  the registration address and collects no name or extra profile fields.
- The Pattern: unsubscribe ends with an immediate neutral confirmation rather
  than a retention survey. Listmonk's UUID page provides the same one-action
  outcome without exposing an address lookup.

## Official Listmonk references

- Stable release v6.2.0: https://github.com/knadh/listmonk/releases/tag/v6.2.0
- Tagged Compose: https://github.com/knadh/listmonk/blob/v6.2.0/docker-compose.yml
- Configuration: https://listmonk.app/docs/configuration/
- Subscriber API: https://listmonk.app/docs/apis/subscribers/
- Concepts / double opt-in: https://github.com/knadh/listmonk/blob/v6.2.0/docs/docs/content/concepts.md
- Template variables: https://github.com/knadh/listmonk/blob/v6.2.0/docs/docs/content/templating.md
- Public route definitions: https://github.com/knadh/listmonk/blob/v6.2.0/cmd/handlers.go
- Roles and permissions: https://listmonk.app/docs/roles-and-permissions/

The repository description says an API key selects Listmonk, so authenticated
`POST /api/subscribers` remains the primary create path. Official v6.2.0 also
provides a public subscription endpoint that safely re-enters an existing or
unsubscribed address into a public double-opt-in list. A 409 is therefore not
treated as success: the internal provider posts to that endpoint with the target
list UUID. Nginx never exposes the API route and no API token accompanies the
recovery request.

Official documentation publishes no minimum memory limit. The local Compose cap
is therefore a reversible host-safety choice, not a vendor guarantee, and must
be observed under a real campaign before deployment.

graph-reviewed: blocked - graphify-out/GRAPH_REPORT.md and graph.json are absent
from this branch; focused Graphify query failed before direct source mapping.
