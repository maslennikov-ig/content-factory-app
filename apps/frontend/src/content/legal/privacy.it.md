---
title: Informativa sulla privacy
updated: 2026-08-27
language: it
---

# Informativa sulla privacy

Questa pagina indica quali dati personali raccoglie Content Factory
(factory.aidevteam.ru), perché servono, chi altro li vede e come liberarsene. È
breve perché i dati sono pochi.

## 1. Chi è responsabile e come mettersi in contatto

Il titolare del trattamento dei dati personali è OOO «МЕГАКАМПУС»
(LLC MEGAKAMPUS), OGRN 1107746107204, INN 7719743262, con sede in 105318, Mosca,
ul. Izmaylovskiy val 2, piano 3, locale I, stanza 12G, Russia. Il titolare decide
perché e come i dati personali sono trattati in Content Factory all'indirizzo
factory.aidevteam.ru e risponde di tale trattamento.

Il canale più rapido è il bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot); lo stesso bot è il supporto. Una
richiesta formale sui tuoi diritti va a info@megacampus.com oppure per posta
all'indirizzo sopra indicato. Una richiesta su se i tuoi dati siano trattati
riceve risposta entro 10 giorni lavorativi dalla ricezione; il termine può essere
prorogato di non oltre 5 giorni lavorativi, indicandone il motivo.

## 2. Cosa viene raccolto

### 2.1 Registrazione e account

Quando crea un account vengono conservati:

- il Suo indirizzo e-mail;
- la Sua password — non la password stessa, ma un suo hash bcrypt. Dall'hash la
  password non si può recuperare, e noi non la conosciamo;
- come accede: con una password oppure con un servizio esterno come Telegram,
  insieme all'identificativo che quel servizio rilascia;
- l'indirizzo IP e la stringa User-Agent del browser al momento della
  registrazione;
- il nome dello spazio di lavoro, se ne ha indicato uno;
- un fuso orario;
- l'annotazione che ha accettato la newsletter, e quando, se ha spuntato la
  casella.

Più tardi può aggiungere un nome, un cognome, una breve descrizione e
un'immagine del profilo. Niente di tutto ciò è obbligatorio.

La registrazione è aperta, ma un nuovo account non funziona finché
l'amministrazione non lo approva. Prima dell'approvazione l'account esiste e non
può fare nulla: non viene rilasciata alcuna sessione, non viene inviata alcuna
e-mail di attivazione e ogni richiesta all'API viene rifiutata.

### 2.2 Uso del servizio

Mentre usa il servizio, il database conserva ciò che vi mette dentro: il testo
dei post, i file caricati, i calendari di pubblicazione, i commenti, le
impostazioni. Se collega un canale di un social network, viene conservato anche
il token di accesso rilasciato da quella rete — senza di esso il servizio non
può pubblicare a Suo nome. Le chiavi dei fornitori di IA, se ne inserisce,
vengono conservate cifrate.

C'è un registro separato dell'uso dell'IA. Annota soltanto quale operazione è
stata ammessa all'esecuzione: l'organizzazione, la modalità, il nome
dell'operazione, il fornitore, il modello e l'esito dell'ammissione. Non vi
finiscono prompt, testi dei post né output del modello.

Per distinguere il suo testo da un testo scritto da una macchina, il servizio
lo confronta con testi di altri autori che usano il servizio. Se ne occupa un
processo lato server: legge quei testi, ne calcola dei numeri e verso l’esterno
consegna solo numeri — una distribuzione di punteggi e due soglie. Nessuna
frase altrui entra nel suo spazio di lavoro: né sullo schermo, né in
un’istruzione al modello, né in un registro. Anche i suoi testi partecipano
allo stesso confronto per altri autori.

Quando il servizio propone una bozza e lei invia la sua versione, la coppia
viene conservata: ciò che ha proposto il modello e ciò che lei ha inviato.
Serve perché il controllo di somiglianza impari a distinguere il testo della
macchina dal suo. La coppia vive finché esiste l’avatar per cui è stata
raccolta: se elimina l’avatar, le correzioni vengono eliminate con esso.

### 2.3 Pagine pubbliche e demo

Le pagine pubbliche e la demo del prodotto contano quante volte accadono le
cose. Vengono inviati esattamente cinque campi:

- il nome dell'evento — uno di quattro: pagina iniziale vista, demo avviata,
  demo conclusa, registrazione iniziata;
- la lingua della pagina — `ru` o `en`;
- una fascia di larghezza della finestra — una di quattro parole, mai la
  dimensione reale;
- una versione dell'interfaccia;
- un passo della demo.

Nient'altro. Nessun indirizzo IP, nessun User-Agent, nessuna pagina di
provenienza, nessun cookie, nessun identificativo del visitatore, nessun
indirizzo e-mail. Tutto questo viene sommato in contatori giornalieri: una riga
per giorno e per insieme di valori, che contiene un numero. Niente in quei dati
permette di distinguere un visitatore da un altro.

