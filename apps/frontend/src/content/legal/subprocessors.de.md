---
title: Datenempfänger
updated: 2026-08-20
language: de
---

# Datenempfänger

## 1. Was diese Liste ist

Hier stehen alle, an die Content Factory Daten senden kann, und es steht dabei,
was jeden von ihnen erreicht. Sie wurde durch Lesen des Codes geschrieben, nicht
durch Durchgehen von Dienstnamen, und sie ändert sich, wenn sich das Produkt
ändert.

Wenn ein Empfänger nicht auf dieser Liste steht, geht nichts an ihn.

## 2. Wie diese Liste zu lesen ist

Die Empfänger fallen in drei Gruppen:

- **immer aktiv** — am Betrieb des Dienstes beteiligt, ohne dass Sie etwas tun;
- **durch Ihre Entscheidung eingeschaltet** — stumm, bis Sie oder die
  Administration Ihres Arbeitsbereichs sie einrichten;
- **was dieses Produkt nicht hat** — Dinge, die ein Produkt dieser Art
  gewöhnlich trägt und dieses nicht.

Jeder Eintrag sagt, wer sie sind, was an sie geht, warum und wo es verarbeitet
wird.

## 3. Immer aktiv

### 3.1 Resend — Zustellung von Service-E-Mails

**Wer.** Ein E-Mail-Zustelldienst, ein Unternehmen in den Vereinigten Staaten.
Die Post dieses Produkts wird aus der Region `eu-west-1` versendet.

**Was geht.** Die Empfängeradresse, der Betreff und der Text einer
Service-E-Mail. Es gibt drei Arten: Kontoaktivierung, Passwort-Zurücksetzung und
Adressbestätigung, wenn eine Anmeldung per Passwort hinzugefügt wird. Die
eigenen Bestätigungs-E-Mails des Newsletters gehen über denselben Schlüssel.

**Was nicht geht.** Beitragsinhalte, hochgeladene Dateien, Token für verbundene
Plattformen, Organisationsdaten.

**Warum.** Ohne Mailzustellung funktioniert die Passwort-Zurücksetzung nicht,
und eine Adresse kann nicht zu einem Anmeldeweg werden: sie wird es erst,
nachdem dem Link in der E-Mail gefolgt wurde. Wir haben keinen eigenen
Mailserver, und eine Bestätigungs-E-Mail von unserem Host würde stillschweigend
im Spam landen.

### 3.2 Listmonk — der Newsletter

**Wer.** Ein Newsletter-System. Es läuft auf unserem eigenen Host. Es ist kein
fremdes Unternehmen.

**Was geht.** Die E-Mail-Adresse eines neuen Kontos — und erst, nachdem Sie bei
der Registrierung ausdrücklich das Kästchen angehakt haben. Ohne den Haken geht
nichts.

**Wohin.** Die Adresse verlässt das Netz unseres Hosts nicht. Listmonk verschickt
seine Bestätigungs-E-Mails zum Abonnement über dasselbe Resend.

**Wie man abbestellt.** Über den Link in der E-Mail selbst.

### 3.3 Unser eigener Fehlersammler

**Wer.** Unser Fehlersammler, auf unserem eigenen Host. Nicht Sentry.io und kein
anderer externer Dienst.

**Was geht.** Eine Ereigniskennung, die Zeit, eine Stufe, die Umgebung, die
Build-Version, der Dienstname, der Fehlertyp und Stack-Frames: Dateipfad relativ
zur Wurzel des Repositorys, Funktionsname, Zeile und Spalte.

**Was nicht geht.** Der Nutzer, die Anfrage, Header, Cookies, IP-Adresse,
User-Agent, Breadcrumbs, Modelltext, beliebige Felder. Das Ereignis wird aus
einer erlaubten Liste von Feldern neu aufgebaut, statt so weitergeleitet zu
werden, wie es kam. Der Browser sendet es an die Adresse der Seite selbst, nicht
direkt an den Sammler.

### 3.4 Telegram — Anmeldung

**Wer.** Telegram, wenn Sie sich darüber anmelden.

