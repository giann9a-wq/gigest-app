CREATE TABLE "QuoteTextSection" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteTextSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteTextSection_quoteId_sortOrder_idx" ON "QuoteTextSection"("quoteId", "sortOrder");

ALTER TABLE "QuoteTextSection"
ADD CONSTRAINT "QuoteTextSection_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
