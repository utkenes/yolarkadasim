# Welcome to your Expo app 👋

🚙 
1. Proje Hakkında Genel Bilgi
Yol Arkadaşım, şehirler arası veya şehir içi seyahat eden sürücüler ile aynı yöne gitmekte olan yolcuları bir araya getiren mobil bir platformdur. Sürücülerin araçlarındaki boş koltukları paylaşarak yolculuk maliyetlerini düşürmesini, yolcuların ise daha konforlu ve ekonomik seyahat etmesini hedefler.

2. Kullanılan Teknolojiler ve Yazılım Dilleri
Uygulamanın geliştirilmesinde modern, ölçeklenebilir ve performans odaklı bir teknoloji yığını (tech stack) kullanılmıştır:

Yazılım Dili:
TypeScript: JavaScript'e statik tip tanımlama özellikleri ekleyerek derleme zamanında hataların yakalanmasını sağlar ve kodun sürdürülebilirliğini artırır.
Mobil Çatı (Framework):
React Native: Tek bir kod tabanından hem iOS hem de Android için yerel (native) performans sunan uygulamalar üretmek için kullanılmıştır.
Expo (v54.0.33): Geliştirme süreçlerini hızlandırmak, cihaz testlerini (Expo Go) kolaylaştırmak ve yerel API'lara hızlı erişim sağlamak amacıyla entegre edilmiştir.
Expo Router: Dosya tabanlı (file-based) bir yönlendirme sistemi sunarak ekran geçişlerini ve derin bağlantıları (deep linking) yönetir.
Veritabanı & Arka Ofis (Backend as a Service - BaaS):
Firebase SDK (v12.9.0): Sunucu yönetimi maliyetlerini sıfıra indirmek ve gerçek zamanlı özellikler eklemek için tercih edilmiştir.
Firebase Authentication: Güvenli e-posta/şifre tabanlı kayıt ve giriş süreçlerini yürütür.
Cloud Firestore: NoSQL tabanlı, doküman yapısında çalışan, verilerin cihazlar arasında anlık (real-time) senkronize olmasını sağlayan bulut veritabanıdır.
Depolama ve Oturum Yönetimi:
Async Storage: Kullanıcının giriş oturumunu telefonda şifreli ve kalıcı olarak saklamak için kullanılır.
3. Uygulama Mimarisi ve Klasör Yapısı
Proje, okunabilirliği ve modülerliği artırmak amacıyla belirli bir klasör hiyerarşisine sadık kalınarak tasarlanmıştır:

text

yolarkadasim/
├── app/                      # Expo Router dosya tabanlı yönlendirme klasörü
│   ├── _layout.tsx           # Uygulamanın ana şablonu ve durum çubuğu ayarları
│   └── index.tsx             # Ana giriş kontrolcüsü (Giriş / Yolcu / Sürücü ayrımı)
├── src/
│   ├── config/
│   │   └── firebase.ts       # Firebase SDK başlatma ve konfigürasyon ayarları
│   ├── screens/              # Uygulamanın temel ekranları (Giriş ve Kontrol Panelleri)
│   │   ├── AuthScreen.tsx    # Kayıt / Giriş ekranı (Firebase Auth bağlantılı)
│   │   ├── PassengerDashboardScreen.tsx # Yolcu arama, bilet, cüzdan ve profil ekranı
│   │   └── DriverDashboardScreen.tsx    # Sürücü sefer açma, onaylama, kazanç ve profil ekranı
│   └── utils/                # Yardımcı fonksiyonlar ve algoritmalar
│       ├── pricing.ts        # Araç tipi ve mesafeye göre fiyat önerme motoru
│       └── routing.ts        # Dijkstra algoritmasıyla en kısa rota bulma motoru
├── constants/
│   └── theme.ts              # Uygulamanın renk paleti, koyu/açık mod tanımları
└── package.json              # Proje bağımlılıkları ve çalıştırma komutları
4. Veritabanı (Firestore) Tasarımı
Firestore NoSQL yapısında veriler dokümanlar (documents) ve koleksiyonlar (collections) şeklinde tutulur. Projede 4 adet temel tablo/koleksiyon tasarlanmıştır:

