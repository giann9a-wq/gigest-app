"use client";

import { useEffect, useMemo, useState } from "react";

const FAVORITES_KEY = "gigest.weather.recentCities";

type WeatherCityPickerProps = {
  currentCity: string;
  searchedCity: string;
};

function readFavorites() {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(cities: string[]) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(cities.slice(0, 3)));
}

function cityHref(city: string) {
  return `/dashboard?meteo=${encodeURIComponent(city)}`;
}

export function WeatherCityPicker({ currentCity, searchedCity }: WeatherCityPickerProps) {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const storedFavorites = readFavorites();
    const shouldRemember = searchedCity.trim().length > 0;

    if (!shouldRemember) {
      setFavorites(storedFavorites);
      return;
    }

    const nextFavorites = [
      currentCity,
      ...storedFavorites.filter((city) => city.toLowerCase() !== currentCity.toLowerCase()),
    ].slice(0, 3);

    writeFavorites(nextFavorites);
    setFavorites(nextFavorites);
  }, [currentCity, searchedCity]);

  const visibleFavorites = useMemo(() => favorites.slice(0, 3), [favorites]);

  return (
    <details className="dashboard-weather-city-picker">
      <summary>Cambia citta</summary>
      <div className="dashboard-weather-city-popover">
        <form action="/dashboard" className="dashboard-weather-city-form">
          <label>
            <span>Scrivi una nuova citta</span>
            <input
              name="meteo"
              type="search"
              placeholder="Cancella e digita, es. Milano"
              defaultValue={currentCity}
              aria-label="Nuova citta meteo"
            />
          </label>
          <small>Cancella il testo attuale o selezionalo, poi inserisci la localita.</small>
          <button type="submit">Mostra meteo</button>
        </form>
        {visibleFavorites.length > 0 ? (
          <div className="dashboard-weather-favorites" aria-label="Citta meteo recenti">
            <span>Preferiti recenti</span>
            <div>
              {visibleFavorites.map((city) => (
                <a key={city} href={cityHref(city)}>
                  {city}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
