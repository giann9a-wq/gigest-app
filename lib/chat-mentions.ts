export function hasChatMention(message: string, email: string) {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)@${escaped}(?=$|[\\s,!?;:)\\]]|\\.(?=$|\\s))`, "i").test(message);
}
