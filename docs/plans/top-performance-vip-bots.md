# Plano: Bots de Performance e VIP

## Objetivo

Criar dois bots novos sem alterar o comportamento atual do bot de `!top`:

<table>
  <thead>
    <tr>
      <th>Bot</th>
      <th>Quando executa</th>
      <th>Responsabilidade</th>
      <th>Impacto no chat</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>top-performance</code></td>
      <td>Ao detectar <code>MATCH ENDED</code></td>
      <td>Calcular os vencedores de performance da partida e conceder 1 dia de VIP para quem ainda nao tem VIP.</td>
      <td>Envia uma mensagem publica de resultado e, para quem ganhou VIP novo, uma mensagem privada de parabens.</td>
    </tr>
    <tr>
      <td><code>performance-info</code></td>
      <td>Quando um jogador usar <code>!perf</code> ou <code>!performance</code></td>
      <td>Explicar como ganhar VIP por performance.</td>
      <td>Responder preferencialmente por mensagem privada para evitar spam.</td>
    </tr>
  </tbody>
</table>

O bot atual de top kill continua como esta: responde `!top`, lista top 10 abates, melhor comandante e melhores squads por time. O novo bot de performance deve abrir uma segunda mensagem/janela administrativa no fim da partida, separada da mensagem do top kill, com os vencedores de VIP por performance.

## API VIP no Discovery

Pelo arquivo `get_api_documentation.json`, o endpoint principal para dar VIP e:

<table>
  <thead>
    <tr>
      <th>Endpoint</th>
      <th>Metodo</th>
      <th>Argumentos</th>
      <th>Permissao</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>add_vip</code></td>
      <td><code>POST</code></td>
      <td><code>player_id</code>, <code>description</code>, <code>expiration</code></td>
      <td><code>api.can_add_vip</code></td>
    </tr>
    <tr>
      <td><code>get_vip_ids</code></td>
      <td><code>GET</code></td>
      <td>Nenhum</td>
      <td><code>api.can_view_vip_ids</code></td>
    </tr>
  </tbody>
</table>

Uso planejado:

```js
await client.post("add_vip", {
  player_id: winner.playerId,
  description: "VIP performance: melhor comandante da partida",
  expiration: "1 day"
});
```

Antes de conceder, o bot deve consultar `get_vip_ids`. Se o jogador ja estiver na lista de VIPs, nao deve acumular dias. A mensagem final deve marcar esse jogador como `ja tem VIP`.

Ponto para validar no teste: confirmar o formato exato aceito por `expiration`. A documentacao diz `str | None`, mas nao mostra exemplos. O teste inicial deve usar `PERFORMANCE_DRY_RUN=true` para imprimir payloads e depois um teste controlado com o jogador do Antonio.

Para a mensagem privada de parabens, o bot deve calcular localmente a previsao de validade como `agora + 1 dia` e formatar no horario local do servidor. Essa data e informativa; a autoridade real continua sendo o CRCON/VIP configurado no `add_vip`.

## Bot 1: Top Performance no fim da partida

### Disparo

O bot deve seguir o mesmo padrao do bot atual:

<table>
  <thead>
    <tr>
      <th>Evento</th>
      <th>Comportamento</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>MATCH ENDED</code></td>
      <td>Coleta dados da partida, calcula vencedores, concede VIP quando permitido e publica o resultado.</td>
    </tr>
    <tr>
      <td>Primeiro ciclo apos iniciar</td>
      <td>Apenas aquece a leitura dos logs para nao reagir a eventos antigos.</td>
    </tr>
    <tr>
      <td>Cooldown</td>
      <td>Reusar cooldown por chave de match ended para evitar execucao duplicada.</td>
    </tr>
  </tbody>
</table>

### Fontes de dados

<table>
  <thead>
    <tr>
      <th>Dado</th>
      <th>Endpoint preferido</th>
      <th>Fallback</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Jogadores e abates</td>
      <td><code>get_live_game_stats</code></td>
      <td><code>get_live_scoreboard</code></td>
      <td>Calcular os 3 melhores jogadores de combate/performance individual.</td>
    </tr>
    <tr>
      <td>Comandantes</td>
      <td><code>get_team_view</code></td>
      <td>Nenhum inicialmente</td>
      <td>Escolher o melhor comandante entre Eixo e Aliados.</td>
    </tr>
    <tr>
      <td>Squads de tanque</td>
      <td><code>get_team_view</code></td>
      <td>Nenhum inicialmente</td>
      <td>Escolher o melhor squad de tanque por soma de pontos.</td>
    </tr>
    <tr>
      <td>VIPs atuais</td>
      <td><code>get_vip_ids</code></td>
      <td>Nenhum</td>
      <td>Evitar acumular VIP para quem ja tem.</td>
    </tr>
  </tbody>
