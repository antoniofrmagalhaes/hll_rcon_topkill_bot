# VIPs permanentes criados pelo bot de performance

Investigacao em 2026-05-07.

O bot enviava `expiration: "1 day"` diretamente para `add_vip`. No CRCON v11.10.0, esses registros foram gravados como permanentes com `vip_expiration = 3000-01-01T00:00:00+00:00`.

O campo `name` retornado por `get_vip_ids` veio preenchido com a descricao enviada pelo bot (`VIP performance: ...`), nao com o nome real do jogador. As tentativas de resolver nome por `get_players_history`, `get_player_profile`, `get_player_info` e `get_detailed_player_info` nao retornaram nome para estes IDs.

## Status

Removidos via endpoint `remove_vip` em 2026-05-06 21:42:41 -04.

Antes de remover, os 24 registros ainda batiam com os guardas:

- `name` com prefixo `VIP performance:`
- `vip_expiration` com prefixo `3000-01-01`

Depois da remocao, a verificacao em `get_vip_ids` retornou `remaining_bugged_count=0`.

## Registros removidos

| Player ID | Categoria | Expiracao atual |
| --- | --- | --- |
| `7dab0500d156af8608b75634737fc58e` | melhor comandante | `3000-01-01T00:00:00+00:00` |
| `d2ff944d4eda63c339505425a766fc08` | melhor comandante | `3000-01-01T00:00:00+00:00` |
| `685035ae5d0c1b4e93b351fc9d75de60` | melhor comandante | `3000-01-01T00:00:00+00:00` |
| `76561199063566057` | melhor squad tanque | `3000-01-01T00:00:00+00:00` |
| `752988da9308f78ce1da38343fefab2a` | melhor squad tanque | `3000-01-01T00:00:00+00:00` |
| `76561199846834210` | melhor squad tanque | `3000-01-01T00:00:00+00:00` |
| `76561198778168171` | melhor squad tanque | `3000-01-01T00:00:00+00:00` |
| `76561199422725281` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198282805840` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198199771875` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `d43b18221099259d5b46041e14a48701` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198306248694` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198197080405` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198077308932` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `7e7a80481bc46772eec3a562743b884b` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `4ab242096136c35d309c1a24d4f4872a` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `691196beeb84901b7660c087be275e98` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `ed3ae60de15b0ed81f496c01aa8af897` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561199065576507` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198350195377` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198302348831` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198105674771` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `5b1f711aab196d5dac7be874aef2bb95` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |
| `76561198409737364` | top jogadores da partida | `3000-01-01T00:00:00+00:00` |

Total: 24 VIPs permanentes criados pelo bot de performance.

## Status da correcao

Corrigido em `src/performanceBot.js`: o bot agora converte duracoes relativas como `1 day`, `24 hours` e `90 minutes` para timestamp ISO absoluto antes de chamar `add_vip`.

O bot tambem recusa valores que poderiam gerar VIP permanente por acidente: vazio, `none`, `null`, `never`, `permanent` e `forever`.
