import React, { useState, useEffect } from 'react';
import {
    StyleSheet,
    Text,
    View,
    TextInput,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    Image,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { auth, db } from '../config/firebase';
import { collection, query, where, getDocs, doc, addDoc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { calculateRoute } from '../utils/routing';
import { calculateSuggestedPrice } from '../utils/pricing';

import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';

type PassengerTabType = 'Ara' | 'Biletlerim' | 'Harita' | 'Cuzdan' | 'Profil';

interface PassengerDashboardProps {
    onLogout?: () => void;
}

export default function PassengerDashboardScreen({ onLogout }: PassengerDashboardProps) {
    const [activeTab, setActiveTab] = useState<PassengerTabType>('Ara');

    // Araç Arama State
    const [searchOrigin, setSearchOrigin] = useState('');
    const [searchDestination, setSearchDestination] = useState('');
    const [searchDate, setSearchDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);

    const [loading, setLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);

    const [userData, setUserData] = useState<any>(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFullName, setEditFullName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [updatingProfile, setUpdatingProfile] = useState(false);

    const [myReservations, setMyReservations] = useState<any[]>([]);

    // Değerlendirme Modal State'leri
    const [isRatingModalVisible, setIsRatingModalVisible] = useState(false);
    const [selectedReservationForRating, setSelectedReservationForRating] = useState<any>(null);
    const [ratingValue, setRatingValue] = useState(5);
    const [reviewText, setReviewText] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    // Sürücü Bilgi Modal State'leri
    const [isDriverModalVisible, setIsDriverModalVisible] = useState(false);
    const [selectedDriverProfile, setSelectedDriverProfile] = useState<any>(null);
    const [driverReviews, setDriverReviews] = useState<any[]>([]);
    const [loadingDriver, setLoadingDriver] = useState(false);

    // Harita ve Anlık Sürüş State'leri
    const [passengerLocation, setPassengerLocation] = useState<Location.LocationObject | null>(null);
    const [activeDrivers, setActiveDrivers] = useState<any[]>([]);
    const [selectedMapDriver, setSelectedMapDriver] = useState<any>(null);
    const [mapDestination, setMapDestination] = useState('');
    const [currentInstantRide, setCurrentInstantRide] = useState<any>(null);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const q = query(collection(db, 'Reservations'), where('passengerId', '==', user.uid));
        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const resData: any[] = [];

            // Rezervasyonları ve bağlı olduğu seferleri (Trips) eşzamanlı çekiyoruz
            for (const docSnap of snapshot.docs) {
                const resItem = { id: docSnap.id, ...docSnap.data() } as any;

                // Sefer (Trip) dökümanından canlı durumu ve şoför bilgisini al
                if (resItem.tripId) {
                    try {
                        const tripDoc = await getDoc(doc(db, 'Trips', resItem.tripId));
                        if (tripDoc.exists()) {
                            resItem.liveTripStatus = tripDoc.data().status; // Aktif, İptal Edildi, Tamamlandı vb.
                        }
                    } catch (err) {
                        console.error("Trip detayı çekilemedi:", err);
                    }
                }
                resData.push(resItem);
            }

            // İstediğimiz sıraya göre dizebiliriz (tarih vb.)
            resData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setMyReservations(resData);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        const fetchUserData = async () => {
            const userDocSnap = await getDoc(doc(db, 'Users', user.uid));
            if (userDocSnap.exists()) {
                const data = userDocSnap.data();
                setUserData(data);
                setEditFullName(data.fullName || '');
                setEditPhone(data.phone || '');
                setEditUsername(data.username || '');
            }
        };
        fetchUserData();

        // Aktif Sürücüleri Dinle
        const qDrivers = query(collection(db, 'ActiveDrivers'), where('isAvailable', '==', true));
        const unsubscribeDrivers = onSnapshot(qDrivers, (snapshot) => {
            const driversData: any[] = [];
            snapshot.forEach((docSnap) => {
                driversData.push({ id: docSnap.id, ...docSnap.data() });
            });
            setActiveDrivers(driversData);
        });

        // Kendi Anlık Sürüş İsteğimizi Dinle
        const qRide = query(
            collection(db, 'InstantRides'),
            where('passengerId', '==', user.uid)
        );
        const unsubscribeRide = onSnapshot(qRide, (snapshot) => {
            // Aktif olanı alacağız (tamamlanmamış ve iptal edilmemiş)
            const activeRide = snapshot.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .find((r: any) => r.status !== 'completed' && r.status !== 'rejected');

            setCurrentInstantRide(activeRide || null);
        });

        return () => {
            unsubscribeDrivers();
            unsubscribeRide();
        };
    }, []);

    // Harita sekmesine geçildiğinde konum izni iste
    useEffect(() => {
        if (activeTab === 'Harita') {
            (async () => {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getCurrentPositionAsync({});
                    setPassengerLocation(loc);
                } else {
                    Alert.alert('Hata', 'Haritayı kullanmak için konum izni gereklidir.');
                }
            })();
        }
    }, [activeTab]);

    const handleUpdateProfile = async () => {
        const user = auth.currentUser;
        if (!user) return;

        setUpdatingProfile(true);
        try {
            await updateDoc(doc(db, 'Users', user.uid), {
                fullName: editFullName,
                phone: editPhone,
                username: editUsername,
            });
            setUserData((prev: any) => ({
                ...prev,
                fullName: editFullName,
                phone: editPhone,
                username: editUsername,
            }));
            setIsEditingProfile(false);
            Alert.alert('Başarılı', 'Profil bilgileriniz güncellendi.');
        } catch (error: any) {
            console.error("Profil güncelleme hatası:", error);
            Alert.alert('Hata', 'Profil güncellenirken bir hata oluştu: ' + error.message);
        } finally {
            setUpdatingProfile(false);
        }
    };

    const cities = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Kocaeli"];

    const handleSearch = async () => {
        if (!searchOrigin || !searchDestination) {
            Alert.alert('Bilgi', 'Lütfen kalkış ve varış noktalarını girin.');
            return;
        }

        setLoading(true);
        try {
            // Sadece aktif seferleri çekiyoruz (rota array'i olan veya doğrudan rota belirten)
            const q = query(
                collection(db, 'Trips'),
                where('status', '==', 'Aktif')
            );
            const querySnapshot = await getDocs(q);
            const results: any[] = [];

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const route: string[] = data.route || [];

                // 1. Önce doğrudan origin/destination eşleşiyor mu diye bakalım
                const directMatch = data.origin === searchOrigin && data.destination === searchDestination;

                // 2. Eğer ara durakları varsa (route dizisi), sırasıyla yol üzerinde mi diye bakalım
                // origin'in route içerisindeki indeksi < destination'ın indeksi olmalı
                const originIndex = route.indexOf(searchOrigin);
                const destIndex = route.indexOf(searchDestination);
                const routeMatch = originIndex !== -1 && destIndex !== -1 && originIndex < destIndex;

                if (directMatch || routeMatch) {
                    const { distance } = calculateRoute(searchOrigin, searchDestination);
                    const suggestedPrice = calculateSuggestedPrice(distance, data.vehicleType || 'Sedan');

                    results.push({
                        id: doc.id,
                        ...data,
                        // Ücreti hesaplanan ara mesafeye göre eziyoruz (yolcuya özel fiyat)
                        price: suggestedPrice > 0 ? suggestedPrice : data.price
                    });
                }
            });

            setSearchResults(results);
            if (results.length === 0) {
                Alert.alert('Bilgi', 'Arama kriterlerinize uygun sefer bulunamadı.');
            }
        } catch (err: any) {
            console.error(err);
            Alert.alert('Hata', 'Arama sırasında bir hata oluştu: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleReservation = async (trip: any) => {
        const user = auth.currentUser;
        if (!user) {
            Alert.alert("Hata", "Oturum açmanız gerekiyor.");
            return;
        }

        Alert.alert(
            "Rezervasyon Onayı",
            `${trip.origin} ➔ ${trip.destination} seferine rezervasyon yapmak istiyor musunuz?`,
            [
                { text: "İptal", style: "cancel" },
                {
                    text: "Evet, Yap", onPress: async () => {
                        try {
                            setLoading(true);
                            await addDoc(collection(db, 'Reservations'), {
                                tripId: trip.id,
                                passengerId: user.uid,
                                driverId: trip.driverId,
                                status: 'Bekliyor',
                                createdAt: new Date().toISOString(),
                                tripInfo: {
                                    origin: trip.origin,
                                    destination: trip.destination,
                                    date: trip.date,
                                    time: trip.time,
                                    price: trip.price
                                }
                            });
                            Alert.alert("Başarılı", "Rezervasyon talebiniz sürücüye iletildi.");
                        } catch (error: any) {
                            console.error("Rezervasyon hatası", error);
                            Alert.alert("Hata", "Rezervasyon yapılamadı: " + error.message);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleRequestInstantRide = async () => {
        const user = auth.currentUser;
        if (!user || !selectedMapDriver || !mapDestination) {
            Alert.alert('Eksik Bilgi', 'Lütfen haritadan bir sürücü ve hedef adres seçin.');
            return;
        }
        setLoading(true);
        try {
            // Sürücünün nerede olduğunu ve yolcunun nerede olduğunu loglayabilir veya mesafe ölçebiliriz.
            // Örnek basit fiyat hesaplaması (şu an sabit / tahmini)
            const price = 250;

            await addDoc(collection(db, 'InstantRides'), {
                passengerId: user.uid,
                passengerName: userData?.fullName || 'Yolcu',
                driverId: selectedMapDriver.driverId,
                origin: 'Mevcut Konum',
                destination: mapDestination,
                price: price.toString(),
                vehicleType: selectedMapDriver.vehicleType,
                status: 'pending',
                passengerLat: passengerLocation ? passengerLocation.coords.latitude : null,
                passengerLng: passengerLocation ? passengerLocation.coords.longitude : null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });

            Alert.alert("Başarılı", "Sürücüye anlık sürüş isteği gönderildi. Onay bekleniyor...");
            setSelectedMapDriver(null);
            setMapDestination('');

        } catch (error) {
            console.error("Anlık sürüş isteği hatası:", error);
            Alert.alert("Hata", "İstek gönderilemedi.");
        } finally {
            setLoading(false);
        }
    };

    const cancelReservation = async (reservationId: string) => {
        Alert.alert(
            "İptal Onayı",
            "Bu rezervasyonu iptal etmek istediğinize emin misiniz?",
            [
                { text: "Vazgeç", style: "cancel" },
                {
                    text: "Evet, İptal Et", style: "destructive", onPress: async () => {
                        try {
                            await updateDoc(doc(db, 'Reservations', reservationId), {
                                status: 'İptal Edildi'
                            });
                            Alert.alert('Bilgi', 'Rezervasyonunuz iptal edildi.');
                        } catch (error: any) {
                            Alert.alert('Hata', 'İptal işlemi başarısız: ' + error.message);
                        }
                    }
                }
            ]
        );
    };

    const submitReview = async () => {
        if (!selectedReservationForRating) return;

        setSubmittingReview(true);
        try {
            await addDoc(collection(db, 'Reviews'), {
                tripId: selectedReservationForRating.tripId,
                driverId: selectedReservationForRating.driverId,
                passengerId: auth.currentUser?.uid,
                passengerName: userData?.fullName || 'Bilinmeyen Yolcu',
                rating: ratingValue,
                comment: reviewText,
                createdAt: new Date().toISOString()
            });

            // Yorum yapıldıktan sonra aynı yolculuk için bir daha çıkmasın diye (opsiyonel) rezervasyona not düşebiliriz
            await updateDoc(doc(db, 'Reservations', selectedReservationForRating.id), {
                isReviewed: true
            });

            Alert.alert("Başarılı", "Değerlendirmeniz için teşekkür ederiz!");
            setIsRatingModalVisible(false);
            setRatingValue(5);
            setReviewText('');
            setSelectedReservationForRating(null);

        } catch (error: any) {
            Alert.alert("Hata", "Değerlendirme gönderilemedi: " + error.message);
        } finally {
            setSubmittingReview(false);
        }
    };

    const fetchDriverProfile = async (driverId: string) => {
        setLoadingDriver(true);
        setIsDriverModalVisible(true);
        try {
            // 1. Sürücü Bilgilerini Çek
            const driverDoc = await getDoc(doc(db, 'Users', driverId));
            if (driverDoc.exists()) {
                setSelectedDriverProfile({ id: driverDoc.id, ...driverDoc.data() });
            } else {
                setSelectedDriverProfile(null);
            }

            // 2. Sürücüye ait değerlendirmeleri çek
            const qReviews = query(collection(db, 'Reviews'), where('driverId', '==', driverId));
            const reviewSnap = await getDocs(qReviews);
            const rData: any[] = [];
            reviewSnap.forEach(d => rData.push({ id: d.id, ...d.data() }));

            // Yeniden eskiye sırala
            rData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setDriverReviews(rData);

        } catch (error) {
            console.error("Sürücü profili çekilirken hata:", error);
            Alert.alert("Hata", "Sürücü bilgileri alınamadı.");
        } finally {
            setLoadingDriver(false);
        }
    };

    // Sekmelerin Render Fonksiyonları
    const renderAra = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>🔍 Yolculuk Ara</Text>

            <View style={styles.card}>
                <Text style={styles.label}>Nereden</Text>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalCityScroll}>
                    {cities.map((city) => (
                        <TouchableOpacity
                            key={`origin-${city}`}
                            style={[styles.cityRow, searchOrigin === city && styles.activeCityRow]}
                            onPress={() => setSearchOrigin(city)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.cityRowText, searchOrigin === city && styles.activeCityRowText]}>{city}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={styles.label}>Nereye</Text>
                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalCityScroll}>
                    {cities.map((city) => (
                        <TouchableOpacity
                            key={`dest-${city}`}
                            style={[styles.cityRow, searchDestination === city && styles.activeCityRow]}
                            onPress={() => setSearchDestination(city)}
                            activeOpacity={0.7}
                        >
                            <Text style={[styles.cityRowText, searchDestination === city && styles.activeCityRowText]}>{city}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={styles.label}>Tarih</Text>
                <TouchableOpacity
                    style={styles.input}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.8}
                >
                    <Text style={{ color: '#FFFFFF', fontSize: 16 }}>
                        {`${searchDate.getDate().toString().padStart(2, '0')}/${(searchDate.getMonth() + 1).toString().padStart(2, '0')}/${searchDate.getFullYear()}`}
                    </Text>
                </TouchableOpacity>
                {showDatePicker && (
                    <DateTimePicker
                        value={searchDate}
                        mode="date"
                        display="default"
                        onChange={(event, selectedDate) => {
                            setShowDatePicker(false);
                            if (selectedDate) setSearchDate(selectedDate);
                        }}
                    />
                )}

                <TouchableOpacity style={styles.primaryButton} onPress={handleSearch} activeOpacity={0.8} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Seferleri Bul 🚀</Text>}
                </TouchableOpacity>
            </View>

            {searchResults.length > 0 && <Text style={styles.subTitle}>Arama Sonuçları</Text>}

            {searchResults.map((trip) => (
                <View key={trip.id} style={styles.tripCard}>
                    <View style={styles.tripHeader}>
                        <View>
                            <Text style={styles.tripRoute}>{trip.origin} ➔ {trip.destination}</Text>
                            <Text style={styles.tripTime}>📅 {trip.date} - 🕒 {trip.time}</Text>
                        </View>
                        <Text style={styles.tripPrice}>₺ {trip.price}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.driverInfoContainer}
                        activeOpacity={0.7}
                        onPress={() => fetchDriverProfile(trip.driverId)}
                    >
                        <View style={styles.driverProfileBadge}>
                            <Text style={styles.driverInitials}>SÜ</Text>
                        </View>
                        <View style={styles.driverDetails}>
                            <Text style={styles.driverName}>Sürücü ID: {trip.driverId.substring(0, 5)}... <Text style={{ fontSize: 12, color: '#4CAF50' }}>(İncele)</Text></Text>
                            <Text style={styles.driverRating}>Araç Tipi: {trip.vehicleType}</Text>
                        </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.8} onPress={() => handleReservation(trip)}>
                        <Text style={styles.secondaryButtonText}>Rezervasyon Yap</Text>
                    </TouchableOpacity>
                </View>
            ))}
        </ScrollView>
    );

    const renderBiletlerim = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>🎫 Biletlerim & Rezervasyonlar</Text>

            {myReservations.length === 0 ? (
                <Text style={{ color: '#AAAAAA' }}>Henüz bir biletiniz veya rezervasyonunuz bulunmuyor.</Text>
            ) : (
                myReservations.map((res) => (
                    <View key={res.id} style={[styles.card, res.status === 'Onaylandı' ? styles.ticketCard : {}]}>
                        <View style={styles.ticketHeader}>
                            <Text style={styles.ticketRoute}>{res.tripInfo?.origin} ➔ {res.tripInfo?.destination}</Text>
                            <Text style={[
                                res.status === 'Onaylandı' ? styles.statusApproved :
                                    res.status === 'Bekliyor' ? styles.statusPending :
                                        { color: '#F44336', fontWeight: 'bold' }
                            ]}>
                                {res.status}
                            </Text>
                        </View>

                        <Text style={styles.tripTime}>📅 {res.tripInfo?.date} - 🕒 {res.tripInfo?.time} | ₺ {res.tripInfo?.price}</Text>

                        {/* Canlı sefer durumu "Tamamlandı" ise ve rezervasyon Onaylandı ise değerlendirme butonu göster */}
                        {res.status === 'Onaylandı' && res.liveTripStatus === 'Tamamlandı' && !res.isReviewed && (
                            <TouchableOpacity
                                style={[styles.primaryButton, { marginTop: 12, backgroundColor: '#4CAF50' }]}
                                activeOpacity={0.8}
                                onPress={() => {
                                    setSelectedReservationForRating(res);
                                    setIsRatingModalVisible(true);
                                }}
                            >
                                <Text style={styles.primaryButtonText}>Değerlendir & Yorum Yap ⭐</Text>
                            </TouchableOpacity>
                        )}

                        {res.status === 'Onaylandı' && res.liveTripStatus === 'Tamamlandı' && res.isReviewed && (
                            <View style={{ marginTop: 12, padding: 8, backgroundColor: 'rgba(76, 175, 80, 0.2)', borderRadius: 8, alignItems: 'center' }}>
                                <Text style={{ color: '#4CAF50', fontWeight: 'bold' }}>Değerlendirildi ⭐</Text>
                            </View>
                        )}

                        {res.liveTripStatus !== 'Tamamlandı' && res.status !== 'İptal Edildi' && res.status !== 'Reddedildi' && (
                            <TouchableOpacity
                                style={[styles.dangerButtonOutline, { marginTop: 12 }]}
                                activeOpacity={0.8}
                                onPress={() => cancelReservation(res.id)}
                            >
                                <Text style={styles.dangerButtonText}>İptal Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))
            )}
        </ScrollView>
    );

    const renderHarita = () => (
        <View style={{ flex: 1 }}>
            {passengerLocation ? (
                <MapView
                    style={{ flex: 1 }}
                    initialRegion={{
                        latitude: passengerLocation.coords.latitude,
                        longitude: passengerLocation.coords.longitude,
                        latitudeDelta: 0.05,
                        longitudeDelta: 0.05,
                    }}
                    showsUserLocation={true}
                >
                    {activeDrivers.map((driver) => (
                        <Marker
                            key={driver.driverId}
                            coordinate={{ latitude: driver.latitude, longitude: driver.longitude }}
                            title={driver.fullName}
                            description={`${driver.vehicleType} - ⭐ ${driver.rating}`}
                            onPress={() => setSelectedMapDriver(driver)}
                        >
                            <Text style={{ fontSize: 30 }}>🚗</Text>
                        </Marker>
                    ))}
                </MapView>
            ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#FF9800" />
                    <Text style={{ color: '#FFF', marginTop: 10 }}>Konum Bekleniyor...</Text>
                </View>
            )}

            {/* Anlık Sürüş Durumu Kutusu */}
            {currentInstantRide && (
                <View style={styles.rideStatusOverlay}>
                    <Text style={styles.rideStatusTitle}>Anlık Sürüş Durumu</Text>
                    <Text style={{ color: '#FFF', marginBottom: 5 }}>
                        Durum:
                        <Text style={{ fontWeight: 'bold', color: currentInstantRide.status === 'accepted' ? '#4CAF50' : '#FF9800' }}>
                            {currentInstantRide.status === 'pending' ? ' Bekleniyor' : ' Sürücü Geliyor!'}
                        </Text>
                    </Text>
                    <Text style={{ color: '#AAAAAA' }}>Hedef: {currentInstantRide.destination}</Text>

                    {/* İptal Etme eklenebilir. Basitlik açısından atlandı. */}
                </View>
            )}

            {/* Sürücü Seçildiğinde Çıkan Seçenek Kutusu */}
            {selectedMapDriver && !currentInstantRide && (
                <View style={styles.mapActionOverlay}>
                    <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>Sürücü: {selectedMapDriver.fullName}</Text>
                    <Text style={{ color: '#AAAAAA', marginBottom: 15 }}>{selectedMapDriver.vehicleType} | {selectedMapDriver.rating}⭐</Text>

                    <View style={styles.inputContainer}>
                        <Text style={styles.inputLabel}>Nereye Gidiyorsunuz?</Text>
                        <TextInput
                            style={styles.input}
                            value={mapDestination}
                            onChangeText={setMapDestination}
                            placeholder="Örn: Kadıköy Meydan"
                            placeholderTextColor="#AAAAAA"
                        />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10 }}>
                        <TouchableOpacity
                            style={[styles.secondaryButton, { flex: 1 }]}
                            onPress={() => setSelectedMapDriver(null)}
                        >
                            <Text style={styles.secondaryButtonText}>İptal</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.primaryButton, { flex: 1, marginTop: 0 }]}
                            onPress={handleRequestInstantRide}
                            disabled={loading || !mapDestination}
                        >
                            <Text style={styles.primaryButtonText}>{loading ? '...' : 'Çağır'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );

    const renderCuzdan = () => (
        <View style={styles.scrollContent}>
            <Text style={styles.sectionTitle}>💳 Cüzdanım</Text>

            <View style={styles.walletCard}>
                <Text style={styles.walletLabel}>Mevcut Bakiye</Text>
                <Text style={styles.walletBalance}>₺ 1,250.00</Text>
                <TouchableOpacity style={styles.addMoneyButton} activeOpacity={0.8}>
                    <Text style={styles.addMoneyText}>+ Bakiye Yükle</Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.subTitle}>Son İşlemler</Text>
            <View style={styles.card}>
                <View style={styles.historyItem}>
                    <View>
                        <Text style={styles.historyTitle}>Bilet Alımı: Bursa ➔ İzmir</Text>
                        <Text style={styles.historyDate}>22.11.2026</Text>
                    </View>
                    <Text style={styles.historyAmountNegative}>- ₺350</Text>
                </View>
                <View style={styles.historyItem}>
                    <View>
                        <Text style={styles.historyTitle}>Bakiye Yükleme (Kredi Kartı)</Text>
                        <Text style={styles.historyDate}>20.11.2026</Text>
                    </View>
                    <Text style={styles.historyAmountPositive}>+ ₺1000</Text>
                </View>
            </View>
        </View>
    );

    const renderProfil = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>👤 Yolcu Profili</Text>

            <View style={[styles.card, { alignItems: 'center', paddingVertical: 30 }]}>
                <View style={[styles.profileBadge, { width: 80, height: 80, borderRadius: 40, marginBottom: 16 }]}>
                    <Text style={[styles.profileInitials, { fontSize: 32 }]}>
                        {userData ? userData.fullName?.substring(0, 2).toUpperCase() : 'US'}
                    </Text>
                </View>
                <Text style={{ color: '#FFFFFF', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>
                    {userData ? userData.fullName : 'Yükleniyor...'}
                </Text>
                <Text style={{ color: '#AAAAAA', fontSize: 16, marginBottom: 16 }}>
                    @{userData ? userData.username : 'kullanici_adi'}
                </Text>
            </View>

            <View style={styles.card}>
                <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }]}>
                    <Text style={[styles.subTitle, { marginBottom: 0 }]}>Hesap Bilgileri</Text>
                    <TouchableOpacity onPress={() => setIsEditingProfile(!isEditingProfile)}>
                        <Text style={{ color: '#FF9800', fontWeight: 'bold' }}>
                            {isEditingProfile ? 'İptal Et' : 'Düzenle'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.historyItem, { borderBottomWidth: isEditingProfile ? 0 : 1 }]}>
                    <Text style={{ color: '#AAAAAA' }}>Ad Soyad</Text>
                    {isEditingProfile ? (
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 16, marginBottom: 0, padding: 8 }]}
                            value={editFullName}
                            onChangeText={setEditFullName}
                            placeholderTextColor="#AAAAAA"
                        />
                    ) : (
                        <Text style={{ color: '#FFFFFF' }}>{userData ? userData.fullName : 'Yükleniyor...'}</Text>
                    )}
                </View>
                <View style={[styles.historyItem, { borderBottomWidth: isEditingProfile ? 0 : 1 }]}>
                    <Text style={{ color: '#AAAAAA' }}>Kullanıcı Adı</Text>
                    {isEditingProfile ? (
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 16, marginBottom: 0, padding: 8 }]}
                            value={editUsername}
                            onChangeText={setEditUsername}
                            autoCapitalize="none"
                            placeholderTextColor="#AAAAAA"
                        />
                    ) : (
                        <Text style={{ color: '#FFFFFF' }}>@{userData ? userData.username : 'kullanici_adi'}</Text>
                    )}
                </View>
                <View style={[styles.historyItem, { borderBottomWidth: isEditingProfile ? 0 : 1 }]}>
                    <Text style={{ color: '#AAAAAA' }}>Telefon</Text>
                    {isEditingProfile ? (
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 16, marginBottom: 0, padding: 8 }]}
                            value={editPhone}
                            onChangeText={setEditPhone}
                            keyboardType="phone-pad"
                            placeholderTextColor="#AAAAAA"
                        />
                    ) : (
                        <Text style={{ color: '#FFFFFF' }}>{userData ? userData.phone : 'Yükleniyor...'}</Text>
                    )}
                </View>
                <View style={styles.historyItem}>
                    <Text style={{ color: '#AAAAAA' }}>E-Posta</Text>
                    <Text style={{ color: '#FFFFFF' }}>{userData ? userData.email : 'Yükleniyor...'}</Text>
                </View>
                <View style={styles.historyItem}>
                    <Text style={{ color: '#AAAAAA' }}>Rol</Text>
                    <Text style={{ color: '#FF9800', fontWeight: 'bold' }}>{userData ? userData.role : 'Yolcu'}</Text>
                </View>

                {isEditingProfile && (
                    <TouchableOpacity
                        style={[styles.primaryButton, { marginTop: 16 }]}
                        onPress={handleUpdateProfile}
                        disabled={updatingProfile}
                    >
                        {updatingProfile ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Kaydet</Text>}
                    </TouchableOpacity>
                )}
            </View>

            <TouchableOpacity
                style={[styles.dangerButtonOutline, { marginTop: 20, paddingVertical: 16 }]}
                activeOpacity={0.8}
                onPress={() => {
                    Alert.alert(
                        "Çıkış Yap",
                        "Hesabınızdan çıkış yapmak istediğinize emin misiniz?",
                        [
                            { text: "İptal", style: "cancel" },
                            {
                                text: "Çıkış Yap", style: "destructive", onPress: async () => {
                                    try {
                                        await auth.signOut();
                                        if (onLogout) {
                                            onLogout();
                                        }
                                    } catch (error) {
                                        console.error("Çıkış yaparken hata:", error);
                                        Alert.alert("Hata", "Çıkış işlemi başarısız oldu.");
                                    }
                                }
                            }
                        ]
                    );
                }}
            >
                <Text style={[styles.dangerButtonText, { fontSize: 16 }]}>Çıkış Yap</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Üst Başlık */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Yolcu Paneli</Text>
                <TouchableOpacity style={styles.profileBadge} onPress={() => setActiveTab('Profil')} activeOpacity={0.8}>
                    <Text style={styles.profileInitials}>
                        {userData ? userData.fullName?.substring(0, 2).toUpperCase() : 'US'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* İçerik Alanı */}
            <View style={styles.contentArea}>
                {activeTab === 'Ara' && renderAra()}
                {activeTab === 'Biletlerim' && renderBiletlerim()}
                {activeTab === 'Harita' && renderHarita()}
                {activeTab === 'Cuzdan' && renderCuzdan()}
                {activeTab === 'Profil' && renderProfil()}
            </View>

            {/* Değerlendirme Modalı */}
            <Modal
                transparent={true}
                visible={isRatingModalVisible}
                animationType="fade"
                onRequestClose={() => setIsRatingModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Sürücüyü Değerlendir</Text>

                        <View style={styles.starsContainer}>
                            {[1, 2, 3, 4, 5].map((star) => (
                                <TouchableOpacity key={star} onPress={() => setRatingValue(star)}>
                                    <Text style={[styles.starIcon, { color: star <= ratingValue ? '#FFC107' : '#555555' }]}>
                                        ★
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <Text style={styles.ratingLabel}>{ratingValue} Yıldız</Text>

                        <TextInput
                            style={styles.reviewInput}
                            placeholder="Yolculuk nasıldı? (İsteğe bağlı)"
                            placeholderTextColor="#AAAAAA"
                            multiline
                            numberOfLines={4}
                            value={reviewText}
                            onChangeText={setReviewText}
                        />

                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.secondaryButton, { flex: 1, marginRight: 8 }]}
                                onPress={() => setIsRatingModalVisible(false)}
                            >
                                <Text style={styles.secondaryButtonText}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.primaryButton, { flex: 1, marginLeft: 8 }]}
                                onPress={submitReview}
                                disabled={submittingReview}
                            >
                                {submittingReview ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryButtonText}>Gönder</Text>}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Sürücü Bilgileri Modalı */}
            <Modal
                transparent={true}
                visible={isDriverModalVisible}
                animationType="slide"
                onRequestClose={() => setIsDriverModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: '80%', padding: 0, overflow: 'hidden' }]}>
                        {loadingDriver ? (
                            <View style={{ padding: 40 }}>
                                <ActivityIndicator size="large" color="#FF9800" />
                                <Text style={{ color: '#FFF', marginTop: 10 }}>Sürücü bilgileri yükleniyor...</Text>
                            </View>
                        ) : selectedDriverProfile && (
                            <ScrollView style={{ width: '100%' }} contentContainerStyle={{ padding: 20 }}>
                                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                    <View style={[styles.driverProfileBadge, { width: 64, height: 64, borderRadius: 32 }]}>
                                        <Text style={[styles.driverInitials, { fontSize: 28 }]}>
                                            {selectedDriverProfile.fullName?.substring(0, 2).toUpperCase() || 'SÜ'}
                                        </Text>
                                    </View>
                                    <Text style={{ color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 12 }}>
                                        {selectedDriverProfile.fullName}
                                    </Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                                        <Text style={{ color: '#FFC107', fontSize: 18, marginRight: 4 }}>⭐</Text>
                                        <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>
                                            {driverReviews.length > 0 ? (driverReviews.reduce((acc, curr) => acc + curr.rating, 0) / driverReviews.length).toFixed(1) : '5.0'}
                                        </Text>
                                        <Text style={{ color: '#AAAAAA', fontSize: 14, marginLeft: 8 }}>
                                            ({driverReviews.length} Değerlendirme)
                                        </Text>
                                    </View>
                                </View>

                                <View style={{ backgroundColor: '#2A2A2A', borderRadius: 8, padding: 16, marginBottom: 20 }}>
                                    <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 10 }}>Son Yorumlar</Text>
                                    {driverReviews.length === 0 ? (
                                        <Text style={{ color: '#AAAAAA' }}>Henüz değerlendirme yok.</Text>
                                    ) : (
                                        driverReviews.slice(0, 5).map(rev => (
                                            <View key={rev.id} style={{ borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 10 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>{rev.passengerName}</Text>
                                                    <Text style={{ color: '#FFC107', fontSize: 12 }}>
                                                        {[...Array(5)].map((_, i) => (i < rev.rating ? '★' : '☆')).join('')}
                                                    </Text>
                                                </View>
                                                {rev.comment ? (
                                                    <Text style={{ color: '#AAAAAA', fontStyle: 'italic', fontSize: 13, marginBottom: 4 }}>"{rev.comment}"</Text>
                                                ) : null}
                                                <Text style={{ color: '#666', fontSize: 11 }}>
                                                    {new Date(rev.createdAt).toLocaleDateString('tr-TR')}
                                                </Text>
                                            </View>
                                        ))
                                    )}
                                </View>

                                <TouchableOpacity
                                    style={styles.primaryButton}
                                    activeOpacity={0.8}
                                    onPress={() => setIsDriverModalVisible(false)}
                                >
                                    <Text style={styles.primaryButtonText}>Kapat</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Alt Menü (Bottom Navigation) */}
            <View style={styles.bottomNav}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Ara')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.navIcon, activeTab === 'Ara' && styles.activeNavIcon]}>🔍</Text>
                    <Text style={[styles.navText, activeTab === 'Ara' && styles.activeNavText]}>Ara</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Harita')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.navIcon, activeTab === 'Harita' && styles.activeNavIcon]}>🗺️</Text>
                    <Text style={[styles.navText, activeTab === 'Harita' && styles.activeNavText]}>Harita</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Biletlerim')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.navIcon, activeTab === 'Biletlerim' && styles.activeNavIcon]}>🎫</Text>
                    <Text style={[styles.navText, activeTab === 'Biletlerim' && styles.activeNavText]}>Biletlerim</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Cuzdan')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.navIcon, activeTab === 'Cuzdan' && styles.activeNavIcon]}>💳</Text>
                    <Text style={[styles.navText, activeTab === 'Cuzdan' && styles.activeNavText]}>Cüzdan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Profil')}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.navIcon, activeTab === 'Profil' && styles.activeNavIcon]}>👤</Text>
                    <Text style={[styles.navText, activeTab === 'Profil' && styles.activeNavText]}>Profil</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 40,
        paddingBottom: 20,
        backgroundColor: '#1E1E1E',
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    profileBadge: {
        backgroundColor: '#FF9800',
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileInitials: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    contentArea: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginVertical: 10,
        marginBottom: 20,
    },
    subTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 10,
        marginBottom: 16,
    },
    card: {
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
    },
    label: {
        color: '#AAAAAA',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#333333',
        borderRadius: 12,
        padding: 14,
        color: '#FFFFFF',
        fontSize: 16,
        marginBottom: 16,
    },
    verticalCityScroll: {
        maxHeight: 150,
        marginBottom: 16,
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#333333',
    },
    cityRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    activeCityRow: {
        backgroundColor: 'rgba(255, 152, 0, 0.15)',
        borderBottomColor: 'transparent',
    },
    cityRowText: {
        color: '#AAAAAA',
        fontSize: 16,
        fontWeight: '500',
    },
    activeCityRowText: {
        color: '#FF9800',
        fontWeight: 'bold',
    },
    primaryButton: {
        backgroundColor: '#FF9800',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#FF9800',
        shadowOpacity: 0.3,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
        marginTop: 8,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    tripCard: {
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#FF9800',
    },
    tripHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    tripRoute: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    tripTime: {
        color: '#AAAAAA',
        fontSize: 14,
    },
    tripPrice: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#4CAF50',
    },
    driverInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        backgroundColor: '#2A2A2A',
        padding: 12,
        borderRadius: 12,
    },
    driverProfileBadge: {
        backgroundColor: '#333333',
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    driverInitials: {
        color: '#AAAAAA',
        fontWeight: 'bold',
        fontSize: 16,
    },
    driverDetails: {
        flex: 1,
    },
    driverName: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    driverRating: {
        color: '#FF9800',
        fontSize: 12,
    },
    secondaryButton: {
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
        borderWidth: 1,
        borderColor: '#FF9800',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#FF9800',
        fontWeight: 'bold',
        fontSize: 15,
    },
    ticketCard: {
        borderTopWidth: 4,
        borderTopColor: '#4CAF50',
    },
    ticketHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    ticketRoute: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    statusApproved: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        color: '#4CAF50',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 'bold',
        overflow: 'hidden',
    },
    statusPending: {
        backgroundColor: 'rgba(255, 152, 0, 0.2)',
        color: '#FF9800',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 'bold',
        overflow: 'hidden',
    },
    ticketDetailsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#2A2A2A',
        padding: 16,
        borderRadius: 12,
    },
    ticketDetailColumn: {
        alignItems: 'center',
    },
    ticketLabel: {
        color: '#AAAAAA',
        fontSize: 12,
        marginBottom: 4,
    },
    ticketValue: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: '#333333',
        marginVertical: 16,
    },
    ticketFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    driverNameSmall: {
        color: '#AAAAAA',
        fontSize: 14,
    },
    chatButton: {
        backgroundColor: '#333333',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
    },
    chatButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '500',
    },
    dangerButtonOutline: {
        borderWidth: 1,
        borderColor: '#F44336',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    dangerButtonText: {
        color: '#F44336',
        fontWeight: '600',
    },
    walletCard: {
        backgroundColor: '#FF9800',
        borderRadius: 20,
        padding: 24,
        marginBottom: 24,
        shadowColor: '#FF9800',
        shadowOpacity: 0.4,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
    },
    walletLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 16,
        marginBottom: 8,
    },
    walletBalance: {
        color: '#FFFFFF',
        fontSize: 36,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    addMoneyButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignSelf: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
    },
    addMoneyText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 14,
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    row: {
        flexDirection: 'row',
    },
    historyTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        marginBottom: 4,
    },
    historyDate: {
        color: '#AAAAAA',
        fontSize: 12,
    },
    historyAmountNegative: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    historyAmountPositive: {
        color: '#4CAF50',
        fontWeight: 'bold',
        fontSize: 16,
    },
    bottomNav: {
        flexDirection: 'row',
        backgroundColor: '#1E1E1E',
        paddingVertical: 12,
        paddingBottom: 24,
        borderTopWidth: 1,
        borderTopColor: '#333333',
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    navIcon: {
        fontSize: 20,
        color: '#AAAAAA',
        marginBottom: 4,
    },
    activeNavIcon: {
        color: '#FF9800',
    },
    navText: {
        fontSize: 12,
        color: '#AAAAAA',
        fontWeight: '500',
    },
    activeNavText: {
        color: '#FF9800',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        backgroundColor: '#1E1E1E',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        alignItems: 'center'
    },
    modalTitle: {
        color: '#FFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 16
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 8
    },
    starIcon: {
        fontSize: 40,
    },
    ratingLabel: {
        color: '#FF9800',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 16
    },
    reviewInput: {
        backgroundColor: '#333333',
        color: '#FFF',
        width: '100%',
        borderRadius: 8,
        padding: 12,
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 20
    },
    modalButtons: {
        flexDirection: 'row',
        width: '100%'
    },
    rideStatusOverlay: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        backgroundColor: 'rgba(30,30,30,0.95)',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    rideStatusTitle: {
        color: '#FF9800',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8
    },
    mapActionOverlay: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: '#1E1E1E',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#333',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
    },
    inputContainer: {
        marginBottom: 16,
    },
    inputLabel: {
        color: '#AAAAAA',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500',
    }
});
