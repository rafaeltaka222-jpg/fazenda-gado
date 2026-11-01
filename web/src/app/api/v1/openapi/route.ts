import { NextResponse } from "next/server";

const error = { type: "object", properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } } };
const errs = {
  "401": { description: "Chave ausente, inválida, expirada ou revogada", content: { "application/json": { schema: error } } },
  "403": { description: "Escopo insuficiente", content: { "application/json": { schema: error } } },
  "422": { description: "Dados inválidos", content: { "application/json": { schema: error } } },
  "429": { description: "Limite de 120 requisições por minuto excedido", content: { "application/json": { schema: error } } },
};

const spec = {
  openapi: "3.0.3",
  info: { title: "API Fazenda Gado", version: "1.0.0", description: "API v1. Autenticação por chave (Authorization: Bearer fz_...). Cada chave pertence a uma fazenda e tem escopos." },
  servers: [{ url: "/api/v1" }],
  components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
  security: [{ bearer: [] }],
  paths: {
    "/animals": {
      get: {
        summary: "Lista animais (escopo read)",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["ativo", "vendido", "morto", "transferido"] } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
          { name: "cursor", in: "query", description: "next_cursor da página anterior", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Página de animais, com next_cursor quando houver mais" }, ...errs },
      },
    },
    "/animals/{id}": {
      get: {
        summary: "Detalha um animal (escopo read)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "200": { description: "Animal" }, "404": { description: "Não encontrado" }, ...errs },
      },
    },
    "/weighings": {
      get: {
        summary: "Lista pesagens recentes (escopo read)",
        parameters: [
          { name: "ear_tag", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
        ],
        responses: { "200": { description: "Pesagens" }, ...errs },
      },
      post: {
        summary: "Registra pesagens em lote (escopo write_weighings)",
        parameters: [{ name: "Idempotency-Key", in: "header", description: "Repetir a mesma chave devolve a resposta anterior sem duplicar", schema: { type: "string", maxLength: 100 } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: {
                    type: "array", minItems: 1, maxItems: 500,
                    items: {
                      type: "object", required: ["ear_tag", "weighed_at", "weight_kg"],
                      properties: {
                        ear_tag: { type: "string" },
                        weighed_at: { type: "string", format: "date-time", example: "2026-10-20T08:32:00-03:00" },
                        weight_kg: { type: "number", exclusiveMinimum: 0, maximum: 2000 },
                        device_id: { type: "string" },
                        notes: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Quantidade gravada e avisos de variação brusca" }, "409": { description: "Pesagem duplicada" }, ...errs },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(spec, { headers: { "Cache-Control": "public, max-age=300" } });
}
