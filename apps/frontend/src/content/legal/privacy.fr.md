---
title: Avis de confidentialité
updated: 2026-08-27
language: fr
---

# Avis de confidentialité

Cette page indique quelles données personnelles Content Factory
(factory.aidevteam.ru) collecte, pourquoi elle en a besoin, qui d'autre les voit
et comment s'en débarrasser. Elle est courte parce qu'il y a peu de données.

## 1. Qui est responsable et comment prendre contact

Le responsable du traitement des données personnelles est OOO «МЕГАКАМПУС»
(LLC MEGAKAMPUS), OGRN 1107746107204, INN 7719743262, adresse : 105318, Moscou,
ul. Izmaylovskiy val 2, 3e étage, local I, bureau 12G, Russie. Le responsable
décide pourquoi et comment les données personnelles sont traitées dans Content
Factory à l'adresse factory.aidevteam.ru, et répond de ce traitement.

Le canal le plus rapide est le bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot) ; ce même bot assure le
support. Une demande formelle au titre de vos droits s'envoie à
info@megacampus.com ou par courrier à l'adresse ci-dessus. Une demande portant
sur l'existence d'un traitement reçoit une réponse dans les 10 jours ouvrés
suivant sa réception ; ce délai peut être prolongé de 5 jours ouvrés au plus, et
nous en indiquerons la raison.

## 2. Ce qui est collecté

### 2.1 Inscription et compte

Quand vous créez un compte, les éléments suivants sont conservés :

- votre adresse e-mail ;
- votre mot de passe — pas le mot de passe lui-même, mais son empreinte bcrypt.
  Le mot de passe ne peut pas être retrouvé à partir de l'empreinte, et nous ne
  le connaissons pas ;
- votre mode de connexion : un mot de passe, ou un service externe comme
  Telegram, avec l'identifiant que ce service délivre ;
- l'adresse IP et la chaîne User-Agent du navigateur au moment de
  l'inscription ;
- le nom de l'espace de travail, si vous en avez donné un ;
- un fuseau horaire ;
- la trace de votre accord pour la newsletter, et sa date, si vous avez coché la
  case.

Plus tard, vous pouvez ajouter un prénom, un nom, une courte description et une
photo de profil. Rien de tout cela n'est obligatoire.

L'inscription est ouverte, mais un nouveau compte ne fonctionne pas tant que
l'administration ne l'a pas approuvé. Avant l'approbation, le compte existe et
ne peut rien faire : aucune session n'est délivrée, aucun e-mail d'activation
n'est envoyé, et toute requête à l'API est refusée.

### 2.2 Utilisation du service

Pendant que vous utilisez le service, la base de données conserve ce que vous y
mettez : le texte des publications, les fichiers envoyés, les calendriers de
publication, les commentaires, les réglages. Si vous connectez un canal de
réseau social, le jeton d'accès délivré par ce réseau est conservé aussi — sans
lui, le service ne peut pas publier en votre nom. Les clés de fournisseurs d'IA,
si vous en saisissez, sont conservées chiffrées.

Il existe un journal distinct de l'usage de l'IA. Il enregistre seulement quelle
opération a été autorisée à s'exécuter : l'organisation, le mode, le nom de
l'opération, le fournisseur, le modèle et le résultat de l'admission. Aucun
prompt, aucun texte de publication et aucune sortie de modèle n'y entrent.

Pour distinguer votre texte d'un texte écrit par une machine, le service le
compare à des textes d'autres auteurs qui utilisent le service. C'est une tâche
côté serveur qui s’en charge : elle lit ces textes, en calcule des nombres et
ne transmet vers l’extérieur que des nombres — une distribution de scores et
deux limites. Aucune phrase appartenant à autrui n’entre dans votre espace de
travail : ni à l’écran, ni dans une instruction au modèle, ni dans un journal.
Vos propres textes participent à la même comparaison pour d'autres auteurs.

Lorsque le service propose un brouillon et que vous envoyez votre propre
version, la paire est conservée : ce que le modèle a proposé et ce que vous
avez envoyé. Cela sert à ce que la vérification de ressemblance apprenne à
distinguer le texte machine du vôtre. La paire vit aussi longtemps que l’avatar
pour lequel elle a été collectée : supprimez l’avatar et les corrections sont
supprimées avec lui.

### 2.3 Pages publiques et démonstration

Les pages publiques et la démonstration du produit comptent le nombre de fois où
les choses arrivent. Exactement cinq champs sont envoyés :

- le nom de l'événement — l'un des quatre suivants : page d'accueil vue,
  démonstration commencée, démonstration terminée, inscription commencée ;
- la langue de la page — `ru` ou `en` ;
- une tranche de largeur de fenêtre — l'un de quatre mots, jamais la taille
  réelle ;
- une version de l'interface ;
- une étape de la démonstration.

Rien d'autre. Pas d'adresse IP, pas de User-Agent, pas de page de provenance,
pas de cookie, pas d'identifiant de visiteur, pas d'adresse e-mail. Tout cela
est ajouté à des compteurs quotidiens : une ligne par jour et par jeu de
valeurs, contenant un nombre. Rien dans ces données ne permet de distinguer un
visiteur d'un autre.

