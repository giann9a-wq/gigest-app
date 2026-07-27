ALTER TABLE "User"
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "chatLastReadAt" TIMESTAMP(3);

CREATE TABLE "AppChatMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AppChatMessage_createdAt_idx" ON "AppChatMessage"("createdAt");
CREATE INDEX "AppChatMessage_senderId_createdAt_idx" ON "AppChatMessage"("senderId", "createdAt");

ALTER TABLE "AppChatMessage"
ADD CONSTRAINT "AppChatMessage_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
