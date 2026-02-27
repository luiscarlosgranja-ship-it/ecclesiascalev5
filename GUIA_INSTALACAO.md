# 📖 Guia de Instalação para Leigos — EcclesiaScale

> Este guia foi feito para quem nunca programou. Siga o passo a passo com calma!

---

## 📋 O que você vai precisar instalar

Antes de começar, você precisará de 3 programas gratuitos no seu computador:

### 1. Node.js (o motor que roda o sistema)
1. Acesse: **https://nodejs.org**
2. Clique no botão verde **"LTS"** (versão recomendada)
3. Execute o arquivo baixado e clique **"Avançar"** em tudo
4. ✅ Pronto! Para verificar, abra o **Prompt de Comando** (Windows) ou **Terminal** (Mac) e digite:
   ```
   node --version
   ```
   Deve aparecer algo como `v22.0.0`

### 2. Git (para salvar e enviar seu código)
1. Acesse: **https://git-scm.com/downloads**
2. Baixe a versão para seu sistema
3. Execute e clique **"Avançar"** em tudo (deixe as opções padrão)
4. ✅ Para verificar, no Terminal/Prompt:
   ```
   git --version
   ```

### 3. Visual Studio Code (para editar arquivos, opcional mas recomendado)
1. Acesse: **https://code.visualstudio.com**
2. Baixe e instale normalmente

---

## 🚀 Parte 1 — Configurar o GitHub (Repositório de Código)

O GitHub é como um "cofre na nuvem" para guardar seu código.

### Criar conta no GitHub
1. Acesse **https://github.com**
2. Clique **"Sign up"** e crie uma conta gratuita

### Criar seu repositório (pasta do projeto)
1. Faça login no GitHub
2. Clique no **"+"** no canto superior direito
3. Clique **"New repository"**
4. No campo **"Repository name"** escreva: `ecclesiascale`
5. Selecione **"Private"** (privado — só você acessa)
6. Clique **"Create repository"**
7. Anote a URL que aparece. Será algo como: `https://github.com/SEU_NOME/ecclesiascale.git`

### Enviar o código para o GitHub
1. Extraia o arquivo ZIP do EcclesiaScale em uma pasta no seu computador
2. Abra o Terminal/Prompt **dentro dessa pasta** (clique com botão direito na pasta → "Abrir Terminal" ou "Abrir Prompt aqui")
3. Digite os comandos abaixo **um por vez**, apertando Enter após cada um:

```bash
git init
git add .
git commit -m "Primeira versão do EcclesiaScale"
git branch -M main
git remote add origin https://github.com/SEU_NOME/ecclesiascale.git
git push -u origin main
```

> ⚠️ **Substitua `SEU_NOME`** pelo seu usuário do GitHub!

✅ Pronto! Seu código está no GitHub.

---

## 🗄️ Parte 2 — Configurar o Supabase (Banco de Dados na Nuvem)

O Supabase guarda os dados do sistema (membros, escalas, etc.) na nuvem.

### Criar conta no Supabase
1. Acesse **https://supabase.com**
2. Clique **"Start your project"** e crie uma conta (pode usar o GitHub)

### Criar um projeto
1. Clique **"New Project"**
2. Escolha a organização padrão
3. Preencha:
   - **Name:** `ecclesiascale`
   - **Database Password:** crie uma senha forte e **anote-a** (você vai precisar!)
   - **Region:** escolha **South America (São Paulo)**
4. Clique **"Create new project"** e aguarde ~2 minutos

### Pegar as credenciais
1. No painel do Supabase, clique em ⚙️ **Settings** (engrenagem no menu esquerdo)
2. Clique em **"API"**
3. Copie e anote:
   - **Project URL:** algo como `https://XXXXX.supabase.co`
   - **anon public:** uma chave longa começando com `eyJhbGci...`

> Você usará esses valores depois no Railway.

---

## 🚂 Parte 3 — Fazer o Deploy no Railway (Colocar Online)

O Railway é a plataforma que vai rodar o sistema 24 horas por dia.

### Criar conta no Railway
1. Acesse **https://railway.app**
2. Clique **"Login"** e entre com sua conta do GitHub
3. Autorize o Railway a acessar seu GitHub

### Criar o projeto
1. No painel do Railway, clique **"New Project"**
2. Clique **"Deploy from GitHub repo"**
3. Selecione o repositório `ecclesiascale`
4. O Railway vai começar a instalar o projeto automaticamente

### Configurar as variáveis de ambiente
Ainda no Railway, clique no seu projeto → aba **"Variables"** → **"Add Variable"** e adicione uma por vez:

| Variável | Valor |
|----------|-------|
| `JWT_SECRET` | Uma senha longa: ex. `Ecclesia@Scale#2024$Segura!Forte` |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `VITE_SUPABASE_URL` | A URL do Supabase que você anotou |
| `VITE_SUPABASE_ANON_KEY` | A chave anon do Supabase |

### Gerar o domínio
1. Na aba **"Settings"** do Railway
2. Em **"Networking"** → **"Generate Domain"**
3. Anote o endereço gerado (algo como `ecclesiascale-production.up.railway.app`)

✅ **Seu sistema já está online!** Acesse o endereço gerado.

---

## 🔑 Parte 4 — Primeiro Acesso

Após acessar o sistema:

1. Acesse: `https://SEU-DOMINIO.up.railway.app`
2. Faça login com:
   - **SuperAdmin:** `super@ecclesia.com` / `SuperAdmin@2024!`
   - **Admin:** `admin@ecclesia.com` / `Admin@2024!`
3. **⚠️ IMPORTANTE:** Troque as senhas imediatamente após o primeiro acesso!

---

## ⏱️ Versão de Teste (Trial)

O sistema vem com **7 dias de teste gratuito**.

Após os 7 dias, você precisará de uma **chave de ativação**:
1. Entre como **SuperAdmin**
2. Vá em **Segurança → Gerador de Chaves**
3. Informe o nome da sua instituição
4. Clique **"Gerar Chave"** e copie o código
5. Compartilhe com os admins para que insiram em **Segurança → Ativar Sistema**

---

## 🔄 Atualizar o sistema no futuro

Quando você fizer alterações no código:

```bash
git add .
git commit -m "Descrição do que mudou"
git push
```

O Railway detecta automaticamente e atualiza o sistema em produção.

---

## ❓ Problemas Comuns

### "O site não abre"
- Verifique se o Railway está rodando (status verde)
- Aguarde 2-3 minutos após o deploy

### "Credenciais inválidas"
- Verifique se o banco foi inicializado corretamente
- Tente logar com: `admin@ecclesia.com` / `Admin@2024!`

### "Erro de conexão"
- Verifique as variáveis de ambiente no Railway
- Certifique-se que o `JWT_SECRET` está definido

### Preciso de ajuda?
- Acesse: https://docs.railway.app
- Supabase docs: https://supabase.com/docs
- GitHub docs: https://docs.github.com (em português)

---

## 📱 Usando no Celular

O sistema é responsivo! Basta acessar o mesmo link no navegador do celular.

Para uma experiência melhor, no Chrome:
1. Acesse o sistema
2. Clique nos 3 pontinhos (⋮)
3. "Adicionar à tela inicial"

Isso cria um ícone como se fosse um app!

---

## 📧 Suporte Técnico

Em caso de dúvidas, consulte a documentação ou entre em contato com o desenvolvedor responsável pela configuração inicial.

---

*Versão 5.0 — EcclesiaScale*
