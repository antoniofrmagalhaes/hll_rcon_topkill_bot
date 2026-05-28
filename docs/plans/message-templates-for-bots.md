# Plano: templates de mensagens para os bots

## Contexto

Hoje as mensagens nao vem de um `.txt` externo. Elas estao hardcoded no codigo, principalmente em funcoes formatadoras que montam arrays de linhas e fazem `join("\n")`, ou em strings diretas antes do envio para o CRCON.

Isso deixa o texto acoplado ao deploy do bot: qualquer ajuste de tom, titulo, ordem de linhas ou chamada precisa virar alteracao de codigo, revisao e restart.

## Inventario atual

| Bot | Arquivo | Mensagens atuais | Observacao |
| --- | --- | --- | --- |
| Top Bot | `src/top.js` e `src/bot.js` | `formatTopMessage()` | Mensagem dinamica com ranking, comandante e squads. Texto fixo: titulos, labels e fallback `Sem dados`. |
| Performance Bot | `src/performance.js` e `src/performanceBot.js` | `formatPerformanceMessage()`, `formatPrivateWinnerMessages()`, `formatRoleMetricsMessage()`, `formatClassesMessage()` | Area mais sensivel: mensagem publica, PM de premio VIP, guias de classe e lista de comandos. |
| Performance Info Bot | `src/performanceInfoBot.js` | `formatPerformanceInfoMessage()` | Texto informativo totalmente hardcoded. Bom candidato inicial para template simples. |
| OP Bot | `src/op.js` | string direta `MENSAGEM DO PELOTAO...` | Mensagem curta, sem variaveis. Candidato simples. |
| Nodos Bot | `src/nodos.js` | `formatNodosOfficerMessage()` e `formatNodosEngineerMessage()` | Duas mensagens fixas, uma para oficiais e outra para engenheiros. Candidato simples. |

## Objetivo

Criar um sistema de templates para as mensagens dos bots existentes sem mudar o comportamento padrao em producao.

O primeiro resultado desejado e permitir editar mensagens em arquivos versionados, mantendo fallback identico ao texto hardcoded atual caso o template nao exista ou esteja invalido.

## Fora do escopo inicial

- Criar painel web para editar mensagens.
- Buscar templates direto no CRCON.
- Permitir JavaScript arbitrario dentro de templates.
- Alterar as regras de premio VIP, ranking, cooldown, lock ou polling.
- Mudar o conteudo padrao das mensagens atuais.

## Proposta de arquitetura

Criar uma camada compartilhada:

```txt
src/messageTemplates.js
templates/
  top.message.txt
  performance.public.txt
  performance.winner.commander.txt
  performance.winner.combat.txt
  performance.winner.tank.txt
  performance.info.txt
  performance.role-guide.txt
  performance.classes.txt
  op.reminder.txt
  nodos.officer.txt
  nodos.engineer.txt
```

Variaveis de ambiente propostas:

| Variavel | Default | Uso |
| --- | --- | --- |
| `MESSAGE_TEMPLATES_DIR` | `templates` | Diretorio base dos templates. |
| `MESSAGE_TEMPLATES_ENABLED` | `true` | Liga/desliga leitura de arquivos. |
| `MESSAGE_TEMPLATE_STRICT` | `false` | Quando `true`, falha se um template esperado estiver ausente/invalido. Em producao, manter `false`. |
| `MESSAGE_TEMPLATE_CACHE_MS` | `30000` | Cache para evitar ler disco a cada envio. |

## Formato sugerido

Usar `.txt` com placeholders simples:

```txt
Parabens, {{playerName}}!

Voce foi o melhor comandante da partida.
Pontuacao final: {{performanceScore}} pts
Premio: VIP ate {{vipUntil}}
{{performanceInfoHint}}
```

Regras:

- `{{nome}}` substitui valores escapados como texto simples.
- Placeholders desconhecidos ficam visiveis ou geram warning em log, conforme `MESSAGE_TEMPLATE_STRICT`.
- Condicionais e loops nao entram no primeiro passo.
- Listas dinamicas continuam sendo montadas no codigo e inseridas como bloco: `{{topPlayersLines}}`, `{{tankMembersLines}}`, `{{roleGuideLines}}`.

Essa abordagem evita criar uma mini-linguagem e reduz risco nos bots que enviam mensagens para jogadores reais.

## Modelo de dados por template

### Top Bot

`top.message.txt`

```txt
TOP 10 Abates

{{topPlayersLines}}

Melhor Comandante

{{bestCommanderLine}}

Melhor Esquadrao Eixo

{{bestAxisSquadBlock}}

Melhor Esquadrao Aliados

{{bestAlliesSquadBlock}}
```

Dados necessarios:

- `topPlayersLines`
- `bestCommanderLine`
- `bestAxisSquadBlock`
- `bestAlliesSquadBlock`

### Performance publica

`performance.public.txt`

```txt
TOP PERFORMANCE DA PARTIDA

Melhor Comandante
{{bestCommanderLine}}

Top 3 Jogadores da Partida
{{topCombatPlayersLines}}

Melhor Squad Tanque
{{bestTankSquadBlock}}
```

Dados necessarios:

- `bestCommanderLine`
- `topCombatPlayersLines`
- `bestTankSquadBlock`

