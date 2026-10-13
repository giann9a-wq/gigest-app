export function hasChatMention(message: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)@${escaped}(?=$|[\\s,!?;:)\\]]|\\.(?=$|\\s))`, "i").test(message);
}

export function chatMessageParts(message: string, mentions: { token: string; label: string }[]) {
  const parts: { text: string; mentioned: boolean }[] = [];
  const tokens = [...new Set(mentions.map((mention) => mention.token))].sort((a, b) => b.length - a.length);
  if (!tokens.length) return [{ text: message, mentioned: false }];
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(`(^|\\s)(${escaped})(?=$|[\\s,!?;:)\\]]|\\.(?=$|\\s))`, "gi");
  let cursor = 0;
  for (const match of message.matchAll(pattern)) {
    const start = match.index! + match[1].length;
    parts.push({ text: message.slice(cursor, start), mentioned: false });
    const mention = mentions.find((item) => item.token.toLowerCase() === match[2].toLowerCase())!;
    parts.push({ text: `@${mention.label}`, mentioned: true });
    cursor = start + match[2].length;
  }
  parts.push({ text: message.slice(cursor), mentioned: false });
  return parts;
}
