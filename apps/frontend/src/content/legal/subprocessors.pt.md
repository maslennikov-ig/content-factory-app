---
title: Destinatários dos dados
updated: 2026-08-20
language: pt
---

# Destinatários dos dados

## 1. O que é esta lista

Aqui estão listados todos a quem o Content Factory pode enviar dados, com o que
chega a cada um. Ela foi escrita lendo o código, não percorrendo nomes de
serviços, e muda quando o produto muda.

Se um destinatário não está nesta lista, nada vai para ele.

## 2. Como ler a lista

Os destinatários se dividem em três grupos:

- **sempre ativos** — participam da operação do serviço sem nada da sua parte;
- **ligados por decisão sua** — ficam calados até que você ou um administrador
  do seu espaço de trabalho os configure;
- **o que este produto não tem** — coisas que um produto assim costuma carregar
  e este não carrega.

Cada entrada diz quem são, o que vai para eles, por quê e onde é tratado.

## 3. Sempre ativos

### 3.1 Resend — entrega de e-mail de serviço

**Quem.** Um serviço de entrega de e-mail, uma empresa dos Estados Unidos. O
e-mail deste produto é enviado a partir da região `eu-west-1`.

**O que é enviado.** O endereço do destinatário, o assunto e o corpo de um
e-mail de serviço. São três tipos: ativação de conta, redefinição de senha e
confirmação de endereço quando a entrada por senha é adicionada. Os e-mails de
confirmação do próprio boletim saem pela mesma chave.

**O que não é enviado.** Conteúdo de publicações, arquivos enviados, tokens de
plataformas conectadas, dados de organizações.

**Por quê.** Sem entrega de e-mail a redefinição de senha não funciona, e um
endereço não pode virar uma forma de entrada: ele só vira uma depois que o link
do e-mail é seguido. Não temos servidor de e-mail próprio, e um e-mail de
confirmação enviado do nosso host cairia em spam em silêncio.

### 3.2 Listmonk — o boletim

**Quem.** Um sistema de boletins. Roda no nosso próprio host. Não é uma empresa
de fora.

**O que é enviado.** O endereço de e-mail de uma conta nova — e só depois que
você marcou explicitamente a caixa no cadastro. Sem a marca, nada vai.

**Onde.** O endereço não sai da rede do nosso host. O Listmonk envia seus
e-mails de confirmação de inscrição pelo mesmo Resend.

**Como cancelar a inscrição.** Pelo link do próprio e-mail.

### 3.3 O nosso próprio coletor de erros

**Quem.** O nosso coletor de erros, no nosso próprio host. Não é o Sentry.io nem
nenhum outro serviço externo.

**O que é enviado.** Um identificador de evento, a hora, um nível, o ambiente, a
versão da build, o nome do serviço, o tipo do erro e os quadros de pilha:
caminho do arquivo relativo à raiz do repositório, nome da função, linha e
coluna.

**O que não é enviado.** O usuário, a requisição, cabeçalhos, cookies, endereço
IP, User-Agent, migalhas de navegação, texto do modelo, campos arbitrários. O
evento é remontado a partir de uma lista permitida de campos, em vez de ser
repassado como chegou. O navegador o envia para o endereço do próprio site, não
direto para o coletor.

### 3.4 Telegram — entrada

**Quem.** O Telegram, se você entra por ele.

**O que é enviado.** A troca de OpenID Connect durante a entrada. O botão só
aparece quando a entrada pelo Telegram está configurada neste servidor.

## 4. Ligados por decisão sua

### 4.1 Modelos de IA: OpenAI e OpenRouter

**O que é enviado.** Prompts e textos de publicações.

**Quando.** Só se um espaço de trabalho configurar a IA por conta própria: ou
inserindo a própria chave, ou recebendo do administrador uma cota sobre uma
chave gerenciada pelo servidor. Não há cruzamento entre esses dois modos: as
chaves de uma organização nunca são usadas para outra, e a chave compartilhada
nunca é colocada no lugar de uma chave própria que falte.

**Onde ficam as chaves.** As chaves próprias de uma organização são guardadas
criptografadas no banco de dados.

### 4.2 Tavily — busca na web

**O que é enviado.** As consultas de busca que o produto monta enquanto prepara
material.

**Quando.** Sob as mesmas regras dos modelos de IA: só depois que um espaço de
trabalho configura.

### 4.3 APIs de redes sociais

**O que é enviado.** Conteúdo das publicações e arquivos anexados.

**Quando.** Depois que você conecta um canal e agenda ou publica uma publicação.

**Para onde exatamente.** Para a rede cujo canal você conectou: Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X e outras plataformas suportadas. O que acontece com os
dados depois disso é regido pelas regras dessa plataforma.

### 4.4 Webhooks e links que você fornece

**O que é enviado.** Se você configura um webhook — o objeto inteiro da
publicação, para o endereço que você informou. Se você dá ao produto um link
para puxar conteúdo, o servidor o acessa em nome próprio.

**Quando.** Só por ação direta sua. Você escolhe o endereço.

## 5. O que este produto não tem

O produto não carrega nenhuma análise de produto de terceiros. Removidos junto
com suas dependências: PostHog, Plausible, Google Tag Manager, dub, datafa.st, o
pixel do Facebook e os eventos de servidor do Facebook, o Sentry hospedado, o
widget de chat Chatbase, o editor de imagens Polotno, o Beehiiv.

Trazer qualquer um deles de volta — como dependência, como import ou como
endereço escrito no código — reprova uma verificação automática da build. As
páginas em produção não carregam nenhum script externo. As fontes são locais. O
frontend não faz requisições externas diretas: tudo passa pelo nosso próprio
backend.

Não há redes de anúncios. Nenhum dado é vendido. Nada é compartilhado com
corretores de dados.

## 6. Hospedagem

O servidor fica nos Países Baixos. O banco de dados, os arquivos, o sistema de
boletins e o coletor de erros rodam todos nele. Não dizemos o nome da empresa de
hospedagem.

O único destinatário fora dos Países Baixos envolvido na operação do serviço sem
nenhuma ação sua é o Resend. Tudo o que está na seção 4 é ligado por decisão
sua.

## 7. Mudanças nesta lista

A lista muda conforme o produto muda. A data no topo mostra quando ela mudou
pela última vez. Um destinatário novo aparece nesta lista antes que os primeiros
dados cheguem a ele.

## 8. Contato

Perguntas sobre esta lista: bot do Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot).