</table>

## Criterios de pontuacao

### Melhor comandante

O melhor comandante deve ser escolhido entre os comandantes dos dois times.

<table>
  <thead>
    <tr>
      <th>Campo</th>
      <th>Peso</th>
      <th>Motivo</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>support</code></td>
      <td>1x</td>
      <td>Representa abastecimento, uso de recursos e apoio ao time.</td>
    </tr>
    <tr>
      <td><code>combat</code></td>
      <td>1x</td>
      <td>Representa impacto de combate do comandante.</td>
    </tr>
    <tr>
      <td><code>offense</code></td>
      <td>0.5x</td>
      <td>Desempate por participacao ofensiva.</td>
    </tr>
    <tr>
      <td><code>defense</code></td>
      <td>0.5x</td>
      <td>Desempate por defesa objetiva.</td>
    </tr>
    <tr>
      <td><code>kills</code></td>
      <td>10 pontos por kill</td>
      <td>Valoriza comandante que tambem teve impacto direto em combate.</td>
    </tr>
  </tbody>
</table>

Formula proposta:

```txt
commanderScore = support + combat + ((offense + defense) * 0.5) + (kills * 10)
```

Desempates:

<table>
  <tbody>
    <tr>
      <td>1</td>
      <td>Maior <code>support</code></td>
    </tr>
    <tr>
      <td>2</td>
      <td>Maior <code>combat</code></td>
    </tr>
    <tr>
      <td>3</td>
      <td>Maior soma <code>offense + defense</code></td>
    </tr>
    <tr>
      <td>4</td>
      <td>Maior <code>kills</code></td>
    </tr>
    <tr>
      <td>5</td>
      <td>Nome em ordem alfabetica</td>
    </tr>
  </tbody>
</table>

### Top 3 jogadores de combate

O objetivo e premiar performance real, nao apenas abates brutos. A formula deve considerar kills, KPM quando disponivel e pontos somados de combate, ofensivo, defensivo e suporte.

<table>
  <thead>
    <tr>
      <th>Campo</th>
      <th>Peso</th>
      <th>Observacao</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>kills</code></td>
      <td>10 pontos por kill</td>
      <td>Evita que score passivo supere um jogador decisivo em combate.</td>
    </tr>
    <tr>
      <td><code>combat</code></td>
      <td>1x</td>
      <td>Base principal do score de combate.</td>
    </tr>
    <tr>
      <td><code>offense</code></td>
      <td>1x</td>
      <td>Valoriza pressao em objetivo.</td>
    </tr>
    <tr>
      <td><code>defense</code></td>
      <td>1x</td>
      <td>Valoriza defesa ativa.</td>
    </tr>
    <tr>
      <td><code>support</code></td>
      <td>1.2x</td>
      <td>Valoriza apoio util ao time sem deixar kills e combate perderem relevancia.</td>
    </tr>
    <tr>
      <td><code>kpm</code></td>
      <td>bonus de ate 100</td>
      <td>Usar apenas se o endpoint trouxer tempo jogado confiavel.</td>
    </tr>
  </tbody>
</table>

Formula proposta:

```txt
playerPerformanceScore = (kills * 10) + combat + offense + defense + (support * 1.2) + kpmBonus
kpmBonus = min(kpm * 50, 100)
```

Desempates:

<table>
  <tbody>
    <tr>
      <td>1</td>
      <td>Maior <code>kills</code></td>
    </tr>
    <tr>
      <td>2</td>
      <td>Maior <code>combat</code></td>
    </tr>
    <tr>
      <td>3</td>
      <td>Maior K/D</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Menos mortes</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Nome em ordem alfabetica</td>
    </tr>
  </tbody>
</table>

Regra importante: remover da lista de top 3 qualquer jogador que ja ganhou como melhor comandante, para nao premiar a mesma pessoa duas vezes na mesma partida.

### Melhor squad de tanque

O premio de tanque deve ser por squad, mas a concessao de VIP precisa ser definida. Proposta: conceder 1 dia de VIP para todos os membros do melhor squad de tanque, desde que ainda nao tenham VIP.

<table>
  <thead>
    <tr>
      <th>Campo</th>
      <th>Peso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>combat</code></td>
      <td>1x</td>
    </tr>
    <tr>
      <td><code>offense</code></td>
      <td>1x</td>
    </tr>
    <tr>
      <td><code>defense</code></td>
      <td>1x</td>
    </tr>
    <tr>
      <td><code>support</code></td>
      <td>1x</td>
    </tr>
    <tr>
      <td><code>kills</code></td>
      <td>10 pontos por kill</td>
    </tr>
  </tbody>
