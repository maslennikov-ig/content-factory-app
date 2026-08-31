# Спецификация Cloud-first SaaS

## Результат

Content Factory развивается как управляемый многопользовательский облачный
SaaS. AGPL-3.0, attribution и заметная ссылка `Source` сохраняются, но установка,
обновление и поддержка пользовательских инсталляций не являются продуктом и не
рекламируются в публичных поверхностях.

Публичный путь отделён от рабочего приложения: посетитель изучает фактически
доступные возможности, проходит безопасное синтетическое демо и лишь затем
начинает регистрацию. До отдельного решения не обещаются цена, бесплатный
тариф, trial или отсутствие карты.

## Контракты

- Публичны только `/`, `/product`, `/security`, `/docs`, `/demo`, `/auth` и
  `/auth/login`; рабочие маршруты продолжают требовать аутентификацию.
- Демо использует versioned synthetic data и не обращается к PostgreSQL,
  tenant API, AI, Temporal, OAuth, публикации или платным сервисам.
- Регистрация сначала собирает email только в памяти браузера. Финальный submit
  принимает `workspaceName?`, сохраняет legacy `company` и optional allowlisted
  `starterTemplate`. Имя выбирается как `workspaceName -> company -> Workspace`;
  email не участвует.
- `starterTemplate` применяется транзакционно и идемпотентно ровно один раз.
- `AiUsageMode` имеет два явных значения: `included` и `workspace_key`.
  `included` использует managed server credentials и quota; `workspace_key`
  использует только зашифрованный ключ текущей организации. Скрытого fallback
  нет. Usage ledger не хранит prompt или output.
- Публичные growth events имеют закрытый allowlist и coarse payload. IP,
  User-Agent, referrer URL, email, arbitrary properties и persistent visitor id
  не сохраняются; trusted registration/activation фиксируются сервером.

## Не цели текущей стадии

- Не закрывать content-intelligence `content-factory-next-9e9` и не выдавать
  roadmap-функции за готовые.
- Не принимать pricing/trial/card decision.
- Не выбирать cloud provider, data region, legal entity или subprocessors.
- Не выполнять production, live OAuth, paid calls, publish, merge, push, PR или
  deploy.
- Не изменять отдельную ветку или owned files агента главного экрана.

## Technical premortem

**Вердикт: GO WITH CONDITIONS.** Все изменения локальны и обратимы; schema
изменения получают additive migration и не применяются к deployed database.

| Симптом | Evidence | Механизм | Условие / detection |
|---|---|---|---|
| Незалогиненный посетитель снова попадает на `/auth` | confirmed | proxy сейчас редиректит любой не-auth путь | focused proxy test на public allowlist и authenticated `/` |
| Новый signup ломает старого клиента | confirmed | `company` сейчас required DTO/consumer | compatibility test: legacy company, workspaceName и default |
| Шаблон применяется повторно | plausible | retry финального register/create | transaction/idempotency test с одним созданным seed |
| Demo вызывает реальный backend | plausible | UI helper по привычке использует `useFetch` | test запрещает network-mutating imports/calls и browser request proof |
| Публичные метрики превращаются в PII ledger | confirmed risk | текущий ProductEvent требует actor/org и принимает properties | отдельный allowlisted aggregate contract, reject-extra/PII tests |
| AI использует чужой или неожиданный ключ | confirmed risk | существующий config tenant-specific, managed mode отсутствует | explicit mode tests, tenant fixtures, no-auto-fallback assertions |
| Included AI обходится без quota | plausible | текущие clients читают provider config напрямую | один resolver перед client creation и usage/quota proof |
| Исполнитель перезаписывает landing-agent work | confirmed ownership | отдельный worktree расходится с текущей веткой | запрещённые paths в stream zones и root scoped diff audit |
| SaaS claims обещают неподтверждённое | plausible | старые self-host assumptions и inherited prices | user-facing content guard и no-price/trial claim checks |

Recovery: откат локальных stage-коммитов; additive migration не удаляет данные;
никакие production schema/data действия не выполняются. Любая потребность в
секрете, платном вызове, live account или deploy останавливает поток.

