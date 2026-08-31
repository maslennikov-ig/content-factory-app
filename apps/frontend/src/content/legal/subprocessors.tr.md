---
title: Veri Alıcıları
updated: 2026-08-20
language: tr
---

# Veri Alıcıları

## 1. Bu liste nedir

Burada, Content Factory hizmetinin veri gönderebileceği herkes sıralanır ve her
birine neyin ulaştığı yazar. Liste, hizmet adları taranarak değil, kod okunarak
yazıldı ve ürün değiştikçe değişir.

Bir alıcı bu listede yoksa, ona hiçbir şey gitmiyordur.

## 2. Liste nasıl okunur

Alıcılar üç gruba ayrılır:

- **her zaman etkin** — sizden hiçbir şey gerekmeden hizmetin çalışmasına
  katılır;
- **sizin kararınızla açılan** — siz ya da çalışma alanınızın bir yöneticisi
  yapılandırana kadar sessizdir;
- **bu üründe olmayanlar** — böyle bir üründe genellikle bulunan, bunda ise
  bulunmayan şeyler.

Her madde kimin olduğunu, ona ne gittiğini, nedenini ve nerede işlendiğini
söyler.

## 3. Her zaman etkin

### 3.1 Resend — hizmet e-postalarının iletimi

**Kim.** Bir e-posta iletim hizmeti, Amerika Birleşik Devletleri'nde bir şirket.
Bu ürünün postası `eu-west-1` bölgesinden gönderilir.

**Ne gönderiliyor.** Alıcının adresi, bir hizmet e-postasının konusu ve gövdesi.
Üç türü vardır: hesap etkinleştirme, parola sıfırlama ve parolayla giriş
eklendiğinde adres doğrulama. Bültenin kendi onay e-postaları da aynı anahtardan
gider.

**Ne gönderilmiyor.** Gönderi içeriği, yüklenen dosyalar, bağlı platformların
jetonları, kuruluş verileri.

**Neden.** E-posta iletimi olmadan parola sıfırlama çalışmaz ve bir adres giriş
yöntemine dönüşemez: ancak e-postadaki bağlantı izlendikten sonra dönüşür. Kendi
posta sunucumuz yok ve kendi sunucumuzdan gönderilen bir onay e-postası sessizce
spama düşerdi.

### 3.2 Listmonk — bülten

**Kim.** Bir bülten sistemi. Kendi sunucumuzda çalışır. Dışarıdan bir şirket
değildir.

**Ne gönderiliyor.** Yeni bir hesabın e-posta adresi — ve yalnızca kayıt
sırasında kutuyu açıkça işaretledikten sonra. İşaret olmadan hiçbir şey gitmez.

**Nerede.** Adres, sunucumuzun ağından çıkmaz. Listmonk, abonelik onay
e-postalarını aynı Resend üzerinden gönderir.

**Abonelikten nasıl çıkılır.** E-postanın kendisindeki bağlantıyla.

### 3.3 Kendi hata toplayıcımız

**Kim.** Kendi sunucumuzdaki kendi hata toplayıcımız. Sentry.io değil, başka
herhangi bir dış hizmet de değil.

**Ne gönderiliyor.** Bir olay kimliği, saat, bir düzey, ortam, yapı sürümü,
hizmet adı, hata türü ve yığın çerçeveleri: depo köküne göre dosya yolu, işlev
adı, satır ve sütun.

**Ne gönderilmiyor.** Kullanıcı, istek, başlıklar, çerezler, IP adresi,
User-Agent, iz kayıtları, model metni, keyfi alanlar. Olay, geldiği gibi
iletilmek yerine izin verilen alanlar listesinden yeniden kurulur. Tarayıcı onu
doğrudan toplayıcıya değil, sitenin kendi adresine gönderir.

### 3.4 Telegram — giriş

**Kim.** Telegram, eğer onun üzerinden giriş yaparsanız.