### Performance privada de VIP

Separar por categoria porque o texto muda:

- `performance.winner.commander.txt`
- `performance.winner.combat.txt`
- `performance.winner.tank.txt`

Dados comuns:

- `playerName`
- `performanceScore`
- `scoreFormulaLines`
- `vipUntil`
- `performanceInfoHint`

Dados especificos:

- comandante: `support`, `combat`, `offense`, `defense`, `kills`
- combat: `position`, `kills`, `kpm`, `combat`, `offense`, `defense`, `support`
- tank: `squadName`, `squadPerformanceScore`, `playerPerformanceScore`

### Performance Info

`performance.info.txt` pode representar diretamente o texto atual do `!perf`.

Esse e o melhor primeiro template real porque nao depende de listas dinamicas nem concessao de VIP.

### Guias de classe

Opcao conservadora:

- manter `ROLE_GUIDES` no codigo no primeiro ciclo;
- apenas permitir template de envelope para `formatRoleMetricsMessage()`.

Exemplo:

```txt
{{roleTitle}}

{{roleGuideLines}}
```

Opcao futura:

- mover guias para `templates/roles/commander.txt`, `templates/roles/officer.txt`, etc.

### OP e Nodos

Templates diretos:

- `op.reminder.txt`
- `nodos.officer.txt`
- `nodos.engineer.txt`

Sem variaveis obrigatorias no primeiro passo.

## Fallback obrigatorio

Cada formatador deve continuar tendo um default em codigo equivalente ao texto atual.

Fluxo de renderizacao:

1. montar o contexto com os dados atuais;
2. tentar carregar o template pelo nome;
3. renderizar se existir e for valido;
4. se falhar, logar warning e usar o formatador atual/default.

Exemplo de log:

```txt
[templates] using default message
[templates] template loaded
[templates] unknown placeholder
[templates] render failed, using default
```

## Plano incremental

### Fase 1: base sem alterar mensagens

- Criar `src/messageTemplates.js`.
- Implementar leitura de arquivo, cache simples e renderizador `{{placeholder}}`.
- Criar testes unitarios do renderizador, se o projeto adotar testes depois; por enquanto validar com `node --check`.
- Nenhum bot usa templates ainda.

Aceite:

- modulo carrega template existente;
- modulo retorna `null` para template ausente com `strict=false`;
- modulo detecta placeholder desconhecido;
- `node --check src/messageTemplates.js` passa.

### Fase 2: templates simples

Integrar primeiro onde o risco e baixo:

- `src/performanceInfoBot.js`
- `src/op.js`
- `src/nodos.js`

Aceite:

- sem arquivos em `templates/`, mensagens continuam identicas;
- com arquivos em `templates/`, mensagens mudam apenas para o bot correspondente;
- dry-run mostra a mensagem renderizada.

### Fase 3: performance com VIP

Integrar:

- `formatPerformanceMessage()`
- `formatPrivateWinnerMessages()`

Cuidados:

- nao mudar a lista de jogadores premiados;
- nao mudar `vipStatus()`;
- nao mudar chamadas `add_vip`;
- manter PM privada somente para quem recebeu VIP novo.

Aceite:

- mensagem publica padrao permanece identica sem template;
- PM de comandante, combat e tanque permanecem identicas sem template;
- placeholders obrigatorios sao documentados;
- renderizacao com template invalido cai no fallback.

### Fase 4: Top Bot

Integrar `formatTopMessage()` por ultimo, porque ele combina ranking, comandante e squads no mesmo texto.

Aceite:

- `TOP_INCLUDE_HEADER=false` continua funcionando;
- fallback `Sem dados` e `Sem membros` permanece;
- resposta privada para `!top` nao muda sem template.

### Fase 5: documentacao operacional

Atualizar `README.md` com:

- lista de templates suportados;
- variaveis de ambiente;
- exemplo de edicao;
- recomendacao de validar em dry-run antes de producao;
- comando de restart do servico.

## Riscos

| Risco | Mitigacao |
| --- | --- |
| Template quebrado gerar mensagem vazia | Recusar resultado vazio e cair no fallback. |
| Placeholder errado esconder informacao importante | Logar desconhecidos e, em `strict=true`, falhar. |
| Edicao em producao causar comportamento diferente entre bots | Cache curto e log com nome do template usado. |
| Mensagem de VIP mentir sobre premio | Nao templatear a decisao de premio, apenas o texto final. |
| Quebra por caracteres especiais | Ler arquivos como UTF-8 e preservar quebras de linha. |

## Decisoes pendentes

- Os templates devem ficar versionados no repo ou fora do repo em producao?
- Deve existir um diretorio por ambiente, por exemplo `templates/prod` e `templates/local`?
- Queremos permitir override por variavel individual, tipo `OP_REMINDER_TEMPLATE_FILE`?
- O texto padrao deve continuar em portugues sem acentos, seguindo o padrao atual do codigo, ou podemos normalizar para portugues com acentos nos templates?

## Recomendacao

Implementar primeiro `performance.info`, `op.reminder`, `nodos.officer` e `nodos.engineer`.

Esses quatro cobrem mensagens hardcoded simples, validam a arquitetura com risco baixo e deixam a base pronta para as mensagens mais sensiveis do Performance Bot e do Top Bot.
