import { initializeApp } from 'firebase/app';
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyBJ2-7Ar9jBA1pzcflp5qIKN_tmDRItONo",
    authDomain: "mobilprojev1.firebaseapp.com",
    projectId: "mobilprojev1",
    storageBucket: "mobilprojev1.firebasestorage.app",
    messagingSenderId: "73016736023",
    appId: "1:73016736023:web:784ec34ed742c5b1159f52"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);
