---
title: Destinatari dei dati
updated: 2026-08-20
language: it
---

# Destinatari dei dati

## 1. Che cos'è questo elenco

Elenca tutti quelli a cui Content Factory può inviare dati e dice cosa arriva a
ciascuno di loro. È stato scritto leggendo il codice, non scorrendo i nomi dei
servizi, e cambia quando cambia il prodotto.

Se un destinatario non è in questo elenco, a lui non va nulla.

## 2. Come leggere l'elenco

I destinatari si dividono in tre gruppi:

- **sempre attivi** — partecipano al funzionamento del servizio senza nulla da
  parte Sua;
- **attivati da una Sua decisione** — restano zitti finché Lei o
  l'amministrazione del Suo spazio di lavoro non li configurate;
- **cosa questo prodotto non ha** — le cose che un prodotto di questo genere di
  solito porta con sé e questo no.

Ogni voce dice chi sono, cosa va loro, perché e dove viene trattato.

## 3. Sempre attivi

### 3.1 Resend — consegna della posta di servizio

**Chi.** Un servizio di consegna e-mail, un'azienda degli Stati Uniti. La posta
di questo prodotto viene inviata dalla regione `eu-west-1`.

**Cosa va.** L'indirizzo del destinatario, l'oggetto e il testo di un'e-mail di
servizio. Ce ne sono di tre tipi: attivazione dell'account, reimpostazione della
password e conferma dell'indirizzo quando viene aggiunto l'accesso con password.
Le e-mail di conferma proprie della newsletter passano dalla stessa chiave.

**Cosa non va.** Il contenuto dei post, i file caricati, i token delle
piattaforme collegate, i dati delle organizzazioni.

**Perché.** Senza consegna della posta la reimpostazione della password non
funziona, e un indirizzo non può diventare un modo per accedere: lo diventa solo
dopo che si è seguito il link contenuto nell'e-mail. Non abbiamo un server di
posta nostro, e un'e-mail di conferma inviata dal nostro host finirebbe nello
spam in silenzio.

### 3.2 Listmonk — la newsletter

**Chi.** Un sistema di newsletter. Gira sul nostro host. Non è un'azienda
esterna.

**Cosa va.** L'indirizzo e-mail di un nuovo account — e solo dopo che ha
spuntato esplicitamente la casella alla registrazione. Senza la spunta non va
nulla.

**Dove.** L'indirizzo non lascia la rete del nostro host. Listmonk invia le
proprie e-mail di conferma dell'iscrizione tramite lo stesso Resend.

**Come disiscriversi.** Con il link contenuto nell'e-mail stessa.

### 3.3 Il nostro collettore di errori

**Chi.** Il nostro collettore di errori, sul nostro host. Non Sentry.io e nessun
altro servizio esterno.

**Cosa va.** Un identificativo dell'evento, l'ora, un livello, l'ambiente, la
versione della build, il nome del servizio, il tipo di errore e i frame dello
stack: percorso del file relativo alla radice del repository, nome della
funzione, riga e colonna.

**Cosa non va.** L'utente, la richiesta, le intestazioni, i cookie, l'indirizzo
IP, lo User-Agent, le briciole di pane, il testo dei modelli, i campi
arbitrari. L'evento viene ricostruito da un elenco di campi ammessi anziché
inoltrato così com'è. Il browser lo manda all'indirizzo del sito stesso, non
direttamente al collettore.

### 3.4 Telegram — accesso

**Chi.** Telegram, se accede tramite esso.

**Cosa va.** Lo scambio OpenID Connect durante l'accesso. Il pulsante compare
solo quando l'accesso con Telegram è configurato su questo server.

## 4. Attivati da una Sua decisione

### 4.1 Modelli di IA: OpenAI e OpenRouter

**Cosa va.** Prompt e testi dei post.

**Quando.** Solo se uno spazio di lavoro configura l'IA da sé: o inserendo una
chiave propria, o ricevendo dall'amministrazione una quota su una chiave gestita
dal server. Tra queste due modalità non c'è alcun passaggio: le chiavi di
un'organizzazione non vengono mai usate per un'altra, e la chiave condivisa non
viene mai sostituita a una chiave propria mancante.

**Dove stanno le chiavi.** Le chiavi proprie di un'organizzazione sono
conservate cifrate nel database.

### 4.2 Tavily — ricerca sul web

**Cosa va.** Le query di ricerca che il prodotto costruisce mentre prepara il
materiale.

**Quando.** Con le stesse regole dei modelli di IA: solo dopo che uno spazio di
lavoro lo ha configurato.

### 4.3 API dei social network

**Cosa va.** Il contenuto dei post e i file allegati.

**Quando.** Dopo che ha collegato un canale e ha programmato o pubblicato un
post.

**Dove esattamente.** Alla rete di cui ha collegato il canale: Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X e altre piattaforme supportate. Cosa accade ai dati
dopo di ciò è regolato dalle regole di quella piattaforma.

### 4.4 Webhook e link che indica Lei

**Cosa va.** Se imposta un webhook — l'intero oggetto del post, all'indirizzo
che ha indicato. Se dà al prodotto un link da cui prelevare contenuto, il server
lo recupera a proprio nome.

**Quando.** Solo per una Sua azione diretta. L'indirizzo lo sceglie Lei.

## 5. Cosa questo prodotto non ha

Il prodotto non porta alcuna analisi di prodotto di terze parti. Rimossi insieme
alle loro dipendenze: PostHog, Plausible, Google Tag Manager, dub, datafa.st, il
pixel di Facebook e gli eventi Facebook lato server, Sentry ospitato, il widget
di chat Chatbase, l'editor di immagini Polotno, Beehiiv.

Riportarne indietro uno qualsiasi — come dipendenza, come import o come
indirizzo scritto nel codice — fa fallire un controllo automatico di build. Le
pagine online non caricano alcuno script esterno. I font sono locali. Il
frontend non fa richieste esterne dirette: tutto passa dal nostro backend.

Non ci sono reti pubblicitarie. Nessun dato viene venduto. Niente viene condiviso
con broker di dati.

## 6. Hosting

Il server è nei Paesi Bassi. Il database, i file, il sistema di newsletter e il
collettore di errori girano tutti su di esso. Il nome dell'azienda di hosting
non lo diciamo.

L'unico destinatario fuori dai Paesi Bassi coinvolto nel funzionamento del
servizio senza alcuna azione da parte Sua è Resend. Tutto quello che sta nella
sezione 4 si attiva per una Sua decisione.

## 7. Modifiche a questo elenco

L'elenco cambia man mano che cambia il prodotto. La data in alto mostra quando è
stato modificato l'ultima volta. Un nuovo destinatario compare in questo elenco
prima che gli arrivino i primi dati.

## 8. Contatti

Domande su questo elenco: bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot).
