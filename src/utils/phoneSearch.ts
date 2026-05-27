function digitsOnly(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function getRussianPhoneSearchVariants(value: unknown) {
  const digits = digitsOnly(value);
  if (!digits) return [];

  const variants = new Set<string>([digits]);

  if (digits.length === 10) {
    variants.add(`7${digits}`);
    variants.add(`8${digits}`);
  }

  if (digits.length >= 2 && (digits.startsWith('7') || digits.startsWith('8'))) {
    const rest = digits.slice(1);
    variants.add(`7${rest}`);
    variants.add(`8${rest}`);
    variants.add(rest);
  }

  return [...variants].filter(Boolean);
}

export function phoneMatchesSearch(phone: unknown, query: string) {
  const phoneVariants = getRussianPhoneSearchVariants(phone);
  const queryVariants = getRussianPhoneSearchVariants(query);

  if (phoneVariants.length === 0 || queryVariants.length === 0) return false;

  return queryVariants.some(queryVariant =>
    phoneVariants.some(phoneVariant => phoneVariant.includes(queryVariant)),
  );
}
