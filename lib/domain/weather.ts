export const RAIN_DELAY_THRESHOLD = 60;

export function outdoorDelay(probability: number | null): boolean {
  return probability !== null && probability >= RAIN_DELAY_THRESHOLD;
}

export function weatherPhrase(code: number): string {
  if (code === 0) return "céu limpo";
  if (code <= 3) return "nublado";
  if (code <= 48) return "neblina";
  if (code <= 67) return "chuva";
  if (code <= 77) return "neve";
  if (code <= 82) return "chuva";
  if (code <= 86) return "neve";
  return "tempestade";
}