</table>

Formula proposta:

```txt
tankSquadScore = combat + offense + defense + support + (kills * 10)
```

Filtro:

```txt
squad.type deve indicar tanque/armor, ou o nome/roles dos membros devem indicar tank crew quando o tipo nao vier confiavel.
```

Ponto para aprovar: confirmar se o premio do melhor squad de tanque deve ir para todos os membros do squad ou apenas para o lider/crew principal. Pela descricao, a leitura mais natural e premiar o squad, ou seja, todos os membros.

## Concessao de VIP

### Regras

<table>
  <thead>
    <tr>
      <th>Regra</th>
      <th>Comportamento</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>VIP novo</td>
      <td>Chamar <code>add_vip</code> com expiracao de 1 dia.</td>
    </tr>
    <tr>
      <td>Jogador ja tem VIP</td>
      <td>Nao chamar <code>add_vip</code>, nao acumular, mostrar <code>ja tem VIP</code> na mensagem.</td>
    </tr>
    <tr>
      <td>Mesmo jogador vence mais de uma categoria</td>
      <td>Premiar apenas uma vez e indicar a melhor categoria principal.</td>
    </tr>
    <tr>
      <td>Sem <code>player_id</code></td>
      <td>Nao tentar conceder VIP; logar como impossivel conceder.</td>
    </tr>
    <tr>
      <td>Falha no endpoint VIP</td>
      <td>Logar erro, manter mensagem honesta: <code>VIP pendente</code> ou nao publicar ate decisao operacional.</td>
    </tr>
  </tbody>
</table>

### Descricoes sugeridas

<table>
  <thead>
    <tr>
      <th>Categoria</th>
      <th><code>description</code></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Comandante</td>
      <td><code>VIP performance: melhor comandante</code></td>
    </tr>
    <tr>
      <td>Top jogador</td>
      <td><code>VIP performance: top combate</code></td>
    </tr>
    <tr>
      <td>Squad de tanque</td>
      <td><code>VIP performance: melhor squad tanque</code></td>
    </tr>
  </tbody>
</table>

## Mensagem do bot top-performance

O bot de performance deve ter duas saidas:

<table>
  <thead>
    <tr>
      <th>Saida</th>
      <th>Destino</th>
      <th>Quando enviar</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Resultado publico</td>
      <td><code>message_all_players</code></td>
      <td>No fim da partida, se <code>PERFORMANCE_SEND_CHAT=true</code>.</td>
    </tr>
    <tr>
      <td>Parabens privado</td>
      <td><code>message_player</code></td>
      <td>Para cada vencedor que recebeu VIP novo, se <code>PERFORMANCE_SEND_PRIVATE_CONGRATS=true</code>.</td>
    </tr>
  </tbody>
</table>

Jogadores que ja possuem VIP devem aparecer na mensagem publica como `ja tem VIP`, mas nao devem receber mensagem privada dizendo que ganharam novo VIP, porque nao houve acumulacao.

### Mensagem publica

Formato proposto, seguindo o estilo direto do bot atual:

```txt
TOP PERFORMANCE DA PARTIDA

Melhor Comandante
PlayerName 4250 pts - VIP 1 dia
suporte 2300 / combate 1200 / obj 1500

Top 3 Combate
01 PlayerName 5320 pts - VIP 1 dia
02 PlayerName 4980 pts - ja tem VIP
03 PlayerName 4720 pts - VIP 1 dia

Melhor Squad de Tanque
ABLE 8600 pts - VIP 1 dia para membros sem VIP
- TankerOne - VIP 1 dia
- TankerTwo - ja tem VIP
- TankerThree - VIP 1 dia
```

Versao compacta se o chat cortar mensagens:

```txt
TOP PERFORMANCE

CMD PlayerName 4250 pts - VIP 1 dia

COMBATE
01 PlayerName 5320 pts - VIP 1 dia
02 PlayerName 4980 pts - ja tem VIP
03 PlayerName 4720 pts - VIP 1 dia

TANQUE ABLE 8600 pts
TankerOne VIP 1 dia / TankerTwo ja tem VIP / TankerThree VIP 1 dia
```

### Mensagens privadas de parabens

Comandante:

```txt
Parabens, PlayerName!

Voce foi o melhor comandante da partida com 4250 pontos de performance.
Ganhou 1 dia de VIP, valido ate 06/05/2026 10:25.
Obrigado por puxar o time.
```

