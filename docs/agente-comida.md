# Comida — estoque, pratos, compras e calorias

A tela é `/comida`. Ela mostra o dia de hoje, a lista aberta, o estoque e os pratos. Quem grava é o agente. A tela só marca **Comprado** (não mexe no estoque) e **Montar lista do que está baixo**. Quando a caloria veio da TACO, a tela mostra o nome da linha e as kcal por 100 g, para a pessoa conferir se o alimento certo foi escolhido.

Unidades: `g`, `ml`, `un`. Quantidade é um número (até 3 casas). `1.5` un é um e meio.

## Caloria — tabela TACO

A fonte é a TACO, 4ª edição (NEPA/UNICAMP), energia por 100 g da porção comestível. A tabela está no código (`lib/domain/food/taco-table.ts`); não há consulta externa. Linha sem energia publicada (leite de vaca integral, entre outras) não entra — não invente o número.

Não pergunte caloria. Não chute.

- `buscar_taco` (ou `GET /api/agent/food/taco?q=`) devolve `stock` (o usual cru), `dish` (o usual cozido) e `candidates`.
- `definir_alimento` casa o nome sozinho. Se não houver uma linha clara, a resposta traz `taco_candidates` e a caloria fica vazia. Escolha a mais próxima e chame de novo com `taco_id`.
- O mesmo vale para o ingrediente de `definir_prato`.
- Um número que a pessoa falou (`kcal_per_100`, `kcal_each` ou `kcal` da linha) ganha da tabela. Não mande número que ela não falou.
- `ml` usa o valor por 100 g como se fosse por 100 ml. É aproximação (óleo erra cerca de 10%).
- Peça com peso conhecido: pão francês 50 g, banana prata 75 g, ovo de codorna 10 g, ovo de galinha inteiro 45 g (frito 50 g). O resto em `un` (carne, queijo, frango) não ganha caloria: grave em gramas.
- O prato só tem `kcal_per_serving` quando nenhuma linha está sem número. É o total dividido pelas `servings`.
- Sem prato, `registrar_refeicao` leva o `kcal` calculado da TACO (por 100 g, ou `piece_grams` × quantidade).

### O usual, quando o nome é uma palavra só

| Palavra | Estoque | Prato |
| --- | --- | --- |
| arroz | tipo 1, cru (358 kcal) | tipo 1, cozido (128 kcal) |
| feijão | carioca, cru | carioca, cozido |
| ovo | galinha, inteiro, cru | galinha, inteiro, cozido |
| óleo | soja (884 kcal) | soja |
| açúcar | refinado | refinado |
| pão | francês | francês |
| batata | inglesa, crua | inglesa, cozida |
| frango | peito sem pele, cru | peito sem pele, cozido |
| café | pó, torrado | infusão |

Um nome exato ganha desse padrão: "arroz integral cozido" é a linha 1, não o tipo 1. "banana" não escolhe variedade. "banana prata" escolhe.

## Estoque baixo

`min_quantity` é o ponto de compra. No mínimo ou abaixo, o item está baixo. A lista leva a diferença até o mínimo. Se já está exatamente no mínimo, entra o nome, sem quantidade. Item que já está na lista aberta não entra de novo.

`marcar_compra` com `restock: true` soma a quantidade da linha no alimento ligado, uma vez. Sem quantidade, o estoque não muda. O botão **Comprado** da tela nunca soma.

## Refeição

`registrar_refeicao` com `dish_id` multiplica a caloria por porção pelas `servings` comidas (padrão 1, pode ser `1.5`). Se o prato está incompleto, complete o ingrediente com `taco_id` antes, ou passe o `kcal` só se a pessoa falou o número. `eaten_on` não pode ser um dia futuro. `family_member_id` diz quem comeu; sem ele, a refeição fica "Sem pessoa".

`anular_refeicao` tira a refeição do dia e libera a `external_key`. A linha continua no banco.

## Ferramentas

| Ferramenta | Faz |
| --- | --- |
| `ver_comida` | `view`: `estoque`, `pratos`, `compras`, `calorias`. `ref` lê um. `date` nas calorias. |
| `buscar_taco` | `q` é o nome. Não grava. |
| `definir_alimento` | cria, ou corrige quando vai `id` (uuid ou slug). `taco_id` quando o nome não bastou |
| `definir_prato` | cria com `ingredients`, ou troca os ingredientes no `id` |
| `adicionar_compra` | uma linha. `name` ou `food_item_id` |
| `gerar_lista` | o que está baixo |
| `marcar_compra` | `id` da linha. `restock` opcional |
| `registrar_refeicao` | o que foi comido |
| `anular_refeicao` | `meal_id` |

As rotas REST equivalentes estão em `/api/agent/food/`. `external_key` repetida devolve o primeiro registro. A migration `013_food_taco` grava qual linha da TACO foi usada (`012_food` cria as tabelas).

Fonte dos pesos de uma peça: medidas POF/IBGE, só onde uma peça é óbvia. A tabela em si veio da compilação pública da TACO 4ª edição.
