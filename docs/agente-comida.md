# Comida — estoque, pratos, compras e calorias

A tela é `/comida`. Ela mostra o dia de hoje, a lista aberta, o estoque e os pratos. Quem grava é o agente. A tela só marca **Comprado** (não mexe no estoque) e **Montar lista do que está baixo**.

Unidades: `g`, `ml`, `un`. Quantidade é um número (até 3 casas). `1.5` un é um e meio.

## Caloria

Não invente número.

- Alimento em `g` ou `ml`: `kcal_per_100` (o rótulo, por 100). `kcal_each` é recusado.
- Alimento em `un`: `kcal_each` (uma peça). `kcal_per_100` é recusado.
- Ingrediente com `kcal` usa esse total para a quantidade da linha.
- Sem `kcal`, e com `food_item_id` na mesma unidade, a conta sai do estoque.
- Unidade diferente, ou alimento sem caloria: a linha fica sem número.
- O prato só tem `kcal_per_serving` quando nenhuma linha está sem número. É o total dividido pelas `servings` (porções que a receita rende).

## Estoque baixo

`min_quantity` é o ponto de compra. No mínimo ou abaixo, o item está baixo. A lista leva a diferença até o mínimo. Se já está exatamente no mínimo, entra o nome, sem quantidade. Item que já está na lista aberta não entra de novo.

`marcar_compra` com `restock: true` soma a quantidade da linha no alimento ligado, uma vez. Sem quantidade, o estoque não muda. O botão **Comprado** da tela nunca soma.

## Refeição

`registrar_refeicao` com `dish_id` multiplica a caloria por porção pelas `servings` comidas (padrão 1, pode ser `1.5`). Se o prato está incompleto, passe o `kcal` que a pessoa disse ou complete o prato antes. Sem prato, `title` e `kcal` são obrigatórios. `eaten_on` não pode ser um dia futuro. `family_member_id` diz quem comeu; sem ele, a refeição fica "Sem pessoa".

`anular_refeicao` tira a refeição do dia e libera a `external_key`. A linha continua no banco.

## Ferramentas

| Ferramenta | Faz |
| --- | --- |
| `ver_comida` | `view`: `estoque`, `pratos`, `compras`, `calorias`. `ref` lê um. `date` nas calorias. |
| `definir_alimento` | cria, ou corrige quando vai `id` (uuid ou slug) |
| `definir_prato` | cria com `ingredients`, ou troca os ingredientes no `id` |
| `adicionar_compra` | uma linha. `name` ou `food_item_id` |
| `gerar_lista` | o que está baixo |
| `marcar_compra` | `id` da linha. `restock` opcional |
| `registrar_refeicao` | o que foi comido |
| `anular_refeicao` | `meal_id` |

As rotas REST equivalentes estão em `/api/agent/food/`. `external_key` repetida devolve o primeiro registro.
