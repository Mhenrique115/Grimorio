-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Admin', 'Mestre', 'Jogador');

-- CreateEnum
CREATE TYPE "TipoCampo" AS ENUM ('Fixo', 'Calculado', 'Checkbox', 'Textarea');

-- CreateEnum
CREATE TYPE "CategoriaCampo" AS ENUM ('Caracteristica', 'Habilidade', 'Inventario', 'Lore', 'Status');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'Jogador',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "nome_personagem" TEXT NOT NULL,
    "data_nascimento" DATE,
    "idade" INTEGER,
    "residencia" TEXT,
    "classe" TEXT,
    "nome_jogador" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fichas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_campos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tipo" "TipoCampo" NOT NULL,
    "categoria" "CategoriaCampo" NOT NULL,
    "formula_logica" TEXT,
    "descricao" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_campos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "valores_campo" (
    "id" UUID NOT NULL,
    "ficha_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "valor_base" INTEGER,
    "valor_metade" INTEGER,
    "valor_quinto" INTEGER,
    "valor_texto" TEXT,
    "valor_booleano" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "valores_campo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "fichas_user_id_idx" ON "fichas"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_campos_nome_key" ON "template_campos"("nome");

-- CreateIndex
CREATE INDEX "template_campos_tipo_idx" ON "template_campos"("tipo");

-- CreateIndex
CREATE INDEX "template_campos_categoria_idx" ON "template_campos"("categoria");

-- CreateIndex
CREATE INDEX "valores_campo_ficha_id_idx" ON "valores_campo"("ficha_id");

-- CreateIndex
CREATE INDEX "valores_campo_template_id_idx" ON "valores_campo"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "valores_campo_ficha_id_template_id_key" ON "valores_campo"("ficha_id", "template_id");

-- AddForeignKey
ALTER TABLE "fichas" ADD CONSTRAINT "fichas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valores_campo" ADD CONSTRAINT "valores_campo_ficha_id_fkey" FOREIGN KEY ("ficha_id") REFERENCES "fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "valores_campo" ADD CONSTRAINT "valores_campo_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "template_campos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
