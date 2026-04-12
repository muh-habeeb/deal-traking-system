/*
  Warnings:

  - You are about to drop the column `kmDriven` on the `FilterConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "FilterConfig" DROP COLUMN "kmDriven",
ADD COLUMN     "kmDrivenMax" INTEGER,
ADD COLUMN     "kmDrivenMin" INTEGER;
