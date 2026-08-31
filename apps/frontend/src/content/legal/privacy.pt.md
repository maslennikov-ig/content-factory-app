---
title: Aviso de privacidade
updated: 2026-08-27
language: pt
---

# Aviso de privacidade

Esta página diz quais dados pessoais o Content Factory (factory.aidevteam.ru)
coleta, para que precisa deles, quem mais os vê e como se livrar deles. É curta
porque não há muitos dados.

## 1. Quem é o responsável e como falar com ele

O operador dos dados pessoais é a OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN
1107746107204, INN 7719743262, com morada em 105318, Moscovo,
ul. Izmaylovskiy val 2, piso 3, instalação I, sala 12G, Rússia. O operador decide
porquê e como os dados pessoais são tratados no Content Factory em
factory.aidevteam.ru e responde por esse tratamento.

O canal mais rápido é o bot de Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot); o mesmo bot é o suporte. Um pedido
formal sobre os seus direitos segue para info@megacampus.com ou por correio para
a morada acima. Um pedido sobre se os seus dados são tratados é respondido em
10 dias úteis a contar da receção; esse prazo pode ser prorrogado por, no máximo,
5 dias úteis, e diremos porquê.

## 2. O que é coletado

### 2.1 Cadastro e conta

Quando você cria uma conta, é guardado o seguinte:

- seu endereço de e-mail;
- sua senha — não a senha em si, mas um hash bcrypt dela. A senha não pode ser
  recuperada a partir do hash, e nós não a conhecemos;
- como você entra: com senha ou com um serviço externo como o Telegram,
  junto com o identificador que esse serviço emite;
- o endereço IP e a string User-Agent do navegador vistos no momento do
  cadastro;
- o nome do espaço de trabalho, se você informou um;
- um fuso horário;
- o registro de que você aceitou o boletim, e quando, se marcou a caixa.

Depois você pode acrescentar nome, sobrenome, uma descrição curta e uma imagem
de perfil. Nada disso é obrigatório.

O cadastro é aberto, mas uma conta nova não funciona até que um administrador a
aprove. Antes da aprovação a conta existe e não pode fazer nada: nenhuma sessão
é emitida, nenhum e-mail de ativação é enviado e toda requisição à API é
recusada.

### 2.2 Uso do serviço

Enquanto você usa o serviço, o banco de dados guarda o que você coloca nele:
textos de publicações, arquivos enviados, agendamentos de publicação,
comentários, configurações. Se você conecta um canal de rede social, o token de
acesso emitido por essa rede também é guardado — sem ele o serviço não consegue
publicar em seu nome. As chaves de provedores de IA, se você inserir alguma, são
guardadas criptografadas.

Existe um registro separado do uso de IA. Ele anota apenas qual operação foi
admitida: a organização, o modo, o nome da operação, o provedor, o modelo e o
resultado da admissão. Não entram ali prompts, nem textos de publicações, nem
respostas do modelo.

Para distinguir o seu texto de um texto escrito por uma máquina, o serviço
compara-o com textos de outros autores que usam o serviço. Isso é feito por uma
tarefa no servidor: ela lê esses textos, calcula números a partir deles e para
fora entrega apenas números — uma distribuição de pontuações e dois limites.
Nenhuma frase alheia chega ao seu espaço de trabalho: nem ao ecrã, nem a uma
instrução do modelo, nem a um registo. Os seus próprios textos participam na
mesma comparação para outros autores.

Quando o serviço propõe um rascunho e você envia a sua versão, o par é
guardado: o que o modelo propôs e o que você enviou. Serve para que a
verificação de semelhança aprenda a distinguir o texto da máquina do seu. O par
vive enquanto existir o avatar para o qual foi recolhido: apague o avatar e as
correções são apagadas com ele.

### 2.3 Páginas públicas e demonstração

As páginas públicas e a demonstração do produto contam quantas vezes cada coisa
acontece. São enviados exatamente cinco campos:

- o nome do evento — um de quatro: página inicial vista, demonstração iniciada,
  demonstração concluída, cadastro iniciado;
- o idioma da página — `ru` ou `en`;
- uma faixa de largura da janela — uma de quatro palavras, nunca o tamanho
  real;
- uma versão da interface;
- um passo da demonstração.

Nada além disso. Nenhum endereço IP, nenhum User-Agent, nenhuma página de
origem, nenhum cookie, nenhum identificador de visitante, nenhum endereço de
e-mail. Tudo isso é somado em contadores diários: uma linha por dia e conjunto
de valores, contendo um número. Nada nesses dados permite distinguir um
visitante de outro.

