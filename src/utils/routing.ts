// Şehirler arası mesafe grafı (Örnek mesafeler, km cinsinden)
const cityGraph: Record<string, Record<string, number>> = {
    "İstanbul": { "Kocaeli": 100, "Bursa": 150 },
    "Kocaeli": { "İstanbul": 100, "Ankara": 350, "Bursa": 130 },
    "Bursa": { "İstanbul": 150, "Kocaeli": 130, "İzmir": 330, "Ankara": 380 },
    "İzmir": { "Bursa": 330, "Antalya": 450, "Konya": 550 },
    "Ankara": { "Kocaeli": 350, "Bursa": 380, "Konya": 260, "Adana": 490 },
    "Konya": { "Ankara": 260, "İzmir": 550, "Antalya": 300, "Adana": 350 },
    "Antalya": { "İzmir": 450, "Konya": 300 },
    "Adana": { "Ankara": 490, "Konya": 350 }
};

export interface RouteResult {
    distance: number;
    path: string[];
}

/**
 * İki şehir arasındaki en kısa yolu ve mesafeyi hesaplar (Dijkstra Algoritması)
 */
export const calculateRoute = (origin: string, destination: string): RouteResult => {
    if (origin === destination) return { distance: 0, path: [origin] };
    if (!cityGraph[origin] || !cityGraph[destination]) return { distance: 0, path: [] };

    const distances: Record<string, number> = {};
    const previous: Record<string, string | null> = {};
    const unvisited = new Set<string>();

    // Başlangıç değerlerini ata
    for (const city in cityGraph) {
        distances[city] = Infinity;
        previous[city] = null;
        unvisited.add(city);
    }
    distances[origin] = 0;

    while (unvisited.size > 0) {
        // Ziyaret edilmemiş ve en kısa mesafeye sahip şehri bul
        let currNode: string | null = null;
        let minDistance = Infinity;

        for (const city of unvisited) {
            if (distances[city] < minDistance) {
                minDistance = distances[city];
                currNode = city;
            }
        }

        if (currNode === null || currNode === destination) break;

        unvisited.delete(currNode);

        for (const neighbor in cityGraph[currNode]) {
            const newDist = distances[currNode] + cityGraph[currNode][neighbor];
            if (newDist < distances[neighbor]) {
                distances[neighbor] = newDist;
                previous[neighbor] = currNode;
            }
        }
    }

    // Yolu geri doğru oluştur
    const path: string[] = [];
    let current: string | null = destination;
    while (current !== null) {
        path.unshift(current);
        current = previous[current];
    }

    // Eğer yol bulunamadıysa veya bağlantısızsa
    if (path[0] !== origin) return { distance: 0, path: [] };

    return {
        distance: distances[destination],
        path
    };
};
