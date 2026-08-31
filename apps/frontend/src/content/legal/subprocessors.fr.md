---
title: Destinataires des données
updated: 2026-08-20
language: fr
---

# Destinataires des données

## 1. Ce qu'est cette liste

Elle énumère tous ceux à qui Content Factory peut envoyer des données, et
indique ce qui parvient à chacun. Elle a été écrite en lisant le code, pas en
passant en revue des noms de services, et elle change quand le produit change.

Si un destinataire n'est pas sur cette liste, rien ne va vers lui.

## 2. Comment lire la liste

Les destinataires se répartissent en trois groupes :

- **toujours actifs** — impliqués dans le fonctionnement du service sans rien de
  votre part ;
- **activés par votre décision** — muets tant que vous ou l'administration de
  votre espace de travail ne les configurez pas ;
- **ce que ce produit n'a pas** — les choses qu'un produit de ce genre porte
  d'habitude et que celui-ci n'a pas.

Chaque entrée dit qui ils sont, ce qui va vers eux, pourquoi, et où c'est
traité.

## 3. Toujours actifs

### 3.1 Resend — acheminement du courrier de service

**Qui.** Un service d'acheminement d'e-mails, une entreprise des États-Unis. Le
courrier de ce produit est envoyé depuis la région `eu-west-1`.

**Ce qui va.** L'adresse du destinataire, l'objet et le corps d'un e-mail de
service. Il y en a trois sortes : activation du compte, réinitialisation du mot
de passe, et confirmation d'adresse quand une connexion par mot de passe est
ajoutée. Les e-mails de confirmation propres à la newsletter passent par la même
clé.

**Ce qui ne va pas.** Le contenu des publications, les fichiers envoyés, les
jetons des plateformes connectées, les données d'organisation.

**Pourquoi.** Sans acheminement du courrier, la réinitialisation du mot de passe
ne fonctionne pas, et une adresse ne peut pas devenir un moyen de connexion :
elle ne le devient qu'après que le lien de l'e-mail a été suivi. Nous n'avons
pas de serveur de messagerie à nous, et un e-mail de confirmation envoyé depuis
notre hôte atterrirait dans les spams sans bruit.

### 3.2 Listmonk — la newsletter

**Qui.** Un système de newsletter. Il tourne sur notre propre hôte. Ce n'est pas
une entreprise extérieure.

**Ce qui va.** L'adresse e-mail d'un nouveau compte — et seulement après que
vous avez explicitement coché la case à l'inscription. Sans la coche, rien ne
va.

**Où.** L'adresse ne quitte pas le réseau de notre hôte. Listmonk envoie ses
e-mails de confirmation d'abonnement par le même Resend.

**Comment se désabonner.** Avec le lien contenu dans l'e-mail lui-même.

### 3.3 Notre propre collecteur d'erreurs

**Qui.** Notre collecteur d'erreurs, sur notre propre hôte. Pas Sentry.io ni
aucun autre service externe.

**Ce qui va.** Un identifiant d'événement, l'heure, un niveau, l'environnement,
la version de build, le nom du service, le type d'erreur et les trames de pile :
chemin du fichier relatif à la racine du dépôt, nom de fonction, ligne et
colonne.

**Ce qui ne va pas.** L'utilisateur, la requête, les en-têtes, les cookies,
l'adresse IP, le User-Agent, le fil d'Ariane, le texte des modèles, les champs
arbitraires. L'événement est reconstruit à partir d'une liste de champs
autorisés au lieu d'être transmis tel quel. Le navigateur l'envoie à l'adresse
du site lui-même, pas directement au collecteur.

### 3.4 Telegram — connexion

**Qui.** Telegram, si vous vous connectez par lui.

**Ce qui va.** L'échange OpenID Connect pendant la connexion. Le bouton
n'apparaît que quand la connexion par Telegram est configurée sur ce serveur.

## 4. Activés par votre décision

### 4.1 Modèles d'IA : OpenAI et OpenRouter

**Ce qui va.** Les prompts et le texte des publications.

**Quand.** Seulement si un espace de travail configure l'IA lui-même : soit en
saisissant sa propre clé, soit en recevant de l'administration un quota sur une
clé gérée par le serveur. Il n'y a aucun croisement entre ces deux modes : les
clés d'une organisation ne servent jamais pour une autre, et la clé partagée
n'est jamais substituée à une clé propre manquante.

**Où vivent les clés.** Les clés propres d'une organisation sont conservées
chiffrées dans la base de données.

### 4.2 Tavily — recherche web

**Ce qui va.** Les requêtes de recherche que le produit construit pendant la
préparation de la matière.

**Quand.** Selon les mêmes règles que les modèles d'IA : seulement après qu'un
espace de travail l'a configuré.

### 4.3 API des réseaux sociaux

**Ce qui va.** Le contenu des publications et les fichiers joints.

**Quand.** Après que vous avez connecté un canal et programmé ou publié une
publication.

**Où exactement.** Vers le réseau dont vous avez connecté le canal : Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X et d'autres plateformes prises en charge. Ce qui
arrive aux données ensuite est régi par les règles de cette plateforme.

### 4.4 Webhooks et liens que vous fournissez

**Ce qui va.** Si vous mettez en place un webhook — l'objet publication entier,
vers l'adresse que vous avez donnée. Si vous donnez au produit un lien d'où
tirer du contenu, le serveur va le chercher en son propre nom.

**Quand.** Seulement sur votre action directe. C'est vous qui choisissez
l'adresse.

## 5. Ce que ce produit n'a pas

Le produit ne porte aucune analyse produit tierce. Retirés avec leurs
dépendances : PostHog, Plausible, Google Tag Manager, dub, datafa.st, le pixel
Facebook et les événements Facebook côté serveur, Sentry hébergé, le widget de
chat Chatbase, l'éditeur d'images Polotno, Beehiiv.

Ramener l'un d'eux — comme dépendance, comme import ou comme adresse écrite en
dur — fait échouer une vérification automatique de build. Les pages en ligne ne
chargent aucun script externe. Les polices sont locales. Le frontend ne fait
aucune requête externe directe : tout passe par notre propre backend.

Il n'y a pas de régies publicitaires. Aucune donnée n'est vendue. Rien n'est
partagé avec des courtiers en données.

## 6. Hébergement

Le serveur est aux Pays-Bas. La base de données, les fichiers, le système de
newsletter et le collecteur d'erreurs tournent tous dessus. Nous ne nommons pas
l'entreprise d'hébergement.

Le seul destinataire hors des Pays-Bas impliqué dans le fonctionnement du
service sans aucune action de votre part est Resend. Tout ce qui figure à la
section 4 est activé par votre propre décision.

## 7. Modifications de cette liste

La liste change à mesure que le produit change. La date en haut indique quand
elle a changé pour la dernière fois. Un nouveau destinataire apparaît sur cette
liste avant que les premières données ne lui parviennent.

## 8. Contact

Questions sur cette liste : bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot).