Mais dois eventos — um cadastro concluído e a ativação de um espaço de trabalho
— são anotados pelo próprio servidor. Ele guarda um recibo: o nome do evento e o
resultado de uma transformação criptográfica irreversível. O recibo existe para
que o mesmo evento não seja contado duas vezes. Ele não leva endereço, nem nome,
nem IP.

Para que ninguém inunde os contadores, existe um limite de frequência. Ele conta
as requisições contra uma chave temporária derivada do endereço IP por uma
transformação irreversível com uma chave aleatória. Essa chave vive um minuto e
só na memória do processo em execução. O endereço IP em si nunca é anotado.

### 2.4 Cookies

Os cookies que este serviço define:

- `auth` — sua sessão. Aparece depois que você entra e dura até um ano. Sem ele
  a entrada não funciona;
- `showorg` — qual espaço de trabalho abrir. Aparece quando há mais de um;
- `org` — um convite para o espaço de trabalho de outra pessoa. Vive 15 minutos;
- `oauth_state` — uma verificação curta de que uma entrada por serviço externo
  voltou ao navegador que a começou. Vive 5 minutos;
- `i18next` — o idioma de interface que você escolheu.

Não há cookies de publicidade. Não há cookies de análise de terceiros. Nenhum
dos cookies acima segue você para outros sites.

### 2.5 Relatórios de erro

Quando algo quebra, o serviço envia um relatório de erro ao seu próprio
coletor, que roda no mesmo host. O relatório contém um identificador de evento,
a hora, um nível, o ambiente, a versão da build, o nome do serviço, o tipo do
erro e os quadros de pilha — caminho do arquivo relativo à raiz do repositório,
nome da função, linha e coluna.

Nenhum usuário, nenhuma requisição, nenhum cabeçalho, nenhum cookie, nenhum
endereço IP, nenhum User-Agent e nada do texto que você estava escrevendo. O
evento é remontado a partir de uma lista permitida de campos, em vez de ser
repassado como chegou.

### 2.6 O que este produto não tem

Vale dizer isso com clareza, porque é incomum. O produto não carrega nenhuma
análise de produto de terceiros. PostHog, Plausible, Google Tag Manager, dub,
datafa.st, o pixel do Facebook, o Sentry hospedado e o widget de chat Chatbase
foram todos removidos junto com suas dependências, e trazer qualquer um deles de
volta reprova uma verificação automática. As páginas em produção não carregam
nenhum script externo. As fontes são servidas do nosso próprio servidor, não de
uma CDN de fontes.

Não há criação de perfis. Não há decisão automatizada sobre você com base nos
seus dados. Seus dados não são vendidos.

## 3. Por que esses dados são usados

- Endereço e senha — para que você possa entrar e para que possamos distinguir
  sua conta da de outra pessoa.
- Endereço IP e User-Agent no cadastro — para lidar com abuso de cadastro e
  tentativas de adivinhar senhas.
- Conteúdo do espaço de trabalho — para que o serviço faça aquilo pelo que você
  veio.
- Tokens dos canais conectados — para publicar as publicações onde você mandou.
- Contadores das páginas públicas — para saber se o produto funciona, sem
  observar as pessoas.
- Relatórios de erro — para consertar o que quebra.
- Endereço para o boletim — só se você marcou a caixa.

Quase tudo acima é tratado porque é necessário para entregar o que você pediu ao
criar a conta. O boletim é diferente: ele funciona com o seu consentimento, e
você pode retirar esse consentimento a qualquer momento.

## 4. Quem mais recebe dados

A lista completa de destinatários, e o que chega a cada um, está em um documento
separado, “Destinatários dos dados”. Em resumo:

- o serviço de entrega de e-mail Resend recebe o endereço do destinatário, o
  assunto e o corpo de um e-mail de serviço: ativação de conta, redefinição de
  senha, confirmação de endereço. Nenhum conteúdo de publicação e nenhum token
  de plataforma;
- o sistema de boletins Listmonk roda no nosso próprio host e recebe seu
  endereço apenas após consentimento explícito. Ele não sai do host;
- o nosso próprio coletor de erros, no nosso próprio host, recebe o que a seção
  2.5 descreve;
- o Telegram entra em cena se você entra pelo Telegram;
- OpenAI, OpenRouter e Tavily recebem prompts, textos de publicações e consultas
  de busca — mas só se um espaço de trabalho configurar a IA por conta própria.
  As chaves de uma organização nunca são usadas para outra;
- as APIs das redes sociais recebem o conteúdo das publicações e os arquivos —
  quando você conectou um canal e pediu para publicar;
