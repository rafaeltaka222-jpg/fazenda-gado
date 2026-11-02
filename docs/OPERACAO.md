# Operação e administração

## Primeiros passos
1. Criar conta e a primeira organização/fazenda (quem cria vira administrador).
2. Em **Lotes e pastos**, cadastrar lotes e pastos. Em **Campos personalizados**, criar os campos extras do cadastro de animal.
3. Em **Usuários**, adicionar a equipe: cada pessoa cria a própria conta na tela de login e o administrador a adiciona pelo e-mail.
4. Ativar o 2FA em **Segurança (2FA)** (obrigatório para administradores se `REQUIRE_ADMIN_2FA=true`).

## Perfis
Administrador, Gerente, Veterinário, Zootecnista, Funcionário, Operador e Visualização. Cada perfil tem permissões por módulo e
ação (ver, criar, editar, excluir, exportar, imprimir, importar). Só se concede perfil com permissões que você mesmo possui.

## Rotinas
- **Dia de manejo:** Pesagens (lote inteiro de uma vez) ou Importação de arquivo TXT/CSV com prévia.
- **Sanidade:** registrar aplicações em lote; acompanhar doses atrasadas e carências no Painel.
- **Estoque:** registrar entradas (com custo) e saídas; saídas geram custo automaticamente pelo custo médio.
- **Relatórios:** relatórios padrão, nova consulta com filtros e salvar em "Minhas consultas"; exportar em Excel (.xlsx), PDF ou CSV, ou imprimir.
- **Correções:** nada se apaga; use "Anular" com o motivo. Alterações ficam na Auditoria.
- **Integridade:** em Auditoria, "Verificar integridade do registro" (faça periodicamente).

## Importação de pesagens
Cadastre um layout (separador, colunas, formato de data, decimal) ou carregue os **Perfis Homologados** com 1 clique
(Coimma KM-3 Plus CSV, Tru-Test XR5000/S3 CSV e IdBeck 3.0 TXT). Envie o arquivo, revise a prévia (OK, aviso, erro, duplicada),
corrija ou ignore as linhas com erro e confirme. Reenviar o mesmo arquivo não duplica pesagens.

## Integrações (API)
Ver `docs/API.md`. Chaves são criadas em **API e integrações**; o valor só aparece uma vez.

## Reprodução, vendas e pessoas
- **Reprodução:** registre cobertura, inseminação e diagnóstico pelo brinco da fêmea. O parto cria o bezerro com mãe e pai
  (pai = último reprodutor da cobertura, se não informado). Parto previsto = última cobertura + 283 dias (estimativa).
- **Pessoas:** cadastro de compradores, fornecedores, funcionários etc. (só administrador e gerente; CPF/CNPJ validado).
- **Vendas:** informe os brincos, o comprador e o valor total; os animais saem do rebanho ativo e a receita aparece no Painel.
  Vendas feitas direto na página Rebanho não têm valor registrado. Caso necessário, é possível realizar o **Estorno Auditado**
  da venda informando o motivo obrigatório (retornando os animais ao status ativo e registrando na trilha de auditoria SHA-256).

## Contagem, tarefas e busca
- **Contagem:** em Rebanho > Contagem, informe os brincos encontrados em um lote, pasto ou na fazenda toda. O sistema aponta quem falta
  e quem sobra (e por quê: brinco não cadastrado, animal vendido/morto ou ativo em outro local). A contagem não altera o cadastro.
- **Tarefas:** agenda da fazenda com prazo, prioridade e responsável; atrasadas aparecem no Painel.
- **Busca global:** caixa no topo; procura brinco, nome, lote, pasto e pessoas (só mostra o que o seu perfil pode ver).
- O menu lateral mostra apenas as áreas que o seu perfil pode acessar.

## Exportações
Na tela de resultado de um relatório: **Exportar Excel** (planilha com cabeçalho, filtro e datas/números como tipos reais), **Exportar PDF**
(tabela paginada, com título, fazenda e data) e **Exportar CSV**. Até 5.000 linhas por arquivo. Cada exportação é registrada
(usuário, data, consulta e quantidade de linhas). O sistema gera os arquivos sem bibliotecas externas; os geradores foram testados
abrindo os arquivos no LibreOffice, no openpyxl e em leitores de PDF.
