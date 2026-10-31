-- Real payment checkout link. Separate from Payment/PaymentAttempt (confirmed events only).
CREATE TABLE "PayosCheckout" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "orderCode" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "checkoutUrl" TEXT,
    "paymentLinkId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayosCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayosCheckout_orderId_key" ON "PayosCheckout"("orderId");
CREATE UNIQUE INDEX "PayosCheckout_orderCode_key" ON "PayosCheckout"("orderCode");
CREATE UNIQUE INDEX "PayosCheckout_paymentLinkId_key" ON "PayosCheckout"("paymentLinkId");
ALTER TABLE "PayosCheckout"
  ADD CONSTRAINT "PayosCheckout_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