- um endereço à sua escolha recebe uma publicação inteira, se você configurar um
  webhook apontando para ele.

Os dados vão para uma autoridade pública apenas onde a lei exige.

Nós não vendemos dados e não os entregamos a anunciantes.

## 5. Onde os dados são tratados

O servidor fica nos Países Baixos. O banco de dados, os arquivos, o sistema de
boletins e o coletor de erros rodam todos nele.

Parte do e-mail de serviço sai pelo Resend, uma empresa dos Estados Unidos, que
envia o e-mail deste produto a partir da região `eu-west-1`. Isso significa que
o seu endereço de e-mail e o texto de uma mensagem de serviço saem dos Países
Baixos. Nada além disso sai, a menos que você mesmo conecte IA, um canal de rede
social ou um webhook.

## 6. Por quanto tempo os dados são guardados

- Dados da conta e conteúdo do espaço de trabalho — enquanto a conta existir.
- Os pares de rascunho proposto e texto enviado — enquanto existir o avatar
  para o qual foram recolhidos. Apagar o avatar elimina-os de imediato.
- Recibos de cadastro e o registro de uso de IA — 90 dias. Depois disso uma
  tarefa diária os apaga.
- Contadores diários das páginas públicas — guardados por tempo indeterminado.
  Eles não contêm nada relativo a uma pessoa: uma data, um nome de evento, um
  idioma, uma faixa de largura, uma versão da interface, um passo e um número.
- Relatórios de erro — pelo período configurado no coletor.
- Os backups do banco de dados têm o próprio calendário. Os dados apagados
  desaparecem deles conforme os backups são rotacionados.

## 7. Seus direitos

Você pode:

- perguntar se seus dados estão sendo tratados e o que é guardado;
- obter uma cópia dos seus dados;
- ter dados imprecisos corrigidos;
- pedir a exclusão;
- retirar seu consentimento ao boletim;
- se opor ao tratamento;
- reclamar à autoridade de proteção de dados do seu país.

Para exercer qualquer um deles, escreva para [@content_factory_adtbot](https://t.me/content_factory_adtbot). Podemos pedir
que você prove que a mensagem veio do titular da conta — senão entregamos os
dados de outra pessoa a quem simplesmente souber o endereço dela.

## 8. Como apagar sua conta e seus dados

Ainda não há um botão de “excluir conta” na interface. Escreva para o bot do
Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot) e informe
o endereço de e-mail usado pela conta. Podemos pedir uma comprovação adicional
de identidade. Depois apagaremos a conta e o seu conteúdo.

O que você pode fazer sozinho, sem nos pedir:

- desconectar um canal de rede social. A publicação nele para na hora e o canal
  some da interface. O registro é marcado como apagado, mas continua no banco de
  dados até que os dados da conta sejam removidos;
- apagar publicações, arquivos, assinaturas, conjuntos e webhooks;
- apagar quaisquer chaves de provedor de IA que você tenha inserido;
- cancelar a inscrição no boletim pelo link do próprio e-mail.

## 9. Idade

O serviço é destinado a adultos. Não coletamos dados de crianças de forma
consciente. Se aparecer que uma conta foi criada por uma criança, nós a
apagaremos — escreva para nós.

## 10. Como os dados são protegidos

- As senhas são guardadas apenas como hashes bcrypt.
- Uma senha de entrada precisa ter pelo menos 12 caracteres.
- As chaves de provedores de IA e a chave de API da organização são guardadas
  criptografadas.
- A conexão passa por HTTPS, o cookie de sessão é marcado como `secure` e
  `httpOnly`, e seu escopo é limitado ao endereço exato do serviço.
- Cadastro, entrada, redefinição de senha e reenvio do e-mail de ativação têm
  limite de frequência.
- O cadastro precisa da aprovação de um administrador, então a conta de um
  estranho não aparece sozinha no servidor.

Segurança perfeita não existe e nós não a prometemos. Prometemos consertar
aquilo de que ficamos sabendo.

## 11. Código aberto

O Content Factory é licenciado sob AGPL-3.0. Isso significa que precisamos dar o
código-fonte do serviço em execução a qualquer um que o use, e nós damos: o site
traz um link “Código-fonte”, e `/api/public/source` serve uma página com um
arquivo compactado de exatamente a versão que está rodando agora. O arquivo não
contém arquivos de configuração, nem chaves, nem histórico de commits.

Você não precisa acreditar em nada deste documento. Você pode ler o código.

## 12. Mudanças neste aviso

Podemos mudar este aviso. A data no topo sempre mostra quando ele mudou pela
última vez. Os titulares de conta serão avisados por e-mail sobre as mudanças
que importam.
