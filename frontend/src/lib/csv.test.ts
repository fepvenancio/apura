import { describe, it, expect } from "vitest";
import { generateCsv } from "./csv";

describe("generateCsv", () => {
  it("generates basic CSV with header and rows", () => {
    const columns = [
      { name: "A", type: "text" },
      { name: "B", type: "number" },
    ];
    const rows = [
      { A: "hello", B: 1 },
      { A: "world", B: 2 },
    ];
    expect(generateCsv(columns, rows)).toBe("A,B\nhello,1\nworld,2");
  });

  it("escapes values containing commas", () => {
    const columns = [{ name: "val", type: "text" }];
    const rows = [{ val: "has,comma" }];
    expect(generateCsv(columns, rows)).toBe('val\n"has,comma"');
  });

  it("escapes values containing double quotes", () => {
    const columns = [{ name: "val", type: "text" }];
    const rows = [{ val: 'say "hi"' }];
    expect(generateCsv(columns, rows)).toBe('val\n"say ""hi"""');
  });

  it("escapes values containing newlines", () => {
    const columns = [{ name: "val", type: "text" }];
    const rows = [{ val: "line1\nline2" }];
    expect(generateCsv(columns, rows)).toBe('val\n"line1\nline2"');
  });

  it("converts null and undefined to empty string", () => {
    const columns = [
      { name: "a", type: "text" },
      { name: "b", type: "text" },
    ];
    const rows = [{ a: null, b: undefined }];
    expect(generateCsv(columns, rows)).toBe("a,b\n,");
  });

  it("handles empty rows array", () => {
    const columns = [
      { name: "x", type: "text" },
      { name: "y", type: "number" },
    ];
    expect(generateCsv(columns, [])).toBe("x,y");
  });

  it("handles multiple special characters in one value", () => {
    const columns = [{ name: "val", type: "text" }];
    const rows = [{ val: 'a,b\n"c"' }];
    expect(generateCsv(columns, rows)).toBe('val\n"a,b\n""c"""');
  });
});
