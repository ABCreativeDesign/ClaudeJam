// claude-figjam/mcp-server/tests/tools.test.ts
import {
  createNodeSchema,
  createConnectorSchema,
  updateNodeSchema,
  deleteNodesSchema,
} from "../src/tools.js";

describe("createNodeSchema", () => {
  test("accepts sticky", () => {
    expect(
      createNodeSchema.safeParse({ type: "sticky", content: "Hello" }).success,
    ).toBe(true);
  });

  test("accepts shape with subtype", () => {
    expect(
      createNodeSchema.safeParse({
        type: "shape",
        shape: "diamond",
        content: "Decision?",
      }).success,
    ).toBe(true);
  });

  test("accepts table with rows/cols", () => {
    expect(
      createNodeSchema.safeParse({ type: "table", rows: 3, cols: 4 }).success,
    ).toBe(true);
  });

  test("accepts code_block", () => {
    expect(
      createNodeSchema.safeParse({
        type: "code_block",
        code: "const x = 1;",
        language: "typescript",
      }).success,
    ).toBe(true);
  });

  test("rejects unknown type", () => {
    expect(createNodeSchema.safeParse({ type: "banana" }).success).toBe(false);
  });

  test("rejects invalid shape subtype", () => {
    expect(
      createNodeSchema.safeParse({ type: "shape", shape: "hexagon" }).success,
    ).toBe(false);
  });
});

describe("createConnectorSchema", () => {
  test("accepts minimal valid params", () => {
    expect(
      createConnectorSchema.safeParse({ from_id: "a", to_id: "b" }).success,
    ).toBe(true);
  });

  test("accepts all optional params", () => {
    expect(
      createConnectorSchema.safeParse({
        from_id: "a",
        to_id: "b",
        style: "curved",
        label: "yes",
        arrow: "both",
      }).success,
    ).toBe(true);
  });

  test("rejects missing from_id", () => {
    expect(createConnectorSchema.safeParse({ to_id: "b" }).success).toBe(false);
  });

  test("rejects invalid arrow value", () => {
    expect(
      createConnectorSchema.safeParse({
        from_id: "a",
        to_id: "b",
        arrow: "diagonal",
      }).success,
    ).toBe(false);
  });
});

describe("updateNodeSchema", () => {
  test("accepts node_id with any subset of optional fields", () => {
    expect(
      updateNodeSchema.safeParse({ node_id: "abc", content: "New text" })
        .success,
    ).toBe(true);
  });

  test("rejects missing node_id", () => {
    expect(updateNodeSchema.safeParse({ content: "New text" }).success).toBe(
      false,
    );
  });
});

describe("deleteNodesSchema", () => {
  test("accepts single string ID", () => {
    expect(deleteNodesSchema.safeParse({ node_ids: "abc" }).success).toBe(true);
  });

  test("accepts array of IDs", () => {
    expect(
      deleteNodesSchema.safeParse({ node_ids: ["abc", "def"] }).success,
    ).toBe(true);
  });

  test("rejects missing node_ids", () => {
    expect(deleteNodesSchema.safeParse({}).success).toBe(false);
  });
});
