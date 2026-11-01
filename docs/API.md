# API v1

Base: `/api/v1`. Especificação OpenAPI 3: `GET /api/v1/openapi`.

## Autenticação
Cabeçalho `Authorization: Bearer fz_...`. A chave pertence a **uma fazenda** e tem escopos: `read` e `write_weighings`.
Criação/revogação em **API e integrações** (administrador ou gerente). Só o hash da chave é guardado.

## Limites
120 requisições por minuto por chave (429 com `Retry-After`). Corpo máximo de 1 MB; até 500 itens por envio de pesagens.

## Endpoints
| Método | Caminho | Escopo | Descrição |
|---|---|---|---|
| GET | `/animals?status=&limit=&cursor=` | read | Lista animais (paginação por cursor, até 200) |
| GET | `/animals/{id}` | read | Detalha um animal |
| GET | `/weighings?ear_tag=&limit=` | read | Pesagens recentes |
| POST | `/weighings` | write_weighings | Registra pesagens em lote (cabeçalho `Idempotency-Key` opcional) |

## Erros
`{"error": {"code": "...", "message": "..."}}` com 401 (chave), 403 (escopo), 404, 409 (duplicada), 422 (validação), 429 (limite).

## Exemplo
```bash
curl -X POST http://localhost:3000/api/v1/weighings \
  -H "Authorization: Bearer fz_..." -H "Content-Type: application/json" -H "Idempotency-Key: lote-0001" \
  -d '{"items":[{"ear_tag":"000123","weighed_at":"2026-10-20T08:32:00-03:00","weight_kg":425}]}'
```

## Limites conhecidos
Sem webhooks de saída (exigem processo agendado de envio) e sem recursos de lotes, pastos e movimentações; sem campos personalizados.
Documentação testada contra a implementação: ainda não (TODO: testes automatizados de contrato).