Altri due eventi — una registrazione completata e l'attivazione di uno spazio di
lavoro — li registra il server stesso. Conserva una ricevuta: il nome
dell'evento e il risultato di una trasformazione crittografica a senso unico. La
ricevuta serve perché lo stesso evento non venga contato due volte. Non porta
alcun indirizzo, alcun nome e alcun IP.

Perché nessuno possa sommergere i contatori, esiste un limite di frequenza.
Conta le richieste su una chiave temporanea derivata dall'indirizzo IP con una
trasformazione a senso unico e una chiave casuale. Quella chiave vive un minuto
e solo nella memoria del processo in esecuzione. L'indirizzo IP in sé non viene
mai annotato.

### 2.4 Cookie

I cookie che questo servizio imposta:

- `auth` — la Sua sessione. Compare dopo l'accesso, dura fino a un anno. Senza
  di esso l'accesso non funziona;
- `showorg` — quale spazio di lavoro aprire. Compare quando ce n'è più di uno;
- `org` — un invito nello spazio di lavoro di un'altra persona. Vive 15 minuti;
- `oauth_state` — un breve controllo che un accesso tramite un servizio esterno
  sia tornato al browser che lo ha avviato. Vive 5 minuti;
- `i18next` — la lingua dell'interfaccia che ha scelto.

Non ci sono cookie pubblicitari. Non ci sono cookie di analisi di terze parti.
Nessuno dei cookie qui sopra La segue su altri siti.

### 2.5 Segnalazioni di errore

Quando qualcosa si rompe, il servizio invia una segnalazione di errore al
proprio collettore, in esecuzione sullo stesso host. La segnalazione contiene un
identificativo dell'evento, l'ora, un livello, l'ambiente, la versione della
build, il nome del servizio, il tipo di errore e i frame dello stack — percorso
del file relativo alla radice del repository, nome della funzione, riga e
colonna.

Nessun utente, nessuna richiesta, nessuna intestazione, nessun cookie, nessun
indirizzo IP, nessun User-Agent e niente del testo che stava scrivendo. L'evento
viene ricostruito da un elenco di campi ammessi anziché inoltrato così com'è.

### 2.6 Cosa questo prodotto non ha

Vale la pena dirlo chiaramente, perché è insolito. Il prodotto non porta alcuna
analisi di prodotto di terze parti. PostHog, Plausible, Google Tag Manager, dub,
datafa.st, il pixel di Facebook, Sentry ospitato e il widget di chat Chatbase
sono stati tutti rimossi insieme alle loro dipendenze, e riportarne indietro uno
qualsiasi fa fallire un controllo automatico. Le pagine online non caricano
alcuno script esterno. I font sono serviti dal nostro server, non da un CDN di
font.

Non c'è profilazione. Non c'è alcuna decisione automatizzata su di Lei basata
sui Suoi dati. I Suoi dati non vengono venduti.

## 3. Perché questi dati vengono usati

- Indirizzo e password — perché possa accedere e noi possiamo distinguere il Suo
  account da quello di un'altra persona.
- Indirizzo IP e User-Agent alla registrazione — per affrontare gli abusi in
  registrazione e i tentativi di indovinare le password.
- Contenuto dello spazio di lavoro — perché il servizio faccia ciò per cui lo
  usa.
- Token dei canali collegati — per pubblicare i post dove ha indicato.
- Contatori delle pagine pubbliche — per sapere se il prodotto funziona, senza
  osservare le persone.
- Segnalazioni di errore — per riparare ciò che si rompe.
- Indirizzo per la newsletter — solo se ha spuntato la casella.

Quasi tutto quanto sopra viene trattato perché serve a fornire ciò che ha
chiesto quando ha creato l'account. La newsletter è diversa: si regge sul Suo
consenso, e può revocare quel consenso in qualsiasi momento.

## 4. Chi altro riceve i dati

L'elenco completo dei destinatari, e cosa arriva a ciascuno, è in un documento
separato, «Destinatari dei dati». In breve:

- il servizio di consegna della posta Resend riceve l'indirizzo del
  destinatario, l'oggetto e il testo di un'e-mail di servizio: attivazione
  dell'account, reimpostazione della password, conferma dell'indirizzo. Nessun
  contenuto dei post e nessun token delle piattaforme;
- il sistema di newsletter Listmonk gira sul nostro host e riceve il Suo
  indirizzo solo dopo un consenso esplicito. Non lascia l'host;
- il nostro collettore di errori, sul nostro host, riceve quanto descrive la
  sezione 2.5;
- Telegram è coinvolto se accede tramite Telegram;
- OpenAI, OpenRouter e Tavily ricevono prompt, testi dei post e query di
  ricerca — ma solo se uno spazio di lavoro configura l'IA da sé. Le chiavi di
  un'organizzazione non vengono mai usate per un'altra;
- le API dei social network ricevono il contenuto dei post e i file — quando ha
  collegato un canale e ha chiesto di pubblicare;
