import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMessageParts, hasChatMention } from "../lib/chat-mentions";

test("mentions match whole email tokens, including punctuation and mixed case", () => {
  for (const message of ["@mario@example.it", "Ciao @MARIO@example.it!", "Prima\n@mario@example.it, grazie", "(@other) @mario@example.it."]) {
    assert.equal(hasChatMention(message, "mario@example.it"), true, message);
  }
});

test("full names stay highlighted and historical email tags display the user's name", () => {
  const mentions = [
    { token: "@tecnico.giani@gmail.com", label: "Stefano Giani" },
    { token: "@Mario Rossi", label: "Mario Rossi" },
  ];
  const parts = chatMessageParts("Ciao @tecnico.giani@gmail.com, chiedi a @Mario Rossi!", mentions);
  assert.equal(parts.map((part) => part.text).join(""), "Ciao @Stefano Giani, chiedi a @Mario Rossi!");
  assert.deepEqual(parts.filter((part) => part.mentioned).map((part) => part.text), ["@Stefano Giani", "@Mario Rossi"]);
  assert.equal(hasChatMention("Ciao @Mario Rossi!", "Mario Rossi"), true);
  assert.equal(hasChatMention("Ciao @Mario Rossini!", "Mario Rossi"), false);
  assert.equal(chatMessageParts("@Mario Rossini", mentions).some((part) => part.mentioned), false);
});
test("ordinary emails, substrings and regex characters cannot tag a different user", () => {
  for (const message of ["mario@example.it", "x@mario@example.it", "@mario@example.it.evil", "@mario@exampleXit", "@mario@example.itx"]) {
    assert.equal(hasChatMention(message, "mario@example.it"), false, message);
  }
  assert.equal(hasChatMention("@mario+team@example.it", "mario+team@example.it"), true);
  assert.equal(hasChatMention("@marioteam@example.it", "mario+team@example.it"), false);
});
