import assert from "node:assert/strict";
import { test } from "node:test";
import { hasChatMention } from "../lib/chat-mentions";

test("mentions match whole email tokens, including punctuation and mixed case", () => {
  for (const message of ["@mario@example.it", "Ciao @MARIO@example.it!", "Prima\n@mario@example.it, grazie", "(@other) @mario@example.it."]) {
    assert.equal(hasChatMention(message, "mario@example.it"), true, message);
  }
});
test("ordinary emails, substrings and regex characters cannot tag a different user", () => {
  for (const message of ["mario@example.it", "x@mario@example.it", "@mario@example.it.evil", "@mario@exampleXit", "@mario@example.itx"]) {
    assert.equal(hasChatMention(message, "mario@example.it"), false, message);
  }
  assert.equal(hasChatMention("@mario+team@example.it", "mario+team@example.it"), true);
  assert.equal(hasChatMention("@marioteam@example.it", "mario+team@example.it"), false);
});
