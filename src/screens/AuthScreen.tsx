import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { auth, db } from '../config/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function AuthScreen({ onLogin }: { onLogin?: (role: 'Yolcu' | 'Sürücü') => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState<'Yolcu' | 'Sürücü'>('Yolcu');

  // Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password || (!isLogin && (!fullName || !username || !phone))) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        console.log('Login attempt:', { email });
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Firestore'dan rol bilgisini çekiyoruz
        const userDocRef = doc(db, 'Users', user.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();

          if (userData.role !== role) {
            Alert.alert(
              'Rol Uyuşmazlığı',
              `Bu hesap bir ${userData.role} hesabıdır. Lütfen üst kısımdan doğru rolü seçerek tekrar giriş yapın.`
            );
            // Uyarı gösterildikten sonra Firebase oturumunu kapatıyoruz (isteğe bağlı)
            auth.signOut();
            return;
          }

          if (onLogin) onLogin(userData.role as 'Yolcu' | 'Sürücü');
        } else {
          Alert.alert('Hata', 'Kullanıcı verisi bulunamadı.');
        }

      } else {
        console.log('Register attempt:', { email, role });
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Kullanıcıyı Firestore'a kaydediyoruz
        await setDoc(doc(db, 'Users', user.uid), {
          uid: user.uid,
          username,
          email,
          role,
          fullName,
          phone,
          walletBalance: 0,
          rating: 5.0,
          reviewCount: 0,
          createdAt: new Date().toISOString()
        });

        Alert.alert('Başarılı', 'Hesabınız oluşturuldu. Hoş geldiniz!');
        if (onLogin) onLogin(role);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      Alert.alert('Kimlik Doğrulama Hatası', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Başlık ve Karşılama Alanı */}
        <View style={styles.headerContainer}>
          <Text style={styles.title}>
            {isLogin ? 'Hoş Geldiniz 🚙' : 'Aramıza Katılın 🚀'}
          </Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? 'Yolculuğa devam etmek için giriş yapın.'
              : 'Yeni nesil yolculuk paylaşımına katılın.'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* Giriş / Kayıt Geçiş Sekmeleri */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, isLogin && styles.activeTab]}
              onPress={() => setIsLogin(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isLogin && styles.activeTabText]}>
                Giriş Yap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, !isLogin && styles.activeTab]}
              onPress={() => setIsLogin(false)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, !isLogin && styles.activeTabText]}>
                Kayıt Ol
              </Text>
            </TouchableOpacity>
          </View>

          {/* Rol Seçimi (Hem Giriş hem Kayıt için) */}
          <View style={styles.roleContainer}>
            <Text style={styles.label}>Rolünüzü Seçin</Text>
            <View style={styles.roleButtons}>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'Yolcu' && styles.activeRoleButton,
                ]}
                onPress={() => setRole('Yolcu')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === 'Yolcu' && styles.activeRoleText,
                  ]}
                >
                  Yolcu
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleButton,
                  role === 'Sürücü' && styles.activeRoleButton,
                ]}
                onPress={() => setRole('Sürücü')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === 'Sürücü' && styles.activeRoleText,
                  ]}
                >
                  Sürücü
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.label}>E-Posta</Text>
          <TextInput
            style={styles.input}
            placeholder="E-Posta adresinizi girin"
            placeholderTextColor="#AAAAAA"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {/* Sadece Kayıt modunda görünecek ekstra bilgi alanları */}
          {!isLogin && (
            <>
              <Text style={styles.label}>Ad Soyad</Text>
              <TextInput
                style={styles.input}
                placeholder="Adınızı ve soyadınızı girin"
                placeholderTextColor="#AAAAAA"
                value={fullName}
                onChangeText={setFullName}
              />

              <Text style={styles.label}>Kullanıcı Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Platformda görünecek adınız"
                placeholderTextColor="#AAAAAA"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Telefon Numarası</Text>
              <TextInput
                style={styles.input}
                placeholder="05XX XXX XX XX"
                placeholderTextColor="#AAAAAA"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </>
          )}

          {/* Ortak Alanlar (Şifre) */}
          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            placeholder="Şifrenizi girin"
            placeholderTextColor="#AAAAAA"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isLogin ? 'Giriş Yap' : 'Hesabımı Oluştur'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  headerContainer: {
    marginBottom: 40,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#AAAAAA',
  },
  formContainer: {
    width: '100%',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#333333',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#FF9800',
  },
  tabText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
    marginTop: 12,
  },
  input: {
    backgroundColor: '#333333',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 8,
  },
  roleContainer: {
    marginBottom: 12,
  },
  roleButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  roleButton: {
    flex: 1,
    backgroundColor: '#333333',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333333',
  },
  activeRoleButton: {
    borderColor: '#FF9800',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
  },
  roleText: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '600',
  },
  activeRoleText: {
    color: '#FF9800',
  },
  primaryButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    shadowColor: '#FF9800',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
