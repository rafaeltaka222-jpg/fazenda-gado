# Demonstração do sistema

## Preparar os dados
1. Crie a sua conta no site (e-mail e senha) e entre. Não precisa criar fazenda: o script cria a "Fazenda Demonstração" se você não tiver uma.
2. No PowerShell, na pasta do projeto, com o Supabase local ligado:
   ```powershell
   .\scripts\demo.ps1 -Email seu@email.com
   ```
   Cria cerca de 120 animais com 4 pesagens cada, vacinas (atrasadas, a vencer e em dia), reprodução, uma venda com valor,
   estoque e custos, tarefas, uma contagem e uma consulta salva. Tudo passa pelas regras e pela auditoria do sistema.
3. Se der erro, copie a mensagem inteira e me envie. Nada é gravado em caso de erro. Para recomeçar do zero: `npx supabase db reset`.

## Roteiro de 10 minutos
1. **Painel:** indicadores do rebanho, peso médio e GMD, evolução do peso por mês, alertas de sanidade, estoque, reprodução, vendas e tarefas.
2. **Rebanho:** filtros e busca; abrir um animal e mostrar histórico, pesagens, sanidade, genealogia e campos personalizados.
3. **Operação em lote:** selecionar animais e transferir de lote (com confirmação).
4. **Pesagens:** lançar pesagem do lote inteiro de uma vez; mostrar o aviso de variação brusca.
5. **Importação:** enviar o arquivo de exemplo, mostrar a prévia com erros por linha e a correção antes de gravar.
6. **Sanidade e reprodução:** doses atrasadas e carência; partos previstos e diagnóstico pendente; registrar um parto.
7. **Estoque e custos:** saída de sal mineral para um lote gera custo automaticamente; custo por lote e por cabeça.
8. **Relatórios:** relatório padrão, montar uma consulta com um campo personalizado, exportar CSV e imprimir.
9. **Segurança:** perfis e permissões (entrar com um usuário "Visualização" e mostrar o que ele não vê), campo restrito por perfil, 2FA,
   **Auditoria** e o botão "Verificar integridade do registro".
10. **API:** criar uma chave e consultar animais com `curl`.

## Cuidados
Use sempre dados fictícios em apresentações. Antes de apresentar, ensaie com o banco recém-carregado e confira o 2FA no seu celular.
