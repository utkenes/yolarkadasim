export const BASE_PRICE_PER_KM = 1.2; // km başına temel ücret(TL)
export const VEHICLE_MULTIPLIERS: Record<string, number> = {
    "Sedan": 1.0,
    "SUV": 1.2,
    "Minivan": 0.85
};

/**
 * Mesafe ve araç tipine göre tahmini bir ücret hesaplar (Kişi Başı)
 * @param distance Mesafe (km)
 * @param vehicleType Araç tipi ("Sedan", "SUV", "Minivan")
 * @returns Önerilen Ücret (TL)
 */
export const calculateSuggestedPrice = (distance: number, vehicleType: string): number => {
    if (distance <= 0) return 0;

    const multiplier = VEHICLE_MULTIPLIERS[vehicleType] || 1.0;
    const rawPrice = distance * BASE_PRICE_PER_KM * multiplier;

    // Fiyatı 10'un katlarına yuvarla ki daha düzgün görünsün
    return Math.round(rawPrice / 10) * 10;
};