**Ne gönderiliyor.** Giriş sırasındaki OpenID Connect alışverişi. Düğme
yalnızca, bu sunucuda Telegram ile giriş yapılandırılmışsa görünür.

## 4. Sizin kararınızla açılanlar

### 4.1 Yapay zekâ modelleri: OpenAI ve OpenRouter

**Ne gönderiliyor.** İstemler ve gönderi metinleri.

**Ne zaman.** Yalnızca bir çalışma alanı yapay zekâyı kendisi yapılandırırsa:
ya kendi anahtarını girerek ya da yöneticinin sunucu tarafından yönetilen bir
anahtar üzerinde ona kota vermesiyle. Bu iki mod arasında geçiş yoktur: bir
kuruluşun anahtarları hiçbir zaman bir başkası için kullanılmaz ve ortak
anahtar, eksik olan kendi anahtarının yerine hiçbir zaman konmaz.

**Anahtarlar nerede.** Bir kuruluşun kendi anahtarları veritabanında şifreli
saklanır.

### 4.2 Tavily — web araması

**Ne gönderiliyor.** Ürünün, materyal hazırlarken kurduğu arama sorguları.

**Ne zaman.** Yapay zekâ modelleriyle aynı kurallara göre: yalnızca bir çalışma
alanı yapılandırdıktan sonra.

### 4.3 Sosyal ağ API'leri

**Ne gönderiliyor.** Gönderi içeriği ve ekli dosyalar.

**Ne zaman.** Bir kanal bağlayıp bir gönderiyi zamanladıktan ya da
yayımladıktan sonra.

**Tam olarak nereye.** Kanalını bağladığınız ağa: Facebook, Instagram, Threads,
LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord, Telegram, VK, Mastodon, X
ve desteklenen diğer platformlar. Verilere ondan sonra ne olacağını o platformun
kuralları belirler.

### 4.4 Webhook'lar ve verdiğiniz bağlantılar

**Ne gönderiliyor.** Bir webhook kurarsanız — gönderi nesnesinin tamamı,
verdiğiniz adrese. Ürüne, içerik çekeceği bir bağlantı verirseniz, sunucu ona
kendi adına gider.

**Ne zaman.** Yalnızca sizin doğrudan eyleminizle. Adresi siz seçersiniz.

## 5. Bu üründe olmayanlar

Üründe hiçbir üçüncü taraf ürün analitiği yoktur. Bağımlılıklarıyla birlikte
kaldırılanlar: PostHog, Plausible, Google Tag Manager, dub, datafa.st, Facebook
pikseli ve Facebook sunucu taraflı olayları, barındırılan Sentry, Chatbase
sohbet aracı, Polotno görsel düzenleyicisi, Beehiiv.

Herhangi birini geri getirmek — bağımlılık, içe aktarma ya da koda gömülü adres
olarak — otomatik bir yapı denetiminden geçmez. Canlı sayfalar hiçbir dış betik
yüklemez. Yazı tipleri yereldir. Ön yüz doğrudan dış istek yapmaz: her şey kendi
arka ucumuz üzerinden gider.

Reklam ağı yoktur. Veri satılmaz. Veri simsarlarıyla hiçbir şey paylaşılmaz.

## 6. Barındırma

Sunucu Hollanda'dadır. Veritabanı, dosyalar, bülten sistemi ve hata
toplayıcının hepsi onun üzerinde çalışır. Barındırma şirketinin adını
vermiyoruz.

Hollanda dışında olup hizmetin çalışmasına sizden hiçbir eylem gerekmeden
katılan tek alıcı Resend'dir. 4. bölümdeki her şey sizin kararınızla açılır.

## 7. Bu listedeki değişiklikler

Liste, ürün değiştikçe değişir. En üstteki tarih, en son ne zaman değiştiğini
gösterir. Yeni bir alıcı, ona ilk veriler ulaşmadan önce bu listede belirir.

## 8. İletişim

Bu listeyle ilgili sorular: Telegram botu [@content_factory_adtbot](https://t.me/content_factory_adtbot).