A. Users Koleksiyonu
Sisteme kayıt olan yolcu ve sürücülerin profil bilgilerini barındırır.

json

{
  "uid": "Kullanıcı Benzersiz ID (Firebase Auth'tan gelir)",
  "fullName": "Kullanıcının Adı Soyadı",
  "username": "Kullanıcı Adı",
  "email": "E-posta Adresi",
  "phone": "Telefon Numarası",
  "role": "Yolcu veya Sürücü",
  "rating": 5.0,
  "reviewCount": 0,
  "createdAt": "Kayıt Tarihi (ISO String)"
}
B. Trips Koleksiyonu
Sürücülerin oluşturduğu seyahat ilanlarını barındırır.

json

{
  "id": "Sefer Benzersiz ID",
  "driverId": "Seferi Oluşturan Sürücü ID",
  "origin": "Kalkış Şehri",
  "destination": "Varış Şehri",
  "route": ["İstanbul", "Kocaeli", "Bursa"], // Dijkstra'dan dönen ara duraklar
  "distance": 150, // Toplam mesafe (km)
  "date": "22/11/2026",
  "time": "14:30",
  "price": 350, // Kişi başı ücret (TL)
  "vehicleType": "Sedan / SUV / Minivan",
  "status": "Aktif / Tamamlandı / İptal Edildi",
  "createdAt": "Oluşturulma Tarihi"
}
C. Reservations Koleksiyonu
Yolcuların seferlere yaptığı başvuruları ve bilet durumlarını saklar.

json

{
  "id": "Rezervasyon Benzersiz ID",
  "tripId": "İlgili Sefer ID",
  "passengerId": "Başvuran Yolcu ID",
  "driverId": "Seferin Sürücü ID",
  "status": "Bekliyor / Onaylandı / Reddedildi / İptal Edildi",
  "createdAt": "Talebin Gönderilme Zamanı",
  "tripInfo": {
    "origin": "İstanbul",
    "destination": "Bursa",
    "date": "22/11/2026",
    "time": "14:30",
    "price": 350
  },
  "isReviewed": false // Yolculuk sonrasında yorum yapılıp yapılmadığı bilgisi
}
D. Reviews Koleksiyonu
Yolcuların tamamlanan seferlerden sonra sürücülere yaptığı değerlendirmeleri tutar.

json

{
  "id": "Yorum Benzersiz ID",
  "tripId": "İlgili Sefer ID",
  "driverId": "Değerlendirilen Sürücü ID",
  "passengerId": "Değerlendiren Yolcu ID",
  "passengerName": "Yolcunun Adı Soyadı",
  "rating": 5, // 1-5 arası yıldız puanı
  "comment": "Yolculuk yorumu",
  "createdAt": "Oluşturulma Tarihi"
}
5. Algoritmalar ve İş Mantığı (Core Logic)
Uygulamanın fark yaratan iki ana algoritmik yapısı bulunmaktadır:

1. Rota Bulma (Dijkstra Algoritması)
Sürücü yeni bir sefer oluştururken veya yolcu arama yaparken şehirler arası en kısa rota otomatik olarak çıkarılır. Graf veri yapısı üzerinden Dijkstra en kısa yol algoritması çalıştırılır.

Fonksiyon: calculateRoute(origin, destination)
Nasıl Çalışır? Şehirler düğüm (node), yollar ve mesafeler ise kenar (edge) ağırlığı olarak kabul edilir. Algoritma başlangıç noktasından itibaren tüm düğümlere olan en kısa yolları hesaplar ve hedef şehre ulaşan en verimli rotayı şehir listesi (path) ve toplam mesafe (distance) olarak döndürür.
2. Akıllı Fiyatlandırma Formülü
Uygulama, sürücülerin fahiş fiyatlar belirlemesini önlemek ve yolculara adil bir piyasa sunmak amacıyla dinamik fiyat önerme motoruna sahiptir.

