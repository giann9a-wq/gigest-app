-- CreateTable
CREATE TABLE "AdminPanelCredential" (
    "key" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordSalt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminPanelCredential_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "AdminPanelSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminPanelSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminPanelSession_tokenHash_key" ON "AdminPanelSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminPanelSession_userId_expiresAt_idx" ON "AdminPanelSession"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "AdminPanelSession" ADD CONSTRAINT "AdminPanelSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