Deux autres événements — une inscription terminée et l'activation d'un espace de
travail — sont enregistrés par le serveur lui-même. Il conserve un reçu : le nom
de l'événement et le résultat d'une transformation cryptographique à sens
unique. Le reçu existe pour que le même événement ne soit pas compté deux fois.
Il ne porte ni adresse, ni nom, ni IP.

Pour empêcher quiconque d'inonder les compteurs, il y a une limite de débit.
Elle compte les requêtes sur une clé temporaire dérivée de l'adresse IP par une
transformation à sens unique avec une clé aléatoire. Cette clé vit une minute et
seulement dans la mémoire du processus en cours. L'adresse IP elle-même n'est
jamais consignée.

### 2.4 Cookies

Les cookies que ce service dépose :

- `auth` — votre session. Apparaît après la connexion, dure jusqu'à un an. La
  connexion ne fonctionne pas sans lui ;
- `showorg` — quel espace de travail ouvrir. Apparaît quand il y en a plus
  d'un ;
- `org` — une invitation dans l'espace de travail de quelqu'un d'autre. Vit
  15 minutes ;
- `oauth_state` — une courte vérification qu'une connexion par un service
  externe est revenue dans le navigateur qui l'a lancée. Vit 5 minutes ;
- `i18next` — la langue d'interface que vous avez choisie.

Il n'y a pas de cookies publicitaires. Il n'y a pas de cookies d'analyse tiers.
Aucun des cookies ci-dessus ne vous suit sur d'autres sites.

### 2.5 Rapports d'erreur

Quand quelque chose casse, le service envoie un rapport d'erreur à son propre
collecteur, qui tourne sur le même hôte. Le rapport contient un identifiant
d'événement, l'heure, un niveau, l'environnement, la version de build, le nom du
service, le type d'erreur et les trames de pile — chemin du fichier relatif à la
racine du dépôt, nom de fonction, ligne et colonne.

Pas d'utilisateur, pas de requête, pas d'en-têtes, pas de cookies, pas d'adresse
IP, pas de User-Agent et rien du texte que vous étiez en train d'écrire.
L'événement est reconstruit à partir d'une liste de champs autorisés au lieu
d'être transmis tel quel.

### 2.6 Ce que ce produit n'a pas

Cela vaut la peine d'être dit clairement, parce que c'est inhabituel. Le produit
ne porte aucune analyse produit tierce. PostHog, Plausible, Google Tag Manager,
dub, datafa.st, le pixel Facebook, Sentry hébergé et le widget de chat Chatbase
ont tous été retirés avec leurs dépendances, et ramener l'un d'eux fait échouer
une vérification automatique. Les pages en ligne ne chargent aucun script
externe. Les polices sont servies depuis notre propre serveur, pas depuis un CDN
de polices.

Il n'y a pas de profilage. Il n'y a pas de décision automatisée vous concernant
fondée sur vos données. Vos données ne sont pas vendues.

## 3. Pourquoi ces données sont utilisées

- Adresse et mot de passe — pour que vous puissiez vous connecter et que nous
  puissions distinguer votre compte de celui d'un autre.
- Adresse IP et User-Agent à l'inscription — pour traiter les abus
  d'inscription et les tentatives de deviner les mots de passe.
- Contenu de l'espace de travail — pour que le service fasse ce pour quoi vous
  l'utilisez.
- Jetons des canaux connectés — pour publier les publications là où vous l'avez
  demandé.
- Compteurs des pages publiques — pour savoir si le produit fonctionne, sans
  surveiller les gens.
- Rapports d'erreur — pour réparer ce qui casse.
- Adresse pour la newsletter — seulement si vous avez coché la case.

Presque tout ce qui précède est traité parce que c'est nécessaire pour fournir
ce que vous avez demandé en créant le compte. La newsletter est différente :
elle repose sur votre consentement, et vous pouvez retirer ce consentement à
tout moment.

## 4. Qui d'autre reçoit des données

La liste complète des destinataires, et ce qui parvient à chacun, se trouve dans
un document distinct, « Destinataires des données ». En bref :

- le service d'acheminement du courrier Resend reçoit l'adresse du
  destinataire, l'objet et le corps d'un e-mail de service : activation du
  compte, réinitialisation du mot de passe, confirmation d'adresse. Aucun
  contenu de publication et aucun jeton de plateforme ;
- le système de newsletter Listmonk tourne sur notre propre hôte et ne reçoit
  votre adresse qu'après un consentement explicite. Elle ne quitte pas l'hôte ;
- notre propre collecteur d'erreurs, sur notre propre hôte, reçoit ce que décrit
  la section 2.5 ;
- Telegram intervient si vous vous connectez par Telegram ;
- OpenAI, OpenRouter et Tavily reçoivent des prompts, du texte de publication et
  des requêtes de recherche — mais seulement si un espace de travail configure
  lui-même l'IA. Les clés d'une organisation ne servent jamais pour une autre ;
- les API des réseaux sociaux reçoivent le contenu des publications et les
  fichiers — quand vous avez connecté un canal et demandé la publication ;
