---
title: Datenschutzhinweis
updated: 2026-08-27
language: de
---

# Datenschutzhinweis

Diese Seite sagt, welche personenbezogenen Daten Content Factory
(factory.aidevteam.ru) erhebt, wozu sie gebraucht werden, wer sie sonst noch
sieht und wie man sie wieder loswird. Sie ist kurz, weil es nicht viele Daten
gibt.

## 1. Wer verantwortlich ist und wie Sie Kontakt aufnehmen

Verantwortlicher für die personenbezogenen Daten ist die OOO «МЕГАКАМПУС»
(LLC MEGAKAMPUS), OGRN 1107746107204, INN 7719743262, Anschrift: 105318, Moskau,
ul. Izmaylovskiy val 2, 3. Etage, Räumlichkeit I, Zimmer 12G, Russland. Der
Verantwortliche entscheidet, warum und wie personenbezogene Daten in Content
Factory unter factory.aidevteam.ru verarbeitet werden, und haftet für diese
Verarbeitung.

Am schnellsten geht es über den Telegram-Bot [@content_factory_adtbot](https://t.me/content_factory_adtbot); derselbe Bot ist der Support.
Ein formales Auskunfts- oder Betroffenenersuchen richten Sie an
info@megacampus.com oder per Post an die oben genannte Anschrift. Eine Anfrage,
ob Ihre Daten verarbeitet werden, wird innerhalb von 10 Arbeitstagen nach Eingang
beantwortet; diese Frist kann um höchstens 5 Arbeitstage verlängert werden, wobei
wir den Grund nennen.

## 2. Was erhoben wird

### 2.1 Registrierung und Konto

Wenn Sie ein Konto anlegen, wird Folgendes gespeichert:

- Ihre E-Mail-Adresse;
- Ihr Passwort — nicht das Passwort selbst, sondern ein bcrypt-Hash davon. Aus
  dem Hash lässt sich das Passwort nicht wiederherstellen, und wir kennen es
  nicht;
- wie Sie sich anmelden: mit einem Passwort oder über einen externen Dienst wie
  Telegram, zusammen mit der Kennung, die dieser Dienst vergibt;
- die IP-Adresse und die User-Agent-Zeichenkette des Browsers im Moment der
  Registrierung;
- der Name des Arbeitsbereichs, falls Sie einen angegeben haben;
- eine Zeitzone;
- ein Vermerk, dass Sie dem Newsletter zugestimmt haben, und wann, falls Sie das
  Kästchen angehakt haben.

Später können Sie einen Vornamen, einen Nachnamen, eine kurze Beschreibung und
ein Profilbild hinzufügen. Nichts davon ist erforderlich.

Die Registrierung ist offen, aber ein neues Konto funktioniert nicht, bis die
Administration es freigibt. Vor der Freigabe existiert das Konto und kann
nichts: es wird keine Sitzung ausgestellt, keine Aktivierungs-E-Mail
verschickt, und jede API-Anfrage wird abgelehnt.

### 2.2 Nutzung des Dienstes

Während Sie den Dienst nutzen, hält die Datenbank das, was Sie hineingeben:
Beitragstexte, hochgeladene Dateien, Veröffentlichungspläne, Kommentare,
Einstellungen. Wenn Sie einen Kanal eines sozialen Netzwerks verbinden, wird
auch das Zugriffstoken gespeichert, das dieses Netzwerk ausgestellt hat — ohne
das Token kann der Dienst nicht in Ihrem Namen veröffentlichen. Schlüssel von
KI-Anbietern werden, falls Sie welche eingeben, verschlüsselt gespeichert.

Es gibt ein eigenes Protokoll der KI-Nutzung. Es hält nur fest, welche Operation
ausgeführt werden durfte: die Organisation, den Modus, den Namen der Operation,
den Anbieter, das Modell und das Ergebnis der Zulassung. Keine Prompts, keine
Beitragstexte und keine Modellausgaben gehen hinein.

Um Ihren Text von maschinell erzeugtem Text zu unterscheiden, vergleicht der
Dienst ihn mit Texten anderer Autoren, die den Dienst nutzen. Das erledigt eine
serverseitige Aufgabe: Sie liest solche Texte, berechnet daraus Zahlen und gibt
nach außen nur Zahlen weiter — eine Verteilung von Punktwerten und zwei
Grenzen. Kein fremder Satz gelangt in Ihren Arbeitsbereich: weder auf den
Bildschirm noch in eine Modellanweisung noch in ein Protokoll. Ihre eigenen
Texte nehmen an demselben Vergleich für andere Autoren teil.

Wenn der Dienst einen Entwurf vorschlägt und Sie Ihre eigene Fassung senden,
wird das Paar gespeichert: was das Modell vorgeschlagen hat und was Sie
gesendet haben. Das dient dazu, dass die Ähnlichkeitsprüfung lernt,
maschinellen Text von Ihrem zu unterscheiden. Das Paar besteht so lange, wie
der Avatar existiert, für den es erhoben wurde: Löschen Sie den Avatar, werden
die Bearbeitungen mit ihm gelöscht.

### 2.3 Öffentliche Seiten und die Demo

Die öffentlichen Seiten und die Produktdemo zählen, wie oft etwas passiert. Es
werden genau fünf Felder gesendet:

- der Ereignisname — einer von vieren: Startseite angesehen, Demo gestartet,
  Demo beendet, Registrierung begonnen;
- die Seitensprache — `ru` oder `en`;
- ein Bereich der Fensterbreite — eines von vier Wörtern, nie die tatsächliche
  Größe;
- eine Oberflächenversion;
- ein Demo-Schritt.

Sonst nichts. Keine IP-Adresse, kein User-Agent, keine verweisende Seite, kein
Cookie, keine Besucherkennung, keine E-Mail-Adresse. All das wird in
Tageszähler aufaddiert: eine Zeile pro Tag und Wertesatz, die eine Zahl enthält.
Nichts in diesen Daten kann einen Besucher von einem anderen unterscheiden.

Zwei weitere Ereignisse — eine abgeschlossene Registrierung und die Aktivierung
eines Arbeitsbereichs — zeichnet der Server selbst auf. Er speichert eine
Quittung: den Ereignisnamen und das Ergebnis einer einseitigen
kryptografischen Transformation. Die Quittung gibt es, damit dasselbe Ereignis
nicht zweimal gezählt wird. Sie trägt keine Adresse, keinen Namen und keine IP.

Damit niemand die Zähler fluten kann, gibt es eine Ratenbegrenzung. Sie zählt
Anfragen gegen einen temporären Schlüssel, der aus der IP-Adresse durch eine
einseitige Transformation mit einem Zufallsschlüssel abgeleitet wird. Dieser
Schlüssel lebt eine Minute und nur im Speicher des laufenden Prozesses. Die
IP-Adresse selbst wird nie aufgeschrieben.

### 2.4 Cookies

Die Cookies, die dieser Dienst setzt:

- `auth` — Ihre Sitzung. Erscheint nach der Anmeldung, hält bis zu einem Jahr.
  Ohne dieses Cookie funktioniert die Anmeldung nicht;
- `showorg` — welcher Arbeitsbereich geöffnet werden soll. Erscheint, wenn es
  mehr als einen gibt;
- `org` — eine Einladung in einen fremden Arbeitsbereich. Lebt 15 Minuten;
- `oauth_state` — eine kurze Prüfung, dass eine Anmeldung über einen externen
  Dienst in dem Browser zurückkommt, der sie begonnen hat. Lebt 5 Minuten;
- `i18next` — die von Ihnen gewählte Oberflächensprache.

Es gibt keine Werbe-Cookies. Es gibt keine Analyse-Cookies Dritter. Keines der
Cookies oben folgt Ihnen auf andere Seiten.

### 2.5 Fehlerberichte

Wenn etwas kaputtgeht, sendet der Dienst einen Fehlerbericht an seinen eigenen
Sammler, der auf demselben Host läuft. Der Bericht enthält eine
Ereigniskennung, die Zeit, eine Stufe, die Umgebung, die Build-Version, den
Dienstnamen, den Fehlertyp und Stack-Frames — Dateipfad relativ zur Wurzel des
Repositorys, Funktionsname, Zeile und Spalte.

Kein Nutzer, keine Anfrage, keine Header, keine Cookies, keine IP-Adresse, kein
User-Agent und nichts von dem Text, den Sie geschrieben haben. Das Ereignis wird
aus einer erlaubten Liste von Feldern neu aufgebaut, statt so weitergeleitet zu
werden, wie es kam.

### 2.6 Was dieses Produkt nicht hat

Das ist klar zu sagen, weil es ungewöhnlich ist. Das Produkt trägt überhaupt
keine Produktanalyse Dritter. PostHog, Plausible, Google Tag Manager, dub,
datafa.st, das Facebook-Pixel, gehostetes Sentry und das Chat-Widget Chatbase
wurden samt ihren Abhängigkeiten entfernt, und eines davon zurückzubringen
scheitert an einer automatischen Prüfung. Live-Seiten laden kein externes
Skript. Schriften werden von unserem eigenen Server ausgeliefert, nicht von
einem Schrift-CDN.

Es gibt kein Profiling. Es gibt keine automatisierte Entscheidungsfindung über
Sie auf Basis Ihrer Daten. Ihre Daten werden nicht verkauft.

## 3. Wozu diese Daten verwendet werden

- Adresse und Passwort — damit Sie sich anmelden können und wir Ihr Konto von
  dem einer anderen Person unterscheiden können.
- IP-Adresse und User-Agent bei der Registrierung — um mit Missbrauch der
  Registrierung und dem Erraten von Passwörtern umzugehen.
- Inhalte des Arbeitsbereichs — damit der Dienst das tut, wofür Sie ihn nutzen.
- Token verbundener Kanäle — um Beiträge dorthin zu veröffentlichen, wohin Sie
  es angewiesen haben.
- Zähler der öffentlichen Seiten — um zu wissen, ob das Produkt funktioniert,
  ohne Menschen zu beobachten.
- Fehlerberichte — um zu reparieren, was kaputtgeht.
- Adresse für den Newsletter — nur wenn Sie das Kästchen angehakt haben.

Fast alles oben wird verarbeitet, weil es nötig ist, um das zu liefern, worum
Sie beim Anlegen des Kontos gebeten haben. Der Newsletter ist anders: er beruht
auf Ihrer Einwilligung, und Sie können diese Einwilligung jederzeit widerrufen.

## 4. Wer sonst noch Daten erhält

Die vollständige Liste der Empfänger, und was jeden von ihnen erreicht, steht in
einem eigenen Dokument, „Datenempfänger“. Kurz gefasst:

- der Maildienst Resend erhält die Empfängeradresse, den Betreff und den Text
  einer Service-E-Mail: Kontoaktivierung, Passwort-Zurücksetzung,
  Adressbestätigung. Keine Beitragsinhalte und keine Plattform-Token;
- das Newsletter-System Listmonk läuft auf unserem eigenen Host und erhält Ihre
  Adresse nur nach ausdrücklicher Einwilligung. Sie verlässt den Host nicht;
- unser eigener Fehlersammler, auf unserem eigenen Host, erhält das, was
  Abschnitt 2.5 beschreibt;
- Telegram ist beteiligt, wenn Sie sich über Telegram anmelden;
- OpenAI, OpenRouter und Tavily erhalten Prompts, Beitragstexte und
  Suchanfragen — aber nur, wenn ein Arbeitsbereich KI selbst einrichtet. Die
  Schlüssel einer Organisation werden nie für eine andere verwendet;
- die APIs sozialer Netzwerke erhalten Beitragsinhalte und Dateien — wenn Sie
  einen Kanal verbunden und um Veröffentlichung gebeten haben;
- eine Adresse Ihrer Wahl erhält einen ganzen Beitrag, wenn Sie einen Webhook
  einrichten, der darauf zeigt.

Daten gehen nur dort an eine Behörde, wo das Gesetz es verlangt.

Wir verkaufen keine Daten und geben sie nicht an Werbetreibende.

## 5. Wo Daten verarbeitet werden

Der Server steht in den Niederlanden. Die Datenbank, die Dateien, das
Newsletter-System und der Fehlersammler laufen alle darauf.

Ein Teil der Service-E-Mails geht über Resend hinaus, ein Unternehmen in den
Vereinigten Staaten, das die Post dieses Produkts aus der Region `eu-west-1`
versendet. Das heißt, Ihre E-Mail-Adresse und der Text einer Service-Nachricht
verlassen die Niederlande. Sonst nichts, es sei denn, Sie verbinden selbst KI,
einen Kanal eines sozialen Netzwerks oder einen Webhook.

## 6. Wie lange Daten aufbewahrt werden

- Kontodaten und Inhalte des Arbeitsbereichs — solange das Konto besteht.
- Paare aus vorgeschlagenem Entwurf und gesendetem Text — solange der Avatar
  existiert, für den sie erhoben wurden. Das Löschen des Avatars löscht sie
  sofort.
- Registrierungsquittungen und das Protokoll der KI-Nutzung — 90 Tage. Danach
  löscht sie eine tägliche Aufgabe.
- Tageszähler der öffentlichen Seiten — unbefristet. Sie enthalten nichts, was
  sich auf eine Person bezieht: ein Datum, einen Ereignisnamen, eine Sprache,
  einen Breitenbereich, eine Oberflächenversion, einen Schritt und eine Zahl.
- Fehlerberichte — für den im Sammler eingestellten Zeitraum.
- Datenbank-Sicherungen haben ihren eigenen Zeitplan. Gelöschte Daten
  verschwinden aus ihnen, während die Sicherungen rotieren.

## 7. Ihre Rechte

Sie können:

- fragen, ob Ihre Daten verarbeitet werden und was gespeichert ist;
- eine Kopie Ihrer Daten erhalten;
- unrichtige Daten berichtigen lassen;
- Löschung verlangen;
- Ihre Einwilligung in den Newsletter widerrufen;
- der Verarbeitung widersprechen;
- sich bei der Datenschutzbehörde Ihres Landes beschweren.

Um eines dieser Rechte zu nutzen, schreiben Sie an [@content_factory_adtbot](https://t.me/content_factory_adtbot). Wir
können Sie bitten nachzuweisen, dass die Nachricht von der Person kommt, der das
Konto gehört — sonst geben wir fremde Daten an jede Person weiter, die deren
Adresse kennt.

## 8. Wie Sie Ihr Konto und Ihre Daten löschen

Es gibt in der Oberfläche noch keine Schaltfläche „Konto löschen“. Schreiben Sie
dem Telegram-Bot [@content_factory_adtbot](https://t.me/content_factory_adtbot)
und nennen Sie die E-Mail-Adresse, die das Konto nutzt. Wir können Sie um einen
zusätzlichen Identitätsnachweis bitten. Danach löschen wir das Konto und seine
Inhalte.

Was Sie selbst tun können, ohne uns zu fragen:

- einen Kanal eines sozialen Netzwerks trennen. Die Veröffentlichung dorthin
  hört sofort auf, und der Kanal verschwindet aus der Oberfläche. Der Eintrag
  wird als gelöscht markiert, bleibt aber in der Datenbank, bis die Kontodaten
  entfernt werden;
- Beiträge, Dateien, Signaturen, Sets und Webhooks löschen;
- alle von Ihnen eingegebenen Schlüssel von KI-Anbietern löschen;
- den Newsletter über den Link in der E-Mail selbst abbestellen.

## 9. Alter

Der Dienst ist für Erwachsene gedacht. Wir erheben nicht wissentlich Daten von
Kindern. Sollte sich herausstellen, dass ein Kind ein Konto angelegt hat,
löschen wir es — schreiben Sie uns.

## 10. Wie Daten geschützt werden

- Passwörter werden nur als bcrypt-Hashes gespeichert.
- Ein Anmeldepasswort muss mindestens 12 Zeichen haben.
- Schlüssel von KI-Anbietern und der API-Schlüssel der Organisation werden
  verschlüsselt gespeichert.
- Die Verbindung läuft über HTTPS, das Sitzungs-Cookie ist als `secure` und
  `httpOnly` markiert, und sein Geltungsbereich ist auf die genaue Adresse des
  Dienstes beschränkt.
- Registrierung, Anmeldung, Passwort-Zurücksetzung und das erneute Senden einer
  Aktivierungs-E-Mail sind alle ratenbegrenzt.
- Die Registrierung braucht die Freigabe der Administration, damit ein fremdes
  Konto nicht von selbst auf dem Server erscheint.

Perfekte Sicherheit gibt es nicht, und wir versprechen sie nicht. Wir
versprechen, zu reparieren, wovon wir erfahren.

## 11. Offener Quellcode

Content Factory ist unter AGPL-3.0 lizenziert. Das heißt, wir müssen den
Quellcode des laufenden Dienstes jeder Person geben, die ihn nutzt, und das tun
wir: die Seite trägt einen Link „Quellcode“, und `/api/public/source` liefert
eine Seite mit einem Archiv genau der Version, die jetzt läuft. Das Archiv
enthält keine Konfigurationsdateien, keine Schlüssel und keine Commit-Historie.

Sie müssen diesem Dokument nichts glauben. Sie können den Code lesen.

## 12. Änderungen an diesem Hinweis

Wir können diesen Hinweis ändern. Das Datum oben zeigt immer, wann er zuletzt
geändert wurde. Wer ein Konto hat, wird per E-Mail über Änderungen informiert,
die von Bedeutung sind.