Top combate:

```txt
Parabens, PlayerName!

Voce ficou em 2 lugar no top performance da partida com 4980 pontos.
Ganhou 1 dia de VIP, valido ate 06/05/2026 10:25.
Continue buscando performance para renovar nas proximas partidas.
```

Squad de tanque:

```txt
Parabens, PlayerName!

Seu squad de tanque foi o melhor da partida com 8600 pontos.
Ganhou 1 dia de VIP, valido ate 06/05/2026 10:25.
Boa partida.
```

Se o jogador ja tiver VIP:

```txt
Nao enviar mensagem privada de premio novo.
O jogador aparece apenas na mensagem publica como ja tem VIP.
```

## Bot 2: Informativo `!perf` / `!performance`

### Comandos aceitos

<table>
  <thead>
    <tr>
      <th>Comando</th>
      <th>Resposta</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>!perf</code></td>
      <td>Mensagem informativa de performance.</td>
    </tr>
    <tr>
      <td><code>!performance</code></td>
      <td>Mesma mensagem informativa.</td>
    </tr>
  </tbody>
</table>

### Mensagem proposta

```txt
VIP por performance

No fim da partida, o servidor premia com 1 dia de VIP:
- melhor comandante
- top 3 jogadores de combate
- melhor squad de tanque

Top combate considera kills, KPM quando disponivel, combate, ataque, defesa e suporte.
Quem ja tem VIP nao acumula dias.
```

Resposta deve ser privada para o jogador que chamou o comando. Se nao houver `player_id` no log, fallback para chat geral apenas em dry-run/teste, ou ignorar com log.

## Estrutura de implementacao proposta

<table>
  <thead>
    <tr>
      <th>Arquivo</th>
      <th>Responsabilidade</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>src/top.js</code></td>
      <td>Manter como esta para nao afetar o bot atual.</td>
    </tr>
    <tr>
      <td><code>src/performance.js</code></td>
      <td>Normalizacao, calculos, rankings e formatacao das mensagens de performance.</td>
    </tr>
    <tr>
      <td><code>src/vip.js</code></td>
      <td>Consulta de VIP atual, deteccao de VIP existente e chamada de <code>add_vip</code>.</td>
    </tr>
    <tr>
      <td><code>src/performanceBot.js</code></td>
      <td>Bot que escuta <code>MATCH ENDED</code>, calcula vencedores e concede VIP.</td>
    </tr>
    <tr>
      <td><code>src/performanceInfoBot.js</code></td>
      <td>Bot que escuta <code>!perf</code>/<code>!performance</code> e responde com regras.</td>
    </tr>
    <tr>
      <td><code>src/bot.js</code></td>
      <td>Sem alteracao funcional para preservar o top kill atual.</td>
    </tr>
  </tbody>
</table>

Scripts planejados:

```json
{
  "bot": "node src/bot.js",
  "performance": "node src/performanceBot.js",
  "performance:info": "node src/performanceInfoBot.js"
}
```

## Configuracoes novas

<table>
  <thead>
    <tr>
      <th>Variavel</th>
      <th>Default</th>
      <th>Uso</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>PERFORMANCE_DRY_RUN</code></td>
      <td><code>true</code> durante teste</td>
      <td>Imprime mensagem e payloads VIP sem enviar/conceder.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_SEND_CHAT</code></td>
      <td><code>false</code> durante teste</td>
      <td>Controla se publica no chat geral no fim da partida.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_SEND_PRIVATE_CONGRATS</code></td>
      <td><code>false</code> durante teste</td>
      <td>Controla se envia parabens privado para cada jogador que recebeu VIP novo.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_GRANT_VIP</code></td>
      <td><code>false</code> durante teste</td>
      <td>Controla chamada real a <code>add_vip</code>.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_VIP_EXPIRATION</code></td>
      <td><code>1 day</code></td>
      <td>String enviada ao endpoint <code>add_vip</code>.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_LOCK_FILE</code></td>
      <td><code>artifacts/performance-bot.lock</code></td>
      <td>Evita duas instancias do bot de performance.</td>
    </tr>
    <tr>
      <td><code>PERFORMANCE_INFO_LOCK_FILE</code></td>
      <td><code>artifacts/performance-info-bot.lock</code></td>
      <td>Evita duas instancias do bot informativo.</td>
    </tr>
  </tbody>
</table>

## Plano de teste sem spam

