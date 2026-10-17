import type { Sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import type { FinCategory } from "@/lib/domain/finance/types";
import type { CategoryInput, CategoryPatch } from "@/lib/domain/finance/validate";
import { notFound, validationError } from "@/lib/errors";
import * as repo from "@/lib/repositories/finance";

export async function listCategories(sql: Sql, includeArchived = false): Promise<FinCategory[]> {
  return repo.listCategories(sql, includeArchived);
}

export async function getCategory(sql: Sql, ref: string): Promise<FinCategory> {
  const category = await repo.getCategoryByRef(sql, ref);
  if (!category) throw notFound("Category was not found.");
  return category;
}

/** Two levels at most: a subcategory's parent is a top-level category of the same kind. */
async function resolveParent(sql: Sql, ref: string, kind: FinCategory["kind"] | null, selfId?: string) {
  const parent = await repo.getCategoryByRef(sql, ref);
  if (!parent) throw validationError("parent was not found.", [{ field: "parent", message: "was not found" }]);
  if (parent.id === selfId) throw validationError("parent cannot be itself.", [{ field: "parent", message: "cannot be itself" }]);
  if (parent.parent_id) {
    throw validationError("parent must be a top-level category.", [{ field: "parent", message: "must be a top-level category" }]);
  }
  if (kind && parent.kind !== kind) {
    throw validationError("parent has another kind.", [{ field: "parent", message: `must be an ${kind} category` }]);
  }
  return parent;
}

export async function createCategory(sql: Sql, input: CategoryInput) {
  const existing = await repo.getCategoryByRef(sql, input.slug);
  if (existing) return { category: existing, idempotentReplay: true };
  const parent = input.parent ? await resolveParent(sql, input.parent, input.kind) : null;
  const kind = parent?.kind ?? input.kind;
  if (!kind) throw validationError("kind is required.", [{ field: "kind", message: "is required" }]);
  try {
    const category = await repo.insertCategory(sql, {
      slug: input.slug, name: input.name, kind, parent_id: parent?.id ?? null, sort_order: input.sort_order,
    });
    return { category, idempotentReplay: false };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await repo.getCategoryByRef(sql, input.slug);
      if (raced) return { category: raced, idempotentReplay: true };
    }
    throw error;
  }
}

export async function updateCategory(sql: Sql, ref: string, patch: CategoryPatch): Promise<FinCategory> {
  const current = await getCategory(sql, ref);
  let parentId: string | null | undefined;
  if (patch.parent !== undefined) {
    if (patch.parent === null) parentId = null;
    else {
      if ((await repo.countCategoryChildren(sql, current.id)) > 0) {
        throw validationError("A category with subcategories cannot get a parent.", [
          { field: "parent", message: "category has subcategories" },
        ]);
      }
      parentId = (await resolveParent(sql, patch.parent, current.kind, current.id)).id;
    }
  }
  const category = await repo.updateCategory(sql, current.id, {
    name: patch.name, parent_id: parentId, sort_order: patch.sort_order, archived: patch.archived,
  });
  if (!category) throw notFound("Category was not found.");
  return category;
}
