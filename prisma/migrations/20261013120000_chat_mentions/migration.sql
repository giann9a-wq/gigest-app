CREATE TABLE "AppChatMention" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "AppChatMention_pkey" PRIMARY KEY ("messageId", "userId")
);
CREATE INDEX "AppChatMention_userId_readAt_idx" ON "AppChatMention"("userId", "readAt");
ALTER TABLE "AppChatMention" ADD CONSTRAINT "AppChatMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AppChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppChatMention" ADD CONSTRAINT "AppChatMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
