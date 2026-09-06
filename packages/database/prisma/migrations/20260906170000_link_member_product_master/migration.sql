ALTER TABLE "member_product_profiles" ADD COLUMN "product_pack_id" UUID;

CREATE INDEX "member_product_profiles_product_pack_id_updated_at_idx"
ON "member_product_profiles"("product_pack_id", "updated_at");

ALTER TABLE "member_product_profiles"
ADD CONSTRAINT "member_product_profiles_product_pack_id_fkey"
FOREIGN KEY ("product_pack_id") REFERENCES "product_packs"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
