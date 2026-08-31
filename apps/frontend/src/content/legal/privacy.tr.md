---
title: Gizlilik Bildirimi
updated: 2026-08-27
language: tr
---

# Gizlilik Bildirimi

Bu sayfa, Content Factory (factory.aidevteam.ru) hizmetinin hangi kişisel
verileri topladığını, bunlara neden ihtiyaç duyduğunu, başka kimin gördüğünü ve
bunlardan nasıl kurtulacağınızı anlatır. Kısadır, çünkü fazla veri yoktur.

## 1. Kim sorumlu ve kendisine nasıl ulaşılır

Kişisel verilerin işleyeni OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN
1107746107204, INN 7719743262, adres: 105318, Moskova, ul. Izmaylovskiy val 2,
kat 3, bölüm I, oda 12G, Rusya'dır. İşleyen, Content Factory'de
(factory.aidevteam.ru) kişisel verilerin neden ve nasıl işlendiğine karar verir
ve bu işlemeden sorumludur.

En hızlı kanal Telegram botu [@content_factory_adtbot](https://t.me/content_factory_adtbot); destek de aynı bottan yürür. Haklarınıza
ilişkin resmi başvuru info@megacampus.com adresine veya yukarıdaki posta adresine
gönderilir. Verilerinizin işlenip işlenmediğine dair başvuru, ulaştığı tarihten
itibaren 10 iş günü içinde yanıtlanır; bu süre en fazla 5 iş günü uzatılabilir ve
gerekçesini bildiririz.

## 2. Neler toplanıyor

### 2.1 Kayıt ve hesap

Bir hesap oluşturduğunuzda şunlar saklanır:

- e-posta adresiniz;
- parolanız — parolanın kendisi değil, onun bcrypt özeti. Parola özetten geri
  elde edilemez ve biz onu bilmiyoruz;
- nasıl giriş yaptığınız: parolayla ya da Telegram gibi bir dış hizmetle, o
  hizmetin verdiği kimlikle birlikte;
- kayıt anında görülen IP adresi ve tarayıcının User-Agent dizesi;
- verdiyseniz, çalışma alanının adı;
- bir saat dilimi;
- kutuyu işaretlediyseniz, bültene onay verdiğiniz kaydı ve bunu ne zaman
  yaptığınız.

Daha sonra ad, soyadı, kısa bir açıklama ve bir profil resmi ekleyebilirsiniz.
Bunların hiçbiri zorunlu değildir.

Kayıt herkese açıktır, ama yeni bir hesap, bir yönetici onaylayana kadar
çalışmaz. Onaydan önce hesap vardır ve hiçbir şey yapamaz: oturum verilmez,
etkinleştirme e-postası gönderilmez ve her API isteği reddedilir.

### 2.2 Hizmetin kullanımı

Hizmeti kullanırken veritabanı, içine koyduklarınızı tutar: gönderi metinleri,
yüklenen dosyalar, yayın takvimleri, yorumlar, ayarlar. Bir sosyal ağ kanalı
bağlarsanız, o ağın verdiği erişim jetonu da saklanır — onsuz hizmet sizin
adınıza yayın yapamaz. Girerseniz, yapay zekâ sağlayıcı anahtarları şifreli
olarak saklanır.

Yapay zekâ kullanımı için ayrı bir kayıt tutulur. Yalnızca hangi işleme izin
verildiğini yazar: kuruluş, mod, işlem adı, sağlayıcı, model ve kabul sonucu.
İçine ne istemler, ne gönderi metinleri, ne de model çıktıları girer.

Metninizi makine tarafından yazılmış metinden ayırt edebilmek için hizmet, onu
hizmette çalışan diğer yazarların metinleriyle karşılaştırır. Bunu bir sunucu
görevi yapar: bu metinleri okur, onlardan sayılar hesaplar ve dışarıya yalnızca
sayıları verir — bir puan dağılımı ve iki sınır. Başkasına ait hiçbir cümle
çalışma alanınıza girmez: ne ekrana, ne modele verilen yönergeye, ne de bir
günlüğe. Sizin metinleriniz de diğer yazarlar için aynı karşılaştırmaya
katılır.

Hizmet bir taslak önerdiğinde ve siz kendi sürümünüzü gönderdiğinizde, çift
saklanır: modelin önerdiği ve sizin gönderdiğiniz. Bu, benzerlik denetiminin
makine metnini sizinkinden ayırmayı öğrenmesi içindir. Çift, toplandığı avatar
var olduğu sürece yaşar: avatarı silerseniz düzeltmeler de onunla birlikte
silinir.

### 2.3 Herkese açık sayfalar ve demo

Herkese açık sayfalar ve ürün demosu, bir şeyin kaç kez olduğunu sayar. Tam
olarak beş alan gönderilir:

- olayın adı — dörtten biri: açılış sayfası görüntülendi, demo başladı, demo
  bitti, kayıt başladı;
- sayfanın dili — `ru` ya da `en`;
- pencere genişliği aralığı — dört sözcükten biri, hiçbir zaman gerçek boyut
  değil;
- bir arayüz sürümü;
- bir demo adımı.

Başka hiçbir şey. IP adresi yok, User-Agent yok, geldiğiniz sayfa yok, çerez
yok, ziyaretçi kimliği yok, e-posta adresi yok. Bunların hepsi günlük sayaçlara
eklenir: gün ve değer kümesi başına bir satır, içinde bir sayı. Bu verilerde bir
ziyaretçiyi diğerinden ayıran hiçbir şey yoktur.

İki olay daha — tamamlanmış bir kayıt ve bir çalışma alanının etkinleştirilmesi
— sunucunun kendisi tarafından yazılır. Sunucu bir makbuz saklar: olayın adı ve
tek yönlü bir kriptografik dönüşümün sonucu. Makbuz, aynı olay iki kez
sayılmasın diye vardır. İçinde adres, ad ve IP yoktur.

Kimse sayaçları taşırmasın diye bir hız sınırı vardır. İstekleri, IP adresinden
rastgele bir anahtarla tek yönlü bir dönüşümle türetilen geçici bir anahtara
karşı sayar. O anahtar bir dakika yaşar ve yalnızca çalışan sürecin
belleğindedir. IP adresinin kendisi hiçbir zaman yazılmaz.

### 2.4 Çerezler

Bu hizmetin koyduğu çerezler:

- `auth` — oturumunuz. Giriş yaptıktan sonra görünür, bir yıla kadar sürer.
  Onsuz giriş çalışmaz;
- `showorg` — hangi çalışma alanının açılacağı. Birden fazla alan olduğunda
  görünür;
- `org` — başkasının çalışma alanına davet. 15 dakika yaşar;
- `oauth_state` — bir dış hizmet üzerinden yapılan girişin, onu başlatan
  tarayıcıya geri döndüğünün kısa bir denetimi. 5 dakika yaşar;
- `i18next` — seçtiğiniz arayüz dili.

Reklam çerezi yoktur. Üçüncü taraf analiz çerezi yoktur. Yukarıdaki çerezlerin
hiçbiri sizi başka sitelere takip etmez.

### 2.5 Hata raporları

Bir şey bozulduğunda hizmet, aynı sunucuda çalışan kendi toplayıcısına bir hata
raporu gönderir. Raporda bir olay kimliği, saat, bir düzey, ortam, yapı sürümü,
hizmet adı, hata türü ve yığın çerçeveleri bulunur — depo köküne göre dosya
yolu, işlev adı, satır ve sütun.

Kullanıcı yok, istek yok, başlık yok, çerez yok, IP adresi yok, User-Agent yok
ve yazmakta olduğunuz metinden hiçbir şey yok. Olay, geldiği gibi iletilmek
yerine izin verilen alanlar listesinden yeniden kurulur.

### 2.6 Bu üründe olmayanlar

Bunu açıkça söylemeye değer, çünkü alışılmadık. Üründe hiçbir üçüncü taraf ürün
analitiği yoktur. PostHog, Plausible, Google Tag Manager, dub, datafa.st,
Facebook pikseli, barındırılan Sentry ve Chatbase sohbet aracı — hepsi
bağımlılıklarıyla birlikte kaldırıldı ve herhangi birini geri getirmek otomatik
bir denetimden geçmez. Canlı sayfalar hiçbir dış betik yüklemez. Yazı tipleri
bir yazı tipi CDN'inden değil, kendi sunucumuzdan sunulur.

Profil çıkarma yoktur. Verilerinize dayanarak sizin hakkınızda otomatik karar
verme yoktur. Verileriniz satılmaz.

## 3. Bu veriler neden kullanılıyor

- Adres ve parola — giriş yapabilesiniz ve biz hesabınızı başkasınınkinden
  ayırabilelim diye.
- Kayıttaki IP adresi ve User-Agent — kayıt suistimaliyle ve parola
  denemeleriyle başa çıkmak için.
- Çalışma alanı içeriği — hizmet, geldiğiniz işi yapsın diye.
- Bağlı kanal jetonları — gönderileri söylediğiniz yere yayımlamak için.
- Herkese açık sayfa sayaçları — insanları izlemeden, ürünün çalışıp
  çalışmadığını bilmek için.
- Hata raporları — bozulanı düzeltmek için.
- Bülten için adres — yalnızca kutuyu işaretlediyseniz.

Yukarıdakilerin neredeyse tamamı, hesabı oluştururken istediğiniz şeyi sunmak
için gerekli olduğundan işlenir. Bülten farklıdır: rızanızla yürür ve bu rızayı
istediğiniz zaman geri çekebilirsiniz.

## 4. Verileri başka kim alıyor

Alıcıların tam listesi ve her birine neyin ulaştığı ayrı bir belgede, “Veri
Alıcıları” belgesindedir. Kısaca:

- e-posta iletim hizmeti Resend, bir hizmet e-postasının alıcı adresini,
  konusunu ve gövdesini alır: hesap etkinleştirme, parola sıfırlama, adres
  doğrulama. Gönderi içeriği ve platform jetonu almaz;
- bülten sistemi Listmonk kendi sunucumuzda çalışır ve adresinizi yalnızca açık
  rızadan sonra alır. Adres sunucudan çıkmaz;
- kendi sunucumuzdaki kendi hata toplayıcımız, 2.5 numaralı bölümde anlatılanı
  alır;
- Telegram üzerinden giriş yaparsanız Telegram işin içine girer;
- OpenAI, OpenRouter ve Tavily istemleri, gönderi metinlerini ve arama
  sorgularını alır — ama yalnızca bir çalışma alanı yapay zekâyı kendisi
  yapılandırırsa. Bir kuruluşun anahtarları hiçbir zaman bir başkası için
  kullanılmaz;
- sosyal ağ API'leri gönderi içeriğini ve dosyaları alır — bir kanal bağladığınız
  ve yayımlamayı istediğiniz zaman;
- seçtiğiniz bir adres, oraya işaret eden bir webhook kurarsanız, gönderinin
  tamamını alır.

Veriler bir kamu otoritesine yalnızca kanunun gerektirdiği yerde gider.

Veri satmayız ve reklamcılara vermeyiz.

## 5. Veriler nerede işleniyor

Sunucu Hollanda'dadır. Veritabanı, dosyalar, bülten sistemi ve hata toplayıcının
hepsi onun üzerinde çalışır.

Hizmet e-postalarının bir kısmı, Amerika Birleşik Devletleri'nde bir şirket olan
Resend üzerinden çıkar; bu şirket ürünümüzün postasını `eu-west-1` bölgesinden
gönderir. Bu, e-posta adresinizin ve bir hizmet mesajının metninin Hollanda'dan
çıktığı anlamına gelir. Siz kendiniz yapay zekâ, bir sosyal ağ kanalı ya da bir
webhook bağlamadıkça başka hiçbir şey çıkmaz.

## 6. Veriler ne kadar süre saklanıyor

- Hesap verileri ve çalışma alanı içeriği — hesap var olduğu sürece.
- Önerilen taslak ve gönderilen metin çiftleri — toplandıkları avatar var
  olduğu sürece. Avatarın silinmesi onları hemen siler.
- Kayıt makbuzları ve yapay zekâ kullanım kaydı — 90 gün. Sonrasında günlük bir
  görev bunları siler.
- Herkese açık sayfaların günlük sayaçları — süresiz saklanır. İçlerinde bir
  kişiye ilişkin hiçbir şey yoktur: bir tarih, bir olay adı, bir dil, bir
  genişlik aralığı, bir arayüz sürümü, bir adım ve bir sayı.
- Hata raporları — toplayıcıda ayarlanan süre boyunca.
- Veritabanı yedeklerinin kendi takvimi vardır. Silinen veriler, yedekler
  döndükçe onlardan da kaybolur.

## 7. Haklarınız

Şunları yapabilirsiniz:

- verilerinizin işlenip işlenmediğini ve neyin tutulduğunu sormak;
- verilerinizin bir kopyasını almak;
- yanlış verileri düzelttirmek;
- silinmesini istemek;
- bültene verdiğiniz rızayı geri çekmek;
- işlemeye itiraz etmek;
- ülkenizdeki veri koruma otoritesine şikâyette bulunmak.

Bunlardan herhangi birini kullanmak için [@content_factory_adtbot](https://t.me/content_factory_adtbot) adresine yazın.
Mesajın hesabın sahibinden geldiğini kanıtlamanızı isteyebiliriz — yoksa
başkasının verilerini, onun adresini bilen herkese vermiş oluruz.

## 8. Hesabınızı ve verilerinizi nasıl silersiniz

Arayüzde henüz “hesabı sil” düğmesi yok. Telegram botu
[@content_factory_adtbot](https://t.me/content_factory_adtbot)'a yazın ve hesabın
kullandığı e-posta adresini bildirin. Ek kimlik doğrulaması isteyebiliriz.
Ardından hesabı ve içeriğini sileriz.

Bize sormadan kendiniz yapabilecekleriniz:

- bir sosyal ağ kanalının bağlantısını kesmek. Ona yayın hemen durur ve kanal
  arayüzden kaybolur. Kayıt silinmiş olarak işaretlenir, ama hesap verileri
  kaldırılana kadar veritabanında kalır;
- gönderileri, dosyaları, imzaları, kümeleri ve webhook'ları silmek;
- girdiğiniz yapay zekâ sağlayıcı anahtarlarını silmek;
- e-postanın kendisindeki bağlantıyla bültenden çıkmak.

## 9. Yaş

Hizmet yetişkinler içindir. Bilerek çocuk verisi toplamayız. Bir hesabı bir
çocuğun açtığı ortaya çıkarsa, onu sileriz — bize yazın.

## 10. Veriler nasıl korunuyor

- Parolalar yalnızca bcrypt özetleri olarak saklanır.
- Giriş parolası en az 12 karakter olmalıdır.
- Yapay zekâ sağlayıcı anahtarları ve kuruluşun API anahtarı şifreli saklanır.
- Bağlantı HTTPS üzerinden gider, oturum çerezi `secure` ve `httpOnly` olarak
  işaretlenir ve kapsamı hizmetin tam adresiyle sınırlıdır.
- Kayıt, giriş, parola sıfırlama ve etkinleştirme e-postasının yeniden
  gönderilmesi hız sınırlıdır.
- Kayıt bir yöneticinin onayını gerektirir, böylece bir yabancının hesabı
  sunucuda kendiliğinden belirmez.

Kusursuz güvenlik diye bir şey yoktur ve biz onu vaat etmiyoruz. Öğrendiğimizi
düzeltmeyi vaat ediyoruz.

## 11. Açık kaynak

Content Factory, AGPL-3.0 lisansı altındadır. Bu, çalışan hizmetin kaynak kodunu
onu kullanan herkese vermemiz gerektiği anlamına gelir ve veriyoruz: sitede bir
“Kaynak kodu” bağlantısı var ve `/api/public/source` adresi, tam olarak şu anda
çalışan sürümün arşivini içeren bir sayfa sunar. Arşivde yapılandırma dosyası,
anahtar ve commit geçmişi yoktur.

Bu belgenin sözüne güvenmek zorunda değilsiniz. Kodu okuyabilirsiniz.

## 12. Bu bildirimdeki değişiklikler

Bu bildirimi değiştirebiliriz. En üstteki tarih her zaman en son ne zaman
değiştiğini gösterir. Önemli değişiklikler hesap sahiplerine e-postayla
bildirilir.
