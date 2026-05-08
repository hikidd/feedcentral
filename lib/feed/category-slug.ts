const CATEGORY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_CATEGORY_LENGTH = 100;

export function isValidFeedCategorySlug(category: string | null | undefined): category is string {
  return typeof category === 'string' && category.length <= MAX_CATEGORY_LENGTH && CATEGORY_PATTERN.test(category);
}
