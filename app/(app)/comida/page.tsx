import { BackLink } from "@/components/history/back-link";
import { PageNotice } from "@/components/history/page-notice";
import { ListSearch } from "@/components/ui/list-search";
import { buyFoodAction, fillShoppingAction } from "@/lib/food/actions";
import { formatQuantity, type Expiry } from "@/lib/domain/food";
import { tacoById } from "@/lib/domain/food/taco";
import { withDatabase } from "@/lib/services/subject-pages";
import { loadFoodBoard } from "@/lib/services/food";
import { formatDate } from "@/lib/ui/format";
import { matchesSearch, searchQuery } from "@/lib/ui/search";

export const dynamic = "force-dynamic";

const BUTTON =
  "inline-flex min-h-11 items-center rounded-md border border-black px-3 text-sm transition-colors duration-300 hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent dark:border-white dark:hover:bg-white dark:hover:text-black";

function expiryLabel(expiry: Expiry, date: string | null): string | null {
  if (expiry === "expired") return "vencido";
  if (expiry === "soon") return date ? `vence ${formatDate(date)}` : "vence em breve";
  if (expiry === "ok" && date) return `val. ${formatDate(date)}`;
  return null;
}

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = searchQuery((await searchParams).q);
  const page = await withDatabase(async (sql, today) => loadFoodBoard(sql, today));
  if (page.status !== "ready") return <PageNotice status={page.status} />;
  const { stock, dishes, shopping, day, low_to_list } = page.data;
  const visibleStock = stock.filter((item) => matchesSearch(query, [item.name, item.unit]));
  const visibleDishes = dishes.filter((dish) => matchesSearch(query, [dish.name, ...dish.ingredients.map((line) => line.name)]));
  const visibleShopping = shopping.filter((line) => matchesSearch(query, [line.name, line.unit]));
  const visibleMeals = day.meals.filter((meal) => matchesSearch(query, [meal.title, meal.person]));
  const people = day.by_person.filter((row) => matchesSearch(query, [row.person]));
  const searchable = stock.length + dishes.length + shopping.length + day.meals.length > 0;
  const empty = !searchable;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 md:max-w-5xl md:px-10 md:py-12">
      <BackLink href="/" label="Painel" />
      <h1 className="mt-6 font-display text-5xl leading-none tracking-tight md:text-6xl">Comida</h1>
      <p className="mt-3 max-w-md text-base text-ink-muted">
        Estoque, pratos, lista de compras e as calorias de hoje. Quem grava é o seu agente. A caloria vem da tabela TACO, pelo nome do alimento.
      </p>
      {searchable ? <ListSearch action="/comida" query={query} placeholder="Buscar alimento, prato ou compra" /> : null}

      {empty ? (
        <p className="mt-8 max-w-md border-l-2 border-accent pl-3 text-sm text-ink-muted">
          Nada na cozinha ainda. Peça ao seu agente para cadastrar o estoque, um prato ou a lista de compras.
        </p>
      ) : null}

      <section className="mt-12" aria-labelledby="calorias">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="calorias" className="text-xs uppercase tracking-wider text-ink-muted">Calorias de hoje</h2>
          <p className="text-sm text-ink-faint">{query ? "" : `${day.total_kcal} kcal`}</p>
        </div>
        {visibleMeals.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{query ? "Nada com essa busca." : "Nenhuma refeição hoje."}</p>
        ) : (
          <>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {(query ? people : day.by_person).map((row) => (
                <li key={row.family_member_id ?? "casa"} className="text-sm">
                  <span className="text-ink-muted">{row.person ?? "Sem pessoa"}</span>{" "}
                  <span className="tabular-nums">{row.kcal} kcal</span>
                </li>
              ))}
            </ul>
            <ul className="mt-4 divide-y divide-line dark:divide-line-dark">
              {visibleMeals.map((meal) => (
                <li key={meal.id} className="flex min-h-11 items-baseline justify-between gap-4 py-3">
                  <span>
                    {meal.title}
                    {meal.person ? <span className="text-ink-muted"> · {meal.person}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm text-ink-muted">{meal.kcal} kcal</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-14" aria-labelledby="compras">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="compras" className="text-xs uppercase tracking-wider text-ink-muted">Compras</h2>
          <p className="text-sm text-ink-faint">{visibleShopping.length}</p>
        </div>
        {low_to_list > 0 && !query ? (
          <form action={fillShoppingAction} className="mt-4">
            <button type="submit" className={BUTTON}>
              Montar lista do que está baixo
            </button>
          </form>
        ) : null}
        {visibleShopping.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{query ? "Nada com essa busca." : "A lista está vazia."}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line dark:divide-line-dark">
            {visibleShopping.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-4 py-3">
                <span className="min-w-0">
                  {line.name}
                  {line.quantity_milli !== null && line.unit ? <span className="text-ink-muted"> · {formatQuantity(line.quantity_milli, line.unit)}</span> : null}
                </span>
                <form action={buyFoodAction}>
                  <input type="hidden" name="id" value={line.id} />
                  <button type="submit" className={BUTTON}>
                    Comprado
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-14 grid gap-14 md:grid-cols-2 md:gap-x-12">
        <section aria-labelledby="estoque">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="estoque" className="text-xs uppercase tracking-wider text-ink-muted">Estoque</h2>
            <p className="text-sm text-ink-faint">{visibleStock.length}</p>
          </div>
          {visibleStock.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">{query ? "Nada com essa busca." : "Nenhum alimento no estoque."}</p>
          ) : (
            <ul className="mt-4">
              {visibleStock.map((item) => {
                const when = expiryLabel(item.expiry, item.expires_on);
                const taco = item.taco_id ? tacoById(item.taco_id) : null;
                return (
                  <li key={item.id} className={`border-t border-line py-3 dark:border-line-dark ${item.low || item.expiry === "expired" ? "border-l-2 border-l-accent pl-3" : ""}`}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span>{item.name}</span>
                      <span className="shrink-0 tabular-nums text-sm text-ink-muted">{formatQuantity(item.quantity_milli, item.unit)}</span>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {item.low ? "no mínimo ou abaixo" : "ok"}
                      {item.shortfall_milli ? ` · faltam ${formatQuantity(item.shortfall_milli, item.unit)}` : ""}
                      {when ? ` · ${when}` : ""}
                    </p>
                    {taco ? <p className="mt-1 text-sm text-ink-faint">TACO · {taco.name} · {taco.kcal_per_100} kcal/100 g</p> : null}
                    {item.unit === "un" && item.kcal_each === null ? <p className="mt-1 text-sm text-ink-faint">Sem peso de uma peça. Peça em gramas.</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="pratos">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="pratos" className="text-xs uppercase tracking-wider text-ink-muted">Pratos</h2>
            <p className="text-sm text-ink-faint">{visibleDishes.length}</p>
          </div>
          {visibleDishes.length === 0 ? (
            <p className="mt-4 text-sm text-ink-muted">{query ? "Nada com essa busca." : "Nenhum prato."}</p>
          ) : (
            <ul className="mt-4">
              {visibleDishes.map((dish) => {
                const tacoNames = dish.ingredients.flatMap((line) => {
                  const food = line.taco_id ? tacoById(line.taco_id) : null;
                  return food ? [food.name] : [];
                });
                return (
                  <li key={dish.id} className="border-t border-line py-3 dark:border-line-dark">
                    <div className="flex items-baseline justify-between gap-4">
                      <span>{dish.name}</span>
                      <span className="shrink-0 text-sm text-ink-muted">
                        {dish.kcal_per_serving === null ? "calorias incompletas" : `${dish.kcal_per_serving} kcal`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-muted">
                      {dish.servings} {dish.servings === 1 ? "porção" : "porções"} · {dish.ingredients.length} {dish.ingredients.length === 1 ? "ingrediente" : "ingredientes"}
                    </p>
                    {tacoNames.length > 0 ? <p className="mt-1 text-sm text-ink-faint">TACO · {tacoNames.join(" · ")}</p> : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
