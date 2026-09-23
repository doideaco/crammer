import { describe, expect, it } from "vitest";
import { ConsoleMailer, readyEmail } from "../email.js";

describe("readyEmail", () => {
  it("names the video and links to it", () => {
    const message = readyEmail({
      topic: "The Houthis and the war in Yemen",
      title: "The Houthis and the War in Yemen",
      url: "https://example.com/videos/abc",
    });

    expect(message.subject).toContain("The Houthis and the War in Yemen");
    expect(message.text).toContain("https://example.com/videos/abc");
    expect(message.html).toContain("https://example.com/videos/abc");
  });

  it("escapes the topic, which is user input going into HTML", () => {
    const message = readyEmail({
      topic: '<img src=x onerror="alert(1)">',
      title: "Test",
      url: "https://example.com",
    });

    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img");
  });
});

describe("ConsoleMailer", () => {
  it("records what it would have sent", async () => {
    const mailer = new ConsoleMailer();
    await mailer.send({ to: "a@b.co", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    expect(mailer.sent).toEqual([{ to: "a@b.co", subject: "Hi" }]);
  });
});
