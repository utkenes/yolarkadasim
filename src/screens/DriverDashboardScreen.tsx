import DateTimePicker from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { auth, db } from '../config/firebase';
import { calculateSuggestedPrice } from '../utils/pricing';
import { calculateRoute } from '../utils/routing';

type TabType = 'YeniSefer' | 'Seferlerim' | 'Harita' | 'Talepler' | 'Kazanc' | 'Profil';

const SwipeToggle = ({ isOnline, onToggle, loading }: { isOnline: boolean, onToggle: () => void, loading: boolean }) => {
    const slideWidth = 140;
    const thumbWidth = 44;
    const maxSlide = slideWidth - thumbWidth;

    const pan = React.useRef(new Animated.Value(isOnline ? maxSlide : 0)).current;

    const isOnlineRef = React.useRef(isOnline);
    const loadingRef = React.useRef(loading);
    const onToggleRef = React.useRef(onToggle);

    React.useEffect(() => {
        isOnlineRef.current = isOnline;
        loadingRef.current = loading;
        onToggleRef.current = onToggle;
    }, [isOnline, loading, onToggle]);

    React.useEffect(() => {
        Animated.spring(pan, {
            toValue: isOnline ? maxSlide : 0,
            useNativeDriver: false,
            friction: 8,
            tension: 40
        }).start();
    }, [isOnline]);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                if (loadingRef.current) return;
                const online = isOnlineRef.current;
                let newX = (online ? maxSlide : 0) + gestureState.dx;
                if (newX < 0) newX = 0;
                if (newX > maxSlide) newX = maxSlide;
                pan.setValue(newX);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (loadingRef.current) return;
                const online = isOnlineRef.current;
                let currentX = (online ? maxSlide : 0) + gestureState.dx;
                if (!online && currentX > maxSlide * 0.65) {
                    onToggleRef.current();
                } else if (online && currentX < maxSlide * 0.35) {
                    onToggleRef.current();
                } else {
                    Animated.spring(pan, {
                        toValue: online ? maxSlide : 0,
                        useNativeDriver: false,
                        friction: 8,
                        tension: 40
                    }).start();
                }
            },
        })
    ).current;

    return (
        <View style={{
            width: slideWidth,
            height: 44,
            backgroundColor: isOnline ? 'rgba(76, 175, 80, 0.2)' : '#333333',
            borderRadius: 22,
            justifyContent: 'center',
            marginRight: 15,
            borderWidth: 1,
            borderColor: isOnline ? '#4CAF50' : '#555555',
            overflow: 'hidden',
        }}>
            <Text style={{
                position: 'absolute',
                width: '100%',
                textAlign: 'center',
                color: isOnline ? '#4CAF50' : '#AAAAAA',
                fontWeight: 'bold',
                fontSize: 13,
                paddingLeft: isOnline ? 0 : 25,
                paddingRight: isOnline ? 25 : 0,
            }}>
                {loading ? 'Bekleyin...' : (isOnline ? 'Online' : 'Kaydır & Aç')}
            </Text>
            <Animated.View
                {...panResponder.panHandlers}
                style={{
                    height: 40,
                    width: thumbWidth,
                    backgroundColor: isOnline ? '#4CAF50' : '#FFFFFF',
                    borderRadius: 20,
                    position: 'absolute',
                    left: 1,
                    transform: [{ translateX: pan }],
                    alignItems: 'center',
                    justifyContent: 'center',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 3,
                    elevation: 5,
                }}
            >
                <Text style={{ fontSize: 18 }}>{isOnline ? '🚙' : '⭕'}</Text>
            </Animated.View>
        </View>
    );
};

interface DriverDashboardProps {
    onLogout?: () => void;
}