**Was geht.** Der Austausch nach OpenID Connect während der Anmeldung. Die
Schaltfläche erscheint nur, wenn die Anmeldung über Telegram auf diesem Server
eingerichtet ist.

## 4. Durch Ihre Entscheidung eingeschaltet

### 4.1 KI-Modelle: OpenAI und OpenRouter

**Was geht.** Prompts und Beitragstexte.

**Wann.** Nur wenn ein Arbeitsbereich KI selbst einrichtet: entweder indem er
einen eigenen Schlüssel eingibt oder indem ihm die Administration ein Kontingent
auf einem servergeführten Schlüssel gibt. Zwischen diesen beiden Modi gibt es
keinen Übergang: die Schlüssel einer Organisation werden nie für eine andere
verwendet, und der gemeinsame Schlüssel wird nie für einen fehlenden eigenen
Schlüssel eingesetzt.

**Wo die Schlüssel liegen.** Die eigenen Schlüssel einer Organisation werden
verschlüsselt in der Datenbank gespeichert.

### 4.2 Tavily — Websuche

**Was geht.** Die Suchanfragen, die das Produkt bei der Vorbereitung von
Material baut.

**Wann.** Nach denselben Regeln wie die KI-Modelle: erst nachdem ein
Arbeitsbereich es eingerichtet hat.

### 4.3 APIs sozialer Netzwerke

**Was geht.** Beitragsinhalte und angehängte Dateien.

**Wann.** Nachdem Sie einen Kanal verbunden und einen Beitrag geplant oder
veröffentlicht haben.

**Wohin genau.** An das Netzwerk, dessen Kanal Sie verbunden haben: Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X und andere unterstützte Plattformen. Was mit den Daten
danach geschieht, richtet sich nach den Regeln dieser Plattform.

### 4.4 Webhooks und Links, die Sie angeben

**Was geht.** Wenn Sie einen Webhook einrichten — das ganze Beitragsobjekt, an
die Adresse, die Sie angegeben haben. Wenn Sie dem Produkt einen Link geben, von
dem es Inhalte holen soll, ruft der Server ihn im eigenen Namen ab.

**Wann.** Nur auf Ihre direkte Handlung hin. Sie wählen die Adresse.

## 5. Was dieses Produkt nicht hat

Das Produkt trägt überhaupt keine Produktanalyse Dritter. Samt ihren
Abhängigkeiten entfernt: PostHog, Plausible, Google Tag Manager, dub,
datafa.st, das Facebook-Pixel und serverseitige Facebook-Ereignisse, gehostetes
Sentry, das Chat-Widget Chatbase, der Bildeditor Polotno, Beehiiv.

Eines davon zurückzubringen — als Abhängigkeit, als Import oder als fest
eingetragene Adresse — scheitert an einer automatischen Build-Prüfung.
Live-Seiten laden kein externes Skript. Schriften sind lokal. Das Frontend macht
keine direkten externen Anfragen: alles geht über unser eigenes Backend.

Es gibt keine Werbenetzwerke. Es werden keine Daten verkauft. Nichts wird mit
Datenhändlern geteilt.

## 6. Hosting

Der Server steht in den Niederlanden. Die Datenbank, die Dateien, das
Newsletter-System und der Fehlersammler laufen alle darauf. Den Namen des
Hosting-Unternehmens nennen wir nicht.

Der einzige Empfänger außerhalb der Niederlande, der ohne jede Handlung von
Ihnen am Betrieb des Dienstes beteiligt ist, ist Resend. Alles in Abschnitt 4
wird durch Ihre eigene Entscheidung eingeschaltet.

## 7. Änderungen dieser Liste

Die Liste ändert sich, wie sich das Produkt ändert. Das Datum oben zeigt, wann
sie zuletzt geändert wurde. Ein neuer Empfänger erscheint auf dieser Liste,
bevor die ersten Daten bei ihm ankommen.

## 8. Kontakt

Fragen zu dieser Liste: Telegram-Bot [@content_factory_adtbot](https://t.me/content_factory_adtbot).
