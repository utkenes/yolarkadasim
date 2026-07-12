import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AuthScreen from '../src/screens/AuthScreen';
import PassengerDashboardScreen from '../src/screens/PassengerDashboardScreen';
import DriverDashboardScreen from '../src/screens/DriverDashboardScreen';

export default function AppIndex() {
    const [currentScreen, setCurrentScreen] = useState<'Auth' | 'Passenger' | 'Driver'>('Auth');

    const handleLogin = (role: 'Yolcu' | 'Sürücü') => {
        if (role === 'Yolcu') setCurrentScreen('Passenger');
        else setCurrentScreen('Driver');
    };

    const handleLogout = () => {
        setCurrentScreen('Auth');
    };

    return (
        <View style={styles.container}>
            {currentScreen === 'Auth' && <AuthScreen onLogin={handleLogin} />}
            {currentScreen === 'Passenger' && <PassengerDashboardScreen onLogout={handleLogout} />}
            {currentScreen === 'Driver' && <DriverDashboardScreen onLogout={handleLogout} />}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
});