<table>
  <thead>
    <tr>
      <th>Fase</th>
      <th>Como testar</th>
      <th>Resultado esperado</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1. Calculo offline/log</td>
      <td>Rodar bot em dry-run e acionar manualmente a rotina de performance.</td>
      <td>Logs mostram comandante, top 3, squad tanque e payloads de VIP sem enviar nada.</td>
    </tr>
    <tr>
      <td>2. Mensagem privada informativa</td>
      <td>Antonio envia <code>!perf</code> ou <code>!performance</code>.</td>
      <td>Somente Antonio recebe a explicacao.</td>
    </tr>
    <tr>
      <td>3. VIP controlado</td>
      <td>Habilitar <code>PERFORMANCE_GRANT_VIP=true</code> apenas para o jogador do Antonio ou modo manual.</td>
      <td>Confirmar formato de <code>expiration</code> e retorno do <code>add_vip</code>.</td>
    </tr>
    <tr>
      <td>4. Parabens privado controlado</td>
      <td>Habilitar <code>PERFORMANCE_SEND_PRIVATE_CONGRATS=true</code> apenas no teste manual com Antonio.</td>
      <td>Antonio recebe a mensagem privada com categoria, pontuacao e validade estimada do VIP.</td>
    </tr>
    <tr>
      <td>5. Chat geral bloqueado</td>
      <td>Manter <code>PERFORMANCE_SEND_CHAT=false</code> no servidor ativo.</td>
      <td>Nao gera spam para jogadores durante validacao.</td>
    </tr>
    <tr>
      <td>6. Producao</td>
      <td>Ativar <code>PERFORMANCE_SEND_CHAT=true</code>, <code>PERFORMANCE_SEND_PRIVATE_CONGRATS=true</code> e <code>PERFORMANCE_GRANT_VIP=true</code>.</td>
      <td>Bot opera sozinho no final da partida.</td>
    </tr>
  </tbody>
</table>

## Sequencia de desenvolvimento

<table>
  <thead>
    <tr>
      <th>Etapa</th>
      <th>Entrega</th>
      <th>Validacao</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td>
      <td>Extrair helpers compartilhaveis de leitura de logs/lock se necessario, sem mudar comportamento do <code>src/bot.js</code>.</td>
      <td><code>npm run bot</code> continua igual em dry-run.</td>
    </tr>
    <tr>
      <td>2</td>
      <td>Criar <code>src/performance.js</code> com calculos puros e testes manuais via logs.</td>
      <td>Ranking impresso no terminal com dados reais.</td>
    </tr>
    <tr>
      <td>3</td>
      <td>Criar <code>src/vip.js</code> com modo dry-run e deteccao de VIP existente.</td>
      <td>Payload de <code>add_vip</code> correto, sem chamada real inicialmente.</td>
    </tr>
    <tr>
      <td>4</td>
      <td>Criar <code>src/performanceBot.js</code>.</td>
      <td>Detecta <code>MATCH ENDED</code>, calcula e loga mensagem sem publicar.</td>
    </tr>
    <tr>
      <td>5</td>
      <td>Criar <code>src/performanceInfoBot.js</code>.</td>
      <td><code>!perf</code>/<code>!performance</code> respondem por privado.</td>
    </tr>
    <tr>
      <td>6</td>
      <td>Teste real controlado com jogador do Antonio.</td>
      <td>VIP de 1 dia aplicado apenas quando permitido e sem acumulacao.</td>
    </tr>
    <tr>
      <td>7</td>
      <td>Ativar automacao final.</td>
      <td>Bot roda sozinho no final da partida.</td>
    </tr>
  </tbody>
</table>

## Decisoes pendentes para aprovacao

<table>
  <thead>
    <tr>
      <th>Decisao</th>
      <th>Proposta</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Premio do melhor squad de tanque</td>
      <td>Dar VIP para todos os membros do squad que ainda nao tem VIP.</td>
    </tr>
    <tr>
      <td>Formato final de expiracao</td>
      <td>Testar <code>1 day</code>; se o CRCON rejeitar, ajustar para o formato aceito pelo endpoint.</td>
    </tr>
    <tr>
      <td>Mensagem de falha de VIP</td>
      <td>Durante teste, nao publicar falhas no chat geral; apenas logar.</td>
    </tr>
    <tr>
      <td>Mensagem privada de parabens</td>
      <td>Enviar apenas para quem recebeu VIP novo. Quem ja tem VIP aparece no publico como <code>ja tem VIP</code>, sem mensagem privada de premio.</td>
    </tr>
    <tr>
      <td>Comandos informativos</td>
      <td>Aceitar <code>!perf</code> e <code>!performance</code>.</td>
    </tr>
  </tbody>
</table>
