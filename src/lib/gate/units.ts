export const CURRENCIES: Record<string, string[]> = {
  EUR: ["€", "eur", "euro", "euros"],
  USD: ["$", "usd", "dollar", "dollars"],
  GBP: ["£", "gbp", "pound", "pounds"],
};

export const QUANTITY_UNITS: Record<string, string[]> = {
  t: ["tonne", "tonnes", "ton", "tons", "tonnellata", "tonnellate", "mt", "t"],
  kg: ["kg", "kilo", "kilos", "kilogram", "kilograms", "chilogrammi"],
  pallet: ["pallet", "pallets", "bancale", "bancali"],
};

function aliasPresent(text: string, alias: string): boolean {
  if (/^\p{L}+$/u.test(alias)) {
    return new RegExp(`(?<!\\p{L})${alias}(?!\\p{L})`, "iu").test(text);
  }
  return text.includes(alias);
}

/** Does the quote contain a written form of the claimed canonical unit? */
export function unitInText(table: Record<string, string[]>, canonical: string, text: string): boolean {
  const aliases = table[canonical];
  return !!aliases && aliases.some((a) => aliasPresent(text, a));
}
