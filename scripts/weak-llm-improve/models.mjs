// Shared model registry for both weak-LLM eval entrypoints.
// Verify local ids against the live oMLX endpoint. `pi --list-models omlx` may
// retain a stale catalog; prompt frontmatter refers to the stable slug, not the
// provider id.

export const MODELS = Object.freeze([
  {
    slug: "local-omlx-qwen36-35b-a3b-4bit",
    model: "omlx/Qwen3.6-35B-A3B-4bit",
  },
  {
    slug: "openrouter-qwen3-coder-30b-a3b-instruct",
    model: "openrouter/qwen/qwen3-coder-30b-a3b-instruct",
  },
]);

export const MODEL_BY_SLUG = Object.freeze(Object.fromEntries(
  MODELS.map(({ slug, model }) => [slug, model]),
));