- un indirizzo a Sua scelta riceve un post intero, se imposta un webhook che
  punta a quell'indirizzo.

I dati vanno a un'autorità pubblica solo dove la legge lo impone.

Non vendiamo dati e non li consegniamo agli inserzionisti.

## 5. Dove vengono trattati i dati

Il server è nei Paesi Bassi. Il database, i file, il sistema di newsletter e il
collettore di errori girano tutti su di esso.

Una parte della posta di servizio esce tramite Resend, un'azienda degli Stati
Uniti, che invia la posta di questo prodotto dalla regione `eu-west-1`. Ciò
significa che il Suo indirizzo e-mail e il testo di un messaggio di servizio
lasciano i Paesi Bassi. Nient'altro lo fa, a meno che non sia Lei a collegare
l'IA, un canale di un social network o un webhook.

## 6. Per quanto tempo vengono conservati i dati

- Dati dell'account e contenuto dello spazio di lavoro — finché l'account
  esiste.
- Le coppie di bozza proposta e testo inviato — finché esiste l’avatar per cui
  sono state raccolte. L’eliminazione dell’avatar le cancella subito.
- Ricevute di registrazione e registro dell'uso dell'IA — 90 giorni. Poi
  un'attività giornaliera li cancella.
- Contatori giornalieri delle pagine pubbliche — conservati a tempo
  indeterminato. Non contengono nulla che riguardi una persona: una data, un
  nome di evento, una lingua, una fascia di larghezza, una versione
  dell'interfaccia, un passo e un numero.
- Segnalazioni di errore — per il periodo configurato nel collettore.
- I backup del database hanno un proprio calendario. I dati cancellati
  spariscono da essi man mano che i backup ruotano.

## 7. I Suoi diritti

Può:

- chiedere se i Suoi dati vengono trattati e cosa è conservato;
- ottenere una copia dei Suoi dati;
- far correggere dati inesatti;
- chiedere la cancellazione;
- revocare il consenso alla newsletter;
- opporsi al trattamento;
- presentare reclamo all'autorità per la protezione dei dati del Suo Paese.

Per esercitare uno di questi diritti scriva a [@content_factory_adtbot](https://t.me/content_factory_adtbot). Potremmo
chiederLe di dimostrare che il messaggio proviene da chi possiede l'account —
altrimenti consegniamo i dati di un'altra persona a chiunque ne conosca
l'indirizzo.

## 8. Come cancellare l'account e i dati

Nell'interfaccia non c'è ancora un pulsante «cancella account». Scriva al bot
Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot) e indichi
l'indirizzo e-mail usato dall'account. Potremmo chiederLe un'ulteriore prova
d'identità. Cancelleremo quindi l'account e il suo contenuto.

Cosa può fare da sé, senza chiedercelo:

- scollegare un canale di un social network. La pubblicazione su quel canale si
  ferma subito e il canale sparisce dall'interfaccia. Il record viene
  contrassegnato come cancellato ma resta nel database finché i dati
  dell'account non vengono rimossi;
- cancellare post, file, firme, set e webhook;
- cancellare le chiavi dei fornitori di IA che ha inserito;
- disiscriversi dalla newsletter con il link contenuto nell'e-mail stessa.

## 9. Età

Il servizio è pensato per adulti. Non raccogliamo consapevolmente dati di
bambini. Se dovesse risultare che un bambino ha creato un account, lo
cancelleremo — ci scriva.

## 10. Come sono protetti i dati

- Le password sono conservate solo come hash bcrypt.
- Una password di accesso deve avere almeno 12 caratteri.
- Le chiavi dei fornitori di IA e la chiave API dell'organizzazione sono
  conservate cifrate.
- La connessione passa per HTTPS, il cookie di sessione è contrassegnato
  `secure` e `httpOnly`, e il suo ambito è limitato all'indirizzo esatto del
  servizio.
- Registrazione, accesso, reimpostazione della password e reinvio di un'e-mail
  di attivazione hanno tutti un limite di frequenza.
- La registrazione richiede l'approvazione dell'amministrazione, così un account
  estraneo non compare da solo sul server.

La sicurezza perfetta non esiste e non la promettiamo. Promettiamo di riparare
ciò di cui veniamo a sapere.

## 11. Codice sorgente aperto

Content Factory è rilasciato con licenza AGPL-3.0. Significa che dobbiamo dare
il codice sorgente del servizio in esecuzione a chiunque lo usi, e lo facciamo:
il sito riporta un link «Codice sorgente» e `/api/public/source` serve una
pagina con un archivio esattamente della versione ora in esecuzione. L'archivio
non contiene file di configurazione, né chiavi, né cronologia dei commit.

Non deve credere a questo documento sulla parola. Può leggere il codice.

## 12. Modifiche a questa informativa

Possiamo modificare questa informativa. La data in alto mostra sempre quando è
stata modificata l'ultima volta. Chi ha un account verrà informato via e-mail
delle modifiche che contano.
