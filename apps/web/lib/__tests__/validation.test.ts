import { describe, expect, it } from "vitest";
import { CreateVideoInput, EmailInput, TopicInput, firstIssue } from "../validation";

describe("TopicInput", () => {
  it("accepts a real topic", () => {
    expect(TopicInput.parse("  The Houthis and the war in Yemen  ")).toBe(
      "The Houthis and the war in Yemen",
    );
  });

  it("rejects a single word, which costs money and makes a vague video", () => {
    expect(TopicInput.safeParse("Yemen").success).toBe(false);
  });

  it("rejects an essay", () => {
    expect(TopicInput.safeParse("x".repeat(400)).success).toBe(false);
  });
});

describe("CreateVideoInput", () => {
  it("defaults the level", () => {
    const parsed = CreateVideoInput.parse({ topic: "Why the Suez Canal matters" });
    expect(parsed.level).toBe("beginner");
  });

  it("rejects a level that is not one of ours", () => {
    expect(
      CreateVideoInput.safeParse({ topic: "Why the Suez Canal matters", level: "expert" }).success,
    ).toBe(false);
  });

  it("rejects a parent id that is not a uuid", () => {
    expect(
      CreateVideoInput.safeParse({
        topic: "Why the Suez Canal matters",
        parentVideoId: "../../etc/passwd",
      }).success,
    ).toBe(false);
  });
});

describe("EmailInput", () => {
  it("rejects something that is not an address", () => {
    expect(EmailInput.safeParse("not-an-email").success).toBe(false);
    expect(EmailInput.safeParse("a@b.co").success).toBe(true);
  });
});

describe("firstIssue", () => {
  it("returns a sentence a form can show", () => {
    const result = TopicInput.safeParse("no");
    expect(result.success).toBe(false);
    if (!result.success) expect(firstIssue(result.error)).toMatch(/more detail/);
  });
});