- une adresse de votre choix reçoit une publication entière, si vous mettez en
  place un webhook qui pointe vers elle.

Les données ne vont à une autorité publique que là où la loi l'exige.

Nous ne vendons pas de données et ne les remettons pas à des annonceurs.

## 5. Où les données sont traitées

Le serveur est aux Pays-Bas. La base de données, les fichiers, le système de
newsletter et le collecteur d'erreurs tournent tous dessus.

Une partie du courrier de service part par Resend, une entreprise des
États-Unis, qui envoie le courrier de ce produit depuis la région `eu-west-1`.
Cela veut dire que votre adresse e-mail et le texte d'un message de service
quittent les Pays-Bas. Rien d'autre ne les quitte, sauf si vous connectez
vous-même l'IA, un canal de réseau social ou un webhook.

## 6. Combien de temps les données sont conservées

- Données de compte et contenu de l'espace de travail — tant que le compte
  existe.
- Les paires « brouillon proposé — texte envoyé » — tant que l’avatar pour
  lequel elles ont été collectées existe. La suppression de l’avatar les efface
  aussitôt.
- Reçus d'inscription et journal d'usage de l'IA — 90 jours. Ensuite, une tâche
  quotidienne les supprime.
- Compteurs quotidiens des pages publiques — conservés indéfiniment. Ils ne
  contiennent rien qui se rapporte à une personne : une date, un nom
  d'événement, une langue, une tranche de largeur, une version d'interface, une
  étape et un nombre.
- Rapports d'erreur — pendant la durée configurée dans le collecteur.
- Les sauvegardes de la base de données ont leur propre calendrier. Les données
  supprimées en disparaissent au fil de la rotation des sauvegardes.

## 7. Vos droits

Vous pouvez :

- demander si vos données sont traitées, et ce qui est conservé ;
- obtenir une copie de vos données ;
- faire corriger des données inexactes ;
- demander la suppression ;
- retirer votre consentement à la newsletter ;
- vous opposer au traitement ;
- porter plainte auprès de l'autorité de protection des données de votre pays.

Pour exercer l'un de ces droits, écrivez à [@content_factory_adtbot](https://t.me/content_factory_adtbot). Nous pouvons
vous demander de prouver que le message vient bien de la personne à qui
appartient le compte — sinon, nous remettons les données de quelqu'un d'autre à
qui connaît son adresse.

## 8. Comment supprimer votre compte et vos données

Il n'y a pas encore de bouton « supprimer le compte » dans l'interface. Écrivez
au bot Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot) et
indiquez l'adresse e-mail utilisée par le compte. Nous pouvons demander une
preuve d'identité supplémentaire. Nous supprimerons ensuite le compte et son
contenu.

Ce que vous pouvez faire vous-même, sans nous le demander :

- déconnecter un canal de réseau social. La publication vers ce canal s'arrête
  aussitôt et le canal disparaît de l'interface. L'enregistrement est marqué
  comme supprimé mais reste dans la base de données jusqu'à la suppression des
  données du compte ;
- supprimer des publications, des fichiers, des signatures, des ensembles et des
  webhooks ;
- supprimer les clés de fournisseurs d'IA que vous avez saisies ;
- vous désabonner de la newsletter avec le lien contenu dans l'e-mail lui-même.

## 9. Âge

Le service est destiné aux adultes. Nous ne collectons pas sciemment de données
d'enfants. S'il s'avère qu'un enfant a créé un compte, nous le supprimerons —
écrivez-nous.

## 10. Comment les données sont protégées

- Les mots de passe ne sont conservés que sous forme d'empreintes bcrypt.
- Un mot de passe de connexion doit compter au moins 12 caractères.
- Les clés de fournisseurs d'IA et la clé d'API de l'organisation sont
  conservées chiffrées.
- La connexion passe par HTTPS, le cookie de session est marqué `secure` et
  `httpOnly`, et sa portée est limitée à l'adresse exacte du service.
- L'inscription, la connexion, la réinitialisation du mot de passe et le renvoi
  d'un e-mail d'activation sont tous limités en débit.
- L'inscription demande l'approbation de l'administration, si bien qu'un compte
  inconnu n'apparaît pas tout seul sur le serveur.

La sécurité parfaite n'existe pas et nous ne la promettons pas. Nous promettons
de réparer ce dont nous avons connaissance.

## 11. Code source ouvert

Content Factory est sous licence AGPL-3.0. Cela veut dire que nous devons donner
le code source du service en fonctionnement à quiconque l'utilise, et nous le
faisons : le site porte un lien « Code source », et `/api/public/source` sert
une page avec une archive de la version exacte qui tourne en ce moment.
L'archive ne contient aucun fichier de configuration, aucune clé et aucun
historique de commits.

Vous n'avez pas à croire ce document sur parole. Vous pouvez lire le code.

## 12. Modifications de cet avis

Nous pouvons modifier cet avis. La date en haut indique toujours quand il a
changé pour la dernière fois. Les titulaires de compte seront informés par
e-mail des modifications qui comptent.