export default function DriverDashboardScreen({ onLogout }: DriverDashboardProps) {
    const [activeTab, setActiveTab] = useState<TabType>('YeniSefer');

    // Yeni Sefer Form State
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [date, setDate] = useState(new Date());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedHour, setSelectedHour] = useState('12');
    const [selectedMinute, setSelectedMinute] = useState('00');
    const [showHourPicker, setShowHourPicker] = useState(false);
    const [showMinutePicker, setShowMinutePicker] = useState(false);
    const [price, setPrice] = useState('');
    const [vehicle, setVehicle] = useState('Sedan');

    const [loading, setLoading] = useState(false);
    const [trips, setTrips] = useState<any[]>([]);
    const [reservations, setReservations] = useState<any[]>([]);
    const [reviews, setReviews] = useState<any[]>([]);
    const [userData, setUserData] = useState<any>(null);

    // Anlık Sürüş (Uber Mantığı) State'leri
    const [isOnline, setIsOnline] = useState(false);
    const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
    const [locationSubscription, setLocationSubscription] = useState<Location.LocationSubscription | null>(null);
    const [incomingRide, setIncomingRide] = useState<any>(null);
    const [activeInstantRides, setActiveInstantRides] = useState<any[]>([]);

    // Profil Düzenleme State'leri
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [editFullName, setEditFullName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [updatingProfile, setUpdatingProfile] = useState(false);

    const cities = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Kocaeli"];
    const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;

        // Kullanıcı verisini çekiyoruz
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

        const qRes = query(collection(db, 'Reservations'), where('driverId', '==', user.uid));
        const unsubscribeRes = onSnapshot(qRes, (snapshot) => {
            const resData: any[] = [];
            snapshot.forEach((docSnap) => {
                resData.push({ id: docSnap.id, ...docSnap.data() });
            });
            setReservations(resData);
        });

        const qTrips = query(collection(db, 'Trips'), where('driverId', '==', user.uid));
        const unsubscribeTrips = onSnapshot(qTrips, (snapshot) => {
            const tripsData: any[] = [];
            snapshot.forEach((doc) => {
                tripsData.push({ id: doc.id, ...doc.data() });
            });
            // Tarihe göre sırala (en yeni en üstte)
            tripsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setTrips(tripsData);
        });

        const qReviews = query(collection(db, 'Reviews'), where('driverId', '==', user.uid));
        const unsubscribeReviews = onSnapshot(qReviews, (snapshot) => {
            const reviewsData: any[] = [];
            snapshot.forEach((docSnap) => {
                reviewsData.push({ id: docSnap.id, ...docSnap.data() });
            });
            // Tarihe göre yeniden eskiye sıralama
            reviewsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setReviews(reviewsData);
        });

        // Driver'ın anlık sürüş isteklerini dinle (Talepler sekmesi için)
        const qInstant = query(collection(db, 'InstantRides'), where('driverId', '==', user.uid));
        const unsubscribeInstant = onSnapshot(qInstant, (snapshot) => {
            const instantData: any[] = [];
            snapshot.forEach((docSnap) => {
                instantData.push({ id: docSnap.id, ...docSnap.data() });
            });
            // En yeniler üstte
            instantData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setActiveInstantRides(instantData);
        });

        // Anlık sürüş isteklerini dinle (Modal için)
        const qInstantRides = query(
            collection(db, 'InstantRides'),
            where('driverId', '==', user.uid),
            where('status', '==', 'pending')
        );
        const unsubscribeInstantRides = onSnapshot(qInstantRides, (snapshot) => {
            if (!snapshot.empty) {
                // Sadece ilk gelen isteği göster (basitlik adına)
                const docSnap = snapshot.docs[0];
                setIncomingRide({ id: docSnap.id, ...docSnap.data() });
            } else {
                setIncomingRide(null);
            }
        });

        // Online durumu değişirse veya component unmount olursa aboneliği temizle
        return () => {
            unsubscribeTrips();
            unsubscribeRes();
            unsubscribeReviews();
            unsubscribeInstantRides();
            if (locationSubscription) {
                locationSubscription.remove();
            }
            // Sürücü çıkış yaptığında onu ActiveDrivers'dan sil
            if (isOnline) {
                deleteDoc(doc(db, 'ActiveDrivers', user.uid)).catch(console.error);
            }
        };
    }, []);

    // Rota ve Ücret Tahmini Effect'i
    useEffect(() => {
        if (origin && destination && vehicle) {
            const { distance } = calculateRoute(origin, destination);
            if (distance > 0) {
                const suggestedPrice = calculateSuggestedPrice(distance, vehicle);
                setPrice(suggestedPrice.toString());
            }
        }
    }, [origin, destination, vehicle]);

    // Online/Offline Durumunu Değiştirme
    const toggleOnlineStatus = async () => {
        const user = auth.currentUser;
        if (!user) return;

        if (isOnline) {
            // Offline ol
            if (locationSubscription) {
                locationSubscription.remove();
                setLocationSubscription(null);
            }
            try {
                await deleteDoc(doc(db, 'ActiveDrivers', user.uid));
            } catch (err) {
                console.error("Offline olurken hata:", err);
            }
            setIsOnline(false);
            setCurrentLocation(null);
            Alert.alert("Bilgi", "Artık çevrimdışısınız. Anlık sürüş istekleri almayacaksınız.");
        } else {
            // Online ol - Konum izni al
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Hata', 'Konum izni reddedildi. Online olmak için konum izni gereklidir.');
                return;
            }

            setLoading(true);
            try {
                // İlk konumu al
                const location = await Location.getCurrentPositionAsync({});
                setCurrentLocation(location);

                // Veritabanına yaz
                await setDoc(doc(db, 'ActiveDrivers', user.uid), {
                    driverId: user.uid,
                    fullName: userData?.fullName || 'Bilinmiyor',
                    rating: userData?.rating || 5.0,
                    vehicleType: vehicle,
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    isAvailable: true,
                    updatedAt: new Date().toISOString()
                });

                // Konum değiştikçe güncellemek için abone ol
                const sub = await Location.watchPositionAsync(
                    {
                        accuracy: Location.Accuracy.High,
                        distanceInterval: 50, // 50 metrede bir güncelle
                        timeInterval: 10000, // veya 10 saniyede bir
                    },
                    (newLocation) => {
                        setCurrentLocation(newLocation);
                        setDoc(doc(db, 'ActiveDrivers', user.uid), {
                            driverId: user.uid,
                            fullName: userData?.fullName || 'Bilinmiyor',
                            rating: userData?.rating || 5.0,
                            vehicleType: vehicle,
                            latitude: newLocation.coords.latitude,
                            longitude: newLocation.coords.longitude,
                            isAvailable: true,
                            updatedAt: new Date().toISOString()
                        }, { merge: true }).catch(console.error);
                    }
                );

                setLocationSubscription(sub);
                setIsOnline(true);
                Alert.alert("Başarılı", "Artık çevrimiçisiniz! Haritadaki yolcular sizi görebilir.");
            } catch (err) {
                console.error("Online olurken hata:", err);
                Alert.alert("Hata", "Konum alınamadı. Lütfen gps'inizin açık olduğundan emin olun.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleAcceptInstantRide = async () => {
        if (!incomingRide) return;
        try {
            await updateDoc(doc(db, 'InstantRides', incomingRide.id), {
                status: 'accepted',
                updatedAt: new Date().toISOString()
            });
            Alert.alert("Başarılı", "Yolcuya gidiyorsunuz! Lütfen iletişime geçin.");
            setIncomingRide(null); // Modalı kapat
            // ActiveDrivers collection'da isAvailable değerini false yapabiliriz
            const user = auth.currentUser;
            if (user && isOnline) {
                await updateDoc(doc(db, 'ActiveDrivers', user.uid), {
                    isAvailable: false
                });
            }
        } catch (error) {
            console.error("Yolculuk kabul edilirken hata:", error);
            Alert.alert("Hata", "Yolculuk kabul edilemedi.");
        }
    };

    const handleRejectInstantRide = async () => {
        if (!incomingRide) return;
        try {
            await updateDoc(doc(db, 'InstantRides', incomingRide.id), {
                status: 'rejected',
                updatedAt: new Date().toISOString()
            });
            setIncomingRide(null); // Modalı kapat
        } catch (error) {
            console.error("Yolculuk reddedilirken hata:", error);
        }
    };

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

    const handleCreateTrip = async () => {
        if (!origin || !destination || !price) {
            Alert.alert('Eksik Bilgi', 'Lütfen kalkış, varış ve ücret alanlarını doldurun.');
            return;
        }

        setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) {
                Alert.alert('Hata', 'Kullanıcı girişi bulunamadı.');
                return;
            }

            const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
            const { distance, path } = calculateRoute(origin, destination);

            await addDoc(collection(db, 'Trips'), {
                driverId: user.uid,
                origin,
                destination,
                route: path,
                distance,
                date: formattedDate,
                time: `${selectedHour}:${selectedMinute}`,
                price: Number(price),
                vehicleType: vehicle,
                status: 'Aktif',
                createdAt: new Date().toISOString()
            });

            Alert.alert('Başarılı', 'Seferiniz başarıyla oluşturuldu!');
            setOrigin('');
            setDestination('');
            setDate(new Date());
            setSelectedHour('12');
            setSelectedMinute('00');
            setPrice('');
            setActiveTab('Seferlerim');
        } catch (error: any) {
            console.error("Sefer oluşturma hatası:", error);
            Alert.alert('Hata', 'Sefer oluşturulurken bir hata oluştu: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Sekmelerin Render Fonksiyonları
    const handleAcceptReservation = async (reservationId: string) => {
        try {
            await updateDoc(doc(db, 'Reservations', reservationId), {
                status: 'Onaylandı'
            });
            Alert.alert('Bilgi', 'Rezervasyon talebi onaylandı.');
        } catch (error: any) {
            Alert.alert('Hata', 'Onaylama işlemi başarısız: ' + error.message);
        }
    };

    const handleRejectReservation = async (reservationId: string) => {
        try {
            await updateDoc(doc(db, 'Reservations', reservationId), {
                status: 'Reddedildi'
            });
            Alert.alert('Bilgi', 'Rezervasyon talebi reddedildi.');
        } catch (error: any) {
            Alert.alert('Hata', 'Reddetme işlemi başarısız: ' + error.message);
        }
    };

    const renderYeniSefer = () => (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
        >
            <ScrollView
                contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <Text style={styles.sectionTitle}>🗺️ Yeni Sefer Oluştur</Text>

                <View style={styles.card}>
                    <Text style={styles.label}>Nereden</Text>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalCityScroll}>
                        {cities.map((city) => (
                            <TouchableOpacity
                                key={`origin-${city}`}
                                style={[styles.cityRow, origin === city && styles.activeCityRow]}
                                onPress={() => setOrigin(city)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.cityRowText, origin === city && styles.activeCityRowText]}>{city}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Text style={styles.label}>Nereye</Text>
                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalCityScroll}>
                        {cities.map((city) => (
                            <TouchableOpacity
                                key={`dest-${city}`}
                                style={[styles.cityRow, destination === city && styles.activeCityRow]}
                                onPress={() => setDestination(city)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.cityRowText, destination === city && styles.activeCityRowText]}>{city}</Text>
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
                            {`${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`}
                        </Text>
                    </TouchableOpacity>
                    {showDatePicker && (
                        <DateTimePicker
                            value={date}
                            mode="date"
                            display="default"
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false);
                                if (selectedDate) setDate(selectedDate);
                            }}
                        />
                    )}

                    <Text style={styles.label}>Kalkış Saati</Text>
                    <View style={styles.row}>
                        <View style={[styles.flex1, { marginRight: 8 }]}>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => { setShowHourPicker(!showHourPicker); setShowMinutePicker(false); setShowDatePicker(false); }}
                                activeOpacity={0.8}
                            >
                                <Text style={{ color: '#FFFFFF', fontSize: 16 }}>{selectedHour} (Saat)</Text>
                            </TouchableOpacity>
                            {showHourPicker && (
                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalTimeScroll}>
                                    {hours.map((h) => (
                                        <TouchableOpacity
                                            key={`hour-${h}`}
                                            style={[styles.timeRow, selectedHour === h && styles.activeTimeRow]}
                                            onPress={() => {
                                                setSelectedHour(h);
                                                setShowHourPicker(false);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.timeRowText, selectedHour === h && styles.activeTimeRowText]}>{h}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                        <View style={[styles.flex1, { marginLeft: 8 }]}>
                            <TouchableOpacity
                                style={styles.input}
                                onPress={() => { setShowMinutePicker(!showMinutePicker); setShowHourPicker(false); setShowDatePicker(false); }}
                                activeOpacity={0.8}
                            >
                                <Text style={{ color: '#FFFFFF', fontSize: 16 }}>{selectedMinute} (Dakika)</Text>
                            </TouchableOpacity>
                            {showMinutePicker && (
                                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true} style={styles.verticalTimeScroll}>
                                    {minutes.map((m) => (
                                        <TouchableOpacity
                                            key={`minute-${m}`}
                                            style={[styles.timeRow, selectedMinute === m && styles.activeTimeRow]}
                                            onPress={() => {
                                                setSelectedMinute(m);
                                                setShowMinutePicker(false);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={[styles.timeRowText, selectedMinute === m && styles.activeTimeRowText]}>{m}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            )}
                        </View>
                    </View>

                    <Text style={styles.label}>Kişi Başı Ücret (TL)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Örn: 500"
                        placeholderTextColor="#AAAAAA"
                        keyboardType="numeric"
                        value={price}
                        onChangeText={setPrice}
                    />

                    <Text style={styles.label}>Araç Tipi</Text>
                    <View style={styles.vehicleButtons}>
                        {['Sedan', 'SUV', 'Minivan'].map((type) => (
                            <TouchableOpacity
                                key={type}
                                style={[styles.vehicleButton, vehicle === type && styles.activeVehicleButton]}
                                onPress={() => setVehicle(type)}
                            >
                                <Text style={[styles.vehicleText, vehicle === type && styles.activeVehicleText]}>
                                    {type}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={styles.primaryButton}
                        onPress={handleCreateTrip}
                        activeOpacity={0.8}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text style={styles.primaryButtonText}>Seferi Kaydet 🚗</Text>
                        )}
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );

    const renderSeferlerim = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>📂 Aktif Seferlerim & Talepler</Text>

            {trips.length === 0 ? (
                <Text style={{ color: '#AAAAAA' }}>Henüz kayıtlı bir seferiniz yok.</Text>
            ) : (
                trips.map((trip: any) => (
                    <View key={trip.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.tripRoute}>{trip.origin} ➔ {trip.destination}</Text>
                            <Text style={[styles.tripStatus, trip.status === 'İptal Edildi' && { backgroundColor: 'transparent', color: '#F44336' }]}>
                                {trip.status}
                            </Text>
                        </View>
                        <Text style={styles.tripDetail}>📅 {trip.date} - 🕒 {trip.time}</Text>
                        <Text style={styles.tripDetail}>💵 {trip.price} TL (Kişi Başı)</Text>

                        {/* Rezervasyon talepleri */}
                        {(() => {
                            const tripReservations = reservations.filter(r => r.tripId === trip.id && (r.status === 'Bekliyor' || r.status === 'Onaylandı'));
                            if (tripReservations.length === 0) return null;

                            return (
                                <>
                                    <View style={styles.divider} />
                                    <Text style={styles.subTitle}>Rezervasyonlar ({tripReservations.length})</Text>
                                    {tripReservations.map(req => (
                                        <View key={req.id} style={styles.requestItem}>
                                            <View>
                                                <Text style={styles.requestName}>
                                                    Yolcu ID: {req.passengerId.substring(0, 5)}...
                                                </Text>
                                                <Text style={[styles.requestDetail, {
                                                    color: req.status === 'Onaylandı' ? '#4CAF50' : '#FF9800',
                                                    fontWeight: 'bold'
                                                }]}>
                                                    Durum: {req.status}
                                                </Text>
                                            </View>
                                            {req.status === 'Bekliyor' && (
                                                <View style={styles.actionButtons}>
                                                    <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptReservation(req.id)}>
                                                        <Text style={styles.actionButtonText}>✓</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={styles.rejectButton} onPress={() => handleRejectReservation(req.id)}>
                                                        <Text style={styles.actionButtonText}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                </>
                            );
                        })()}

                        {trip.status === 'Aktif' && (
                            <View style={{ gap: 10 }}>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { backgroundColor: '#4CAF50', marginBottom: 0 }]}
                                    activeOpacity={0.8}
                                    onPress={async () => {
                                        Alert.alert(
                                            "Seferi Tamamla",
                                            "Bu seferi tamamlandı olarak işaretlemek istediğinize emin misiniz? (Yolculara değerlendirme bildirimi gidecektir)",
                                            [
                                                { text: "Vazgeç", style: "cancel" },
                                                {
                                                    text: "Evet, Tamamla", onPress: async () => {
                                                        try {
                                                            await updateDoc(doc(db, 'Trips', trip.id), { status: 'Tamamlandı' });
                                                            Alert.alert('Bilgi', 'Sefer başarıyla tamamlandı!');
                                                        } catch (error: any) {
                                                            Alert.alert('Hata', 'Sefer güncellenemedi: ' + error.message);
                                                        }
                                                    }
                                                }
                                            ]
                                        );
                                    }}
                                >
                                    <Text style={styles.primaryButtonText}>Seferi Tamamla</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.dangerButton}
                                    activeOpacity={0.8}
                                    onPress={async () => {
                                        Alert.alert(
                                            "Emin misiniz?",
                                            "Bu seferi iptal etmek istediğinize emin misiniz?",
                                            [
                                                { text: "Vazgeç", style: "cancel" },
                                                {
                                                    text: "Evet, İptal Et", style: "destructive", onPress: async () => {
                                                        await updateDoc(doc(db, 'Trips', trip.id), { status: 'İptal Edildi' });
                                                        Alert.alert('Bilgi', 'Seferiniz iptal edildi.');
                                                    }
                                                }
                                            ]
                                        );
                                    }}
                                >
                                    <Text style={styles.dangerButtonText}>Seferi İptal Et</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                ))
            )}
        </ScrollView>
    );

    const renderTalepler = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>🔔 Anlık Sürüş Talepleri</Text>

            {activeInstantRides.length === 0 ? (
                <Text style={{ color: '#AAAAAA' }}>Şu anda bekleyen veya aktif bir talebiniz yok.</Text>
            ) : (
                activeInstantRides.map((ride: any) => (
                    <View key={ride.id} style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Text style={styles.tripRoute}>Yolcu: {ride.passengerName}</Text>
                            <Text style={[styles.tripStatus, ride.status === 'rejected' && { backgroundColor: 'transparent', color: '#F44336' }]}>
                                {ride.status === 'pending' ? 'Bekliyor' :
                                    ride.status === 'accepted' ? 'Kabul Edildi' :
                                        ride.status === 'completed' ? 'Tamamlandı' : 'İptal/Red'}
                            </Text>
                        </View>
                        <Text style={styles.tripDetail}>📍 {ride.origin} ➔ {ride.destination}</Text>
                        <Text style={styles.tripDetail}>💵 {ride.price} TL</Text>
                        <Text style={styles.tripDetail}>📅 {new Date(ride.createdAt).toLocaleString('tr-TR')}</Text>

                        {ride.status === 'pending' && (
                            <View style={[styles.row, { marginTop: 15, gap: 10 }]}>
                                <TouchableOpacity
                                    style={[styles.dangerButtonOutline, { flex: 1, paddingVertical: 10 }]}
                                    onPress={async () => {
                                        await updateDoc(doc(db, 'InstantRides', ride.id), { status: 'rejected' });
                                    }}
                                >
                                    <Text style={styles.dangerButtonText}>Reddet</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 1, marginTop: 0, paddingVertical: 10 }]}
                                    onPress={async () => {
                                        await updateDoc(doc(db, 'InstantRides', ride.id), { status: 'accepted' });
                                    }}
                                >
                                    <Text style={styles.primaryButtonText}>Kabul Et</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {ride.status === 'accepted' && (
                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: '#4CAF50', marginTop: 15 }]}
                                onPress={async () => {
                                    await updateDoc(doc(db, 'InstantRides', ride.id), { status: 'completed' });
                                    Alert.alert("Başarılı", "Sürüş tamamlandı olarak işaretlendi!");
                                }}
                            >
                                <Text style={styles.primaryButtonText}>Sürüşü Tamamla</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ))
            )}
        </ScrollView>
    );

    const renderHarita = () => {
        // Yolcunun konumunu göstermek için kabul ettiğimiz veya beklemede olan aktif bir yolculuk olup olmadığını kontrol eder.
        const activeRide = activeInstantRides.find(r => r.status === 'accepted' || r.status === 'pending');

        return (
            <View style={{ flex: 1 }}>
                {currentLocation ? (
                    <MapView
                        style={{ flex: 1 }}
                        initialRegion={{
                            latitude: currentLocation.coords.latitude,
                            longitude: currentLocation.coords.longitude,
                            latitudeDelta: 0.05,
                            longitudeDelta: 0.05,
                        }}
                        showsUserLocation={true}
                    >
                        {/* Yolcunun konumu (Eğer bir aktif/bekleyen talep varsa) */}
                        {activeRide && activeRide.passengerLat && activeRide.passengerLng && (
                            <Marker
                                coordinate={{ latitude: activeRide.passengerLat, longitude: activeRide.passengerLng }}
                                title={activeRide.passengerName}
                                description="Yolcu Konumu"
                            >
                                <Text style={{ fontSize: 30 }}>🚶</Text>
                            </Marker>
                        )}
                    </MapView>
                ) : (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#FF9800" />
                        <Text style={{ color: '#FFF', marginTop: 10 }}>Konum Bekleniyor...</Text>
                        {!isOnline && (
                            <Text style={{ color: '#AAAAAA', marginTop: 5 }}>Toplayabilmek için Online olmalısınız.</Text>
                        )}
                    </View>
                )}

                {/* Sürücü Harita Bilgi Kutusu */}
                {activeRide && (
                    <View style={styles.mapActionOverlay}>
                        <Text style={{ color: '#FF9800', fontSize: 16, fontWeight: 'bold', marginBottom: 5 }}>
                            {activeRide.status === 'pending' ? 'Yeni Çağrı!' : 'Yolcuya Gidiliyor'}
                        </Text>
                        <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Yolcu: {activeRide.passengerName}</Text>
                        <Text style={{ color: '#AAAAAA' }}>Hedef: {activeRide.destination}</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderKazanc = () => {
        const approvedReservations = reservations.filter(r => r.status === 'Onaylandı');
        const totalEarnings = approvedReservations.reduce((sum, req) => {
            const tempPrice = parseFloat(req.tripInfo?.price || '0');
            return sum + (isNaN(tempPrice) ? 0 : tempPrice);
        }, 0);

        return (
            <View style={styles.scrollContent}>
                <Text style={styles.sectionTitle}>💰 Kazanç Raporu</Text>

                <View style={styles.earningsGrid}>
                    <View style={[styles.earningCard, { backgroundColor: '#FF9800' }]}>
                        <Text style={styles.earningLabel}>Toplam Kazanç</Text>
                        <Text style={styles.earningValue}>₺ {totalEarnings.toLocaleString('tr-TR')}</Text>
                    </View>
                    <View style={[styles.earningCard, { backgroundColor: '#333333' }]}>
                        <Text style={styles.earningLabel}>Onaylı Bilet</Text>
                        <Text style={styles.earningValue}>{approvedReservations.length}</Text>
                    </View>
                </View>

                <View style={styles.card}>
                    <Text style={styles.subTitle}>Onaylanan İşlemler</Text>
                    {approvedReservations.length === 0 ? (
                        <Text style={{ color: '#AAAAAA' }}>Henüz onaylanmış bir işleminiz yok.</Text>
                    ) : (
                        approvedReservations.map(req => (
                            <View key={req.id} style={styles.historyItem}>
                                <Text style={styles.historyRoute}>{req.tripInfo?.origin} ➔ {req.tripInfo?.destination}</Text>
                                <Text style={styles.historyAmount}>+ ₺{req.tripInfo?.price}</Text>
                            </View>
                        ))
                    )}
                </View>
            </View>
        );
    };

    const renderProfil = () => (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>👤 Sürücü Profili</Text>

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

                <View style={styles.row}>
                    <View style={{ alignItems: 'center', marginHorizontal: 20 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' }}>
                            ⭐ {reviews.length > 0 ? (reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length).toFixed(1) : '5.0'}
                        </Text>
                        <Text style={{ color: '#AAAAAA', fontSize: 14 }}>Ortalama Puan</Text>
                    </View>
                    <View style={{ alignItems: 'center', marginHorizontal: 20 }}>
                        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' }}>{reviews.length}</Text>
                        <Text style={{ color: '#AAAAAA', fontSize: 14 }}>Değerlendirme</Text>
                    </View>
                </View>
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
                    <Text style={{ color: '#FF9800', fontWeight: 'bold' }}>{userData ? userData.role : 'Sürücü'}</Text>
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

            <View style={styles.card}>
                <Text style={styles.subTitle}>Son Değerlendirmeler</Text>
                {reviews.length === 0 ? (
                    <Text style={{ color: '#AAAAAA' }}>Henüz bir değerlendirme almadınız.</Text>
                ) : (
                    reviews.slice(0, 5).map((rev) => (
                        <View key={rev.id} style={{ borderBottomWidth: 1, borderBottomColor: '#333', paddingVertical: 12 }}>
                            <View style={[styles.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
                                <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{rev.passengerName}</Text>
                                <Text style={{ color: '#FFC107' }}>
                                    {[...Array(5)].map((_, i) => (i < rev.rating ? '★' : '☆')).join('')}
                                </Text>
                            </View>
                            {rev.comment ? (
                                <Text style={{ color: '#AAAAAA', fontStyle: 'italic', marginBottom: 6 }}>"{rev.comment}"</Text>
                            ) : null}
                            <Text style={{ color: '#666', fontSize: 12 }}>
                                {new Date(rev.createdAt).toLocaleDateString('tr-TR')}
                            </Text>
                        </View>
                    ))
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
                <Text style={styles.headerTitle}>Sürücü Paneli</Text>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <SwipeToggle isOnline={isOnline} onToggle={toggleOnlineStatus} loading={loading} />

                    <TouchableOpacity style={styles.profileBadge} onPress={() => setActiveTab('Profil')} activeOpacity={0.8}>
                        <Text style={styles.profileInitials}>
                            {userData ? userData.fullName?.substring(0, 2).toUpperCase() : 'US'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* İçerik Alanı */}
            <View style={styles.contentArea}>
                {activeTab === 'YeniSefer' && renderYeniSefer()}
                {activeTab === 'Seferlerim' && renderSeferlerim()}
                {activeTab === 'Talepler' && renderTalepler()}
                {activeTab === 'Harita' && renderHarita()}
                {activeTab === 'Kazanc' && renderKazanc()}
                {activeTab === 'Profil' && renderProfil()}
            </View>

            {/* Gelen Anlık Sürüş İsteği Modalı */}
            {incomingRide && (
                <Modal
                    transparent={true}
                    visible={!!incomingRide}
                    animationType="slide"
                    onRequestClose={() => { }}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>🎉 Yeni Sürüş İsteği!</Text>

                            <View style={{ width: '100%', marginBottom: 20 }}>
                                <View style={styles.historyItem}>
                                    <Text style={{ color: '#AAAAAA' }}>Yolcu:</Text>
                                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{incomingRide.passengerName}</Text>
                                </View>
                                <View style={styles.historyItem}>
                                    <Text style={{ color: '#AAAAAA' }}>Güzergah:</Text>
                                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{incomingRide.origin} ➔ {incomingRide.destination}</Text>
                                </View>
                                <View style={styles.historyItem}>
                                    <Text style={{ color: '#AAAAAA' }}>Araç Tipi:</Text>
                                    <Text style={{ color: '#FFF', fontWeight: 'bold' }}>{incomingRide.vehicleType}</Text>
                                </View>
                                <View style={[styles.historyItem, { borderBottomWidth: 0, marginTop: 10, alignItems: 'center', justifyContent: 'center' }]}>
                                    <Text style={{ color: '#4CAF50', fontSize: 24, fontWeight: 'bold' }}>₺ {incomingRide.price}</Text>
                                </View>
                            </View>

                            <View style={[styles.row, { width: '100%', gap: 10 }]}>
                                <TouchableOpacity
                                    style={[styles.dangerButtonOutline, { flex: 1 }]}
                                    onPress={handleRejectInstantRide}
                                >
                                    <Text style={styles.dangerButtonText}>Reddet</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.primaryButton, { flex: 1, marginTop: 0 }]}
                                    onPress={handleAcceptInstantRide}
                                >
                                    <Text style={styles.primaryButtonText}>Kabul Et</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            )}

            {/* Alt Menü (Bottom Navigation) */}
            <View style={styles.bottomNav}>
                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('YeniSefer')}
                >
                    <Text style={[styles.navIcon, activeTab === 'YeniSefer' && styles.activeNavIcon]}>⊕</Text>
                    <Text style={[styles.navText, activeTab === 'YeniSefer' && styles.activeNavText]}>Yeni</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Seferlerim')}
                >
                    <Text style={[styles.navIcon, activeTab === 'Seferlerim' && styles.activeNavIcon]}>📋</Text>
                    <Text style={[styles.navText, activeTab === 'Seferlerim' && styles.activeNavText]}>Seferler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Talepler')}
                >
                    <Text style={[styles.navIcon, activeTab === 'Talepler' && styles.activeNavIcon]}>🔔</Text>
                    <Text style={[styles.navText, activeTab === 'Talepler' && styles.activeNavText]}>Talepler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Harita')}
                >
                    <Text style={[styles.navIcon, activeTab === 'Harita' && styles.activeNavIcon]}>🗺️</Text>
                    <Text style={[styles.navText, activeTab === 'Harita' && styles.activeNavText]}>Harita</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navItem}
                    onPress={() => setActiveTab('Kazanc')}
                >
                    <Text style={[styles.navIcon, activeTab === 'Kazanc' && styles.activeNavIcon]}>💵</Text>
                    <Text style={[styles.navText, activeTab === 'Kazanc' && styles.activeNavText]}>Kazanç</Text>
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
        paddingTop: 40, // Güvenli alan (SafeAreaView padding)
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
        marginBottom: 20,
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
    verticalTimeScroll: {
        maxHeight: 140,
        backgroundColor: '#2A2A2A',
        borderRadius: 12,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#333333',
    },
    timeRow: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    activeTimeRow: {
        backgroundColor: 'rgba(255, 152, 0, 0.15)',
    },
    timeRowText: {
        color: '#AAAAAA',
        fontSize: 16,
        fontWeight: '500',
    },
    activeTimeRowText: {
        color: '#FF9800',
        fontWeight: 'bold',
    },
    row: {
        flexDirection: 'row',
    },
    flex1: {
        flex: 1,
    },
    vehicleButtons: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 24,
    },
    vehicleButton: {
        flex: 1,
        backgroundColor: '#333333',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333333',
    },
    activeVehicleButton: {
        borderColor: '#FF9800',
        backgroundColor: 'rgba(255, 152, 0, 0.1)',
    },
    vehicleText: {
        color: '#AAAAAA',
        fontWeight: '600',
    },
    activeVehicleText: {
        color: '#FF9800',
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
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    tripRoute: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    tripStatus: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        color: '#4CAF50',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 'bold',
    },
    tripDetail: {
        color: '#AAAAAA',
        fontSize: 14,
        marginBottom: 6,
    },
    divider: {
        height: 1,
        backgroundColor: '#333333',
        marginVertical: 16,
    },
    subTitle: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 12,
    },
    requestItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#333333',
        padding: 12,
        borderRadius: 10,
        marginBottom: 16,
    },
    requestName: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 15,
    },
    requestDetail: {
        color: '#AAAAAA',
        fontSize: 12,
        marginTop: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    acceptButton: {
        backgroundColor: '#4CAF50',
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rejectButton: {
        backgroundColor: '#F44336',
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    dangerButton: {
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
        borderWidth: 1,
        borderColor: '#F44336',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    dangerButtonText: {
        color: '#F44336',
        fontWeight: '600',
    },
    earningsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 16,
    },
    earningCard: {
        flex: 1,
        padding: 20,
        borderRadius: 16,
        alignItems: 'flex-start',
    },
    earningLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '500',
    },
    earningValue: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#333333',
    },
    historyRoute: {
        color: '#FFFFFF',
        fontSize: 15,
    },
    historyAmount: {
        color: '#4CAF50',
        fontWeight: 'bold',
    },
    bottomNav: {
        flexDirection: 'row',
        backgroundColor: '#1E1E1E',
        paddingVertical: 12,
        paddingBottom: 24, // iOS Home Indicator için
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
    dangerButtonOutline: {
        borderWidth: 1,
        borderColor: '#F44336',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    onlineToggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#555555'
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
    }
});
