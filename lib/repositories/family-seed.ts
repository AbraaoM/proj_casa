import type { Statement } from "@/lib/db/client";

/** Starting data of a new family: where the house is (editable by the agent) and the default finance categories. */
export const DEFAULT_FAMILY_LOCATION = {
  city: "São Paulo",
  region: "SP",
  country: "BR",
  latitude: -23.5505,
  longitude: -46.6333,
  timezone: "America/Sao_Paulo",
} as const;

/** Keep in sync with db/migrations/005_finance.sql (a test checks the original family and a new one match). */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ slug: string; name: string; kind: "expense" | "income"; sort: number }> = [
  { slug: "moradia", name: "Moradia", kind: "expense", sort: 10 },
  { slug: "alimentacao", name: "Alimentação", kind: "expense", sort: 20 },
  { slug: "transporte", name: "Transporte", kind: "expense", sort: 30 },
  { slug: "pets", name: "Pets", kind: "expense", sort: 40 },
  { slug: "saude", name: "Saúde", kind: "expense", sort: 50 },
  { slug: "casa", name: "Casa", kind: "expense", sort: 60 },
  { slug: "educacao", name: "Educação", kind: "expense", sort: 70 },
  { slug: "lazer", name: "Lazer", kind: "expense", sort: 80 },
  { slug: "assinaturas", name: "Assinaturas", kind: "expense", sort: 90 },
  { slug: "impostos_taxas", name: "Impostos e taxas", kind: "expense", sort: 100 },
  { slug: "outros", name: "Outros", kind: "expense", sort: 110 },
  { slug: "salario", name: "Salário", kind: "income", sort: 10 },
  { slug: "renda_extra", name: "Renda extra", kind: "income", sort: 20 },
  { slug: "reembolso", name: "Reembolso", kind: "income", sort: 30 },
  { slug: "outras_receitas", name: "Outras receitas", kind: "income", sort: 40 },
];

export const DEFAULT_SUBCATEGORIES: ReadonlyArray<{ slug: string; name: string; parent: string; sort: number }> = [
  { slug: "aluguel", name: "Aluguel ou financiamento", parent: "moradia", sort: 1 },
  { slug: "condominio", name: "Condomínio", parent: "moradia", sort: 2 },
  { slug: "energia", name: "Energia", parent: "moradia", sort: 3 },
  { slug: "agua", name: "Água", parent: "moradia", sort: 4 },
  { slug: "gas", name: "Gás", parent: "moradia", sort: 5 },
  { slug: "internet", name: "Internet e telefone", parent: "moradia", sort: 6 },
  { slug: "mercado", name: "Mercado", parent: "alimentacao", sort: 1 },
  { slug: "restaurante", name: "Restaurante e delivery", parent: "alimentacao", sort: 2 },
  { slug: "combustivel", name: "Combustível", parent: "transporte", sort: 1 },
  { slug: "carro_manutencao", name: "Manutenção do carro", parent: "transporte", sort: 2 },
  { slug: "carro_impostos_seguro", name: "IPVA, licenciamento e seguro", parent: "transporte", sort: 3 },
  { slug: "transporte_app", name: "Aplicativo e ônibus", parent: "transporte", sort: 4 },
  { slug: "pets_racao", name: "Ração", parent: "pets", sort: 1 },
  { slug: "pets_saude", name: "Saúde dos pets", parent: "pets", sort: 2 },
  { slug: "pets_banho", name: "Banho e tosa", parent: "pets", sort: 3 },
  { slug: "saude_consulta", name: "Consultas e exames", parent: "saude", sort: 1 },
  { slug: "saude_farmacia", name: "Farmácia", parent: "saude", sort: 2 },
  { slug: "saude_plano", name: "Plano de saúde", parent: "saude", sort: 3 },
  { slug: "casa_manutencao", name: "Manutenção da casa", parent: "casa", sort: 1 },
  { slug: "casa_limpeza", name: "Limpeza", parent: "casa", sort: 2 },
];

/** Run on the owner connection inside the sign-up transaction: every row names its family. */
export function familySeedStatements(familyId: string): Statement[] {
  const place = DEFAULT_FAMILY_LOCATION;
  return [
    {
      text: `INSERT INTO household_settings (family_id, city, region, country, latitude, longitude, timezone)
             VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
      params: [familyId, place.city, place.region, place.country, place.latitude, place.longitude, place.timezone],
    },
    {
      text: `INSERT INTO fin_categories (family_id, slug, name, kind, sort_order)
             SELECT $1::uuid, c.slug, c.name, c.kind, c.sort
             FROM jsonb_to_recordset($2::jsonb) AS c (slug text, name text, kind text, sort int)`,
      params: [familyId, JSON.stringify(DEFAULT_CATEGORIES)],
    },
    {
      text: `INSERT INTO fin_categories (family_id, slug, name, kind, parent_id, sort_order)
             SELECT $1::uuid, c.slug, c.name, 'expense', p.id, c.sort
             FROM jsonb_to_recordset($2::jsonb) AS c (slug text, name text, parent text, sort int)
             JOIN fin_categories p ON p.family_id = $1::uuid AND p.slug = c.parent`,
      params: [familyId, JSON.stringify(DEFAULT_SUBCATEGORIES)],
    },
  ];
}