Fonksiyon: calculateSuggestedPrice(distance, vehicleType)
Parametreler:
distance: Dijkstra tarafından hesaplanan en kısa yol mesafesi (km).
vehicleType: Sürücünün aracı (Sedan, SUV, Minivan).
Katsayılar: Sedan (1.0), SUV (1.2 - Yüksek Yakıt/Konfor), Minivan (0.85 - Paylaşımlı/Ekonomik).
Hesaplama: Önerilen Ücret = Mesafe * 1.2 TL * Katsayı (Çıkan sonuç kullanıcı dostu olması için en yakın 10'un katına yuvarlanır).
6. Uygulamanın Genel İşleyişi (İş Akışı)
Giriş ve Kayıt Süreci (Authentication)
Kullanıcı uygulamayı açtığında AuthScreen karşılar.
Kullanıcı Yolcu veya Sürücü rollerinden birini seçerek kaydolur veya giriş yapar.
Giriş yapıldığında sistem kullanıcının Firestore'daki rolünü teyit eder. Eğer seçilen rol ile hesaba ait rol uyuşmuyorsa hata mesajı gösterilerek yanlış kullanım engellenir.
Sürücü İş Akışı (Driver Flow)
Sürücü YeniSefer sekmesinden Kalkış ve Varış şehirlerini seçer.
Sistem arka planda Dijkstra algoritmasını çalıştırarak en kısa rotayı hesaplar ve sürücüye dinamik bir fiyat önerir.
Sürücü seferi kaydettiğinde ilan Firestore'a Aktif statüsünde yüklenir.
Yolculardan rezervasyon isteği geldiğinde sürücü bunu gerçek zamanlı görerek Onaylayabilir veya Reddedebilir.
Yolculuk bittiğinde sürücü "Seferi Tamamla" butonuna basarak sefer durumunu günceller. Bu işlem yolcuların değerlendirme yapabilmesini tetikler.
Yolcu İş Akışı (Passenger Flow)
Yolcu Yolculuk Ara kısmından seyahat etmek istediği kalkış ve varış şehirlerini seçer.
Sistem, aranan güzergahın sürücülerin ana rotası üzerinde veya ara duraklarında (Dijkstra rotası) olup olmadığını analiz eder ve uyuşan seferleri listeler.
Yolcu beğendiği sefere rezervasyon talebi gönderir.
Sürücü onayladığında bilet Onaylandı durumuna geçer. Yolcu dilerse sefer başlamadan önce biletini iptal edebilir.
Sefer sürücü tarafından tamamlandığında yolcuya değerlendirme paneli açılır. Yolcu sürücüye 1-5 arası yıldız verip yorum yazabilir.
7. Güvenlik ve Performans Tasarımı
Şifre Güvenliği: Şifreler istemci cihazda kesinlikle işlenmez veya Firestore düz metin olarak kaydedilmez. Firebase Authentication'a HTTPS üzerinden gönderilerek Google sunucularında scrypt şifreleme algoritmasıyla hash'lenir.
Gerçek Zamanlı Güncelleme: Veri sorgularında getDocs yerine Firebase'in onSnapshot yapısı kullanılmıştır. Bu sayede sunucu tarafındaki değişiklikler (rezervasyon kabulü, sefer iptali) telefon ekranlarına anında (WebSocket benzeri yapıyla) yansır.
Sunucu Yükü Azaltma: Yolculuk aramaları tüm seferleri belleğe indirip aramak yerine, Firestore sorgularında where("status", "==", "Aktif") filtresi kullanılarak ağ trafiği ve cihaz işlemci yükü minimuma indirilmiştir.
8. Sonuç
Yol Arkadaşım, NoSQL mimarisi, Dijkstra en kısa yol algoritması ve dinamik fiyatlandırma mekanizmalarıyla zenginleştirilmiş modern bir mobil uygulamadır. Geliştirilen bu yapı, karpooling süreçlerini dijitalleştirirken güvenliği, adil fiyatlandırmayı ve yüksek kullanıcı deneyimini bir arada sunar.
